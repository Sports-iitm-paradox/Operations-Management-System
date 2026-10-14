"""Workbook import. run_import never commits: the caller previews (rollback) or commits.
Matching keys make it idempotent: member name, event code, (event, stage, start), (session, member, kind), issue reference.
Existing live records are never overwritten; nothing missing is invented."""
import datetime as dt, io, os, re
from zoneinfo import ZoneInfo
from openpyxl import load_workbook
from sqlalchemy import func
from .models import Duty, Event, EventSession, Issue, IssueHistory, User, now, utc
from .services import new_issue

TZ = ZoneInfo(os.getenv("EVENT_TZ", "Asia/Kolkata")); ROLES = {"Deputy Core": "DEPUTY_CORE", "Coordinator": "COORDINATOR"}
SEV = ("LOW", "MEDIUM", "HIGH", "CRITICAL")

def minutes(v):
    if isinstance(v, dt.datetime): return v.hour * 60 + v.minute
    if isinstance(v, dt.time): return v.hour * 60 + v.minute
    return round((float(v) % 1) * 1440)
def day_of(v): return v.date() if isinstance(v, dt.datetime) else dt.date(1899, 12, 30) + dt.timedelta(days=int(v))
def stamp(day, m): return utc(dt.datetime.combine(day_of(day), dt.time(m // 60 % 24, m % 60), TZ))

def run_import(db, data: bytes) -> dict:
    wb = load_workbook(io.BytesIO(data), data_only=True, read_only=True)
    rep = {"new": dict.fromkeys(("members", "events", "sessions", "duties", "issues"), 0), "existing": dict.fromkeys(("members", "sessions", "duties", "issues"), 0), "errors": [], "warnings": []}
    def err(sheet, row, msg): rep["errors"].append({"sheet": sheet, "row": row, "message": msg})
    for name in ("Member Directory", "Online Duty Roster", "Issue Log"):
        if name not in wb.sheetnames: err(name, 0, "Worksheet not found")
    if rep["errors"]: return rep
    cache = {}
    def person(name, sheet, row):
        if name in (None, "", "-") or not str(name).strip(): return None
        key = str(name).strip().lower()
        if key in cache: return cache[key]
        found = db.query(User).filter(func.lower(User.name) == key).all()
        if len(found) > 1: err(sheet, row, f"Ambiguous member '{name}' matches {len(found)} accounts; resolve in Team first"); cache[key] = None; return None
        if not found: found = db.query(User).filter_by(email=re.sub(r"[^a-z0-9]+", ".", key).strip(".") + "@import.invalid").all()
        if found: rep["existing"]["members"] += 1; cache[key] = found[0]; return found[0]
        x = User(email=re.sub(r"[^a-z0-9]+", ".", key).strip(".") + "@import.invalid", name=str(name).strip(), role="VOLUNTEER", active=False)
        db.add(x); db.flush(); rep["new"]["members"] += 1; cache[key] = x; return x
    for n, r in enumerate(list(wb["Member Directory"].iter_rows(values_only=True))[1:], 2):
        if not r[1]: continue
        before = rep["new"]["members"]; x = person(r[1], "Member Directory", n)
        if x and rep["new"]["members"] > before:  # only brand new accounts take values from the sheet
            x.role = ROLES.get(r[2], "VOLUNTEER"); x.phone = str(int(float(r[5]))) if r[5] else None
            boss = person(r[4], "Member Directory", n) if r[4] not in (None, "-") else None; x.reports_to_id = boss.id if boss else None
    rows = list(wb["Online Duty Roster"].iter_rows(values_only=True)); head = {c: i for i, c in enumerate(rows[0] or [])}
    miss = [c for c in ("Event ID", "Event Name", "Stage", "Date", "Start", "End", "Sports POC", "Backup Support", "Coordinator") if c not in head]
    if miss: err("Online Duty Roster", 1, "Missing columns: " + ", ".join(miss)); return rep
    for n, r in enumerate(rows[1:], 2):
        if not r[head["Event Name"]]: continue  # formatted empty rows are not records
        try:
            m1, m2 = minutes(r[head["Start"]]), minutes(r[head["End"]]); st, en = stamp(r[head["Date"]], m1), stamp(r[head["Date"]], m2)
            if m2 <= m1: en += dt.timedelta(days=1)  # session crosses midnight
        except Exception: err("Online Duty Roster", n, "Unreadable date or time"); continue
        code = str(r[head["Event ID"]]).strip(); e = db.query(Event).filter_by(code=code).first()
        if not e: e = Event(code=code, name=str(r[head["Event Name"]]).strip(), status="PUBLISHED"); db.add(e); db.flush(); rep["new"]["events"] += 1
        stage = str(r[head["Stage"]] or "Main").strip(); s = db.query(EventSession).filter_by(event_id=e.id, stage=stage, starts_at=st).first()
        if s: rep["existing"]["sessions"] += 1
        else: s = EventSession(event_id=e.id, stage=stage, starts_at=st, ends_at=en); db.add(s); db.flush(); rep["new"]["sessions"] += 1
        for col, kind in (("Sports POC", "POC"), ("Backup Support", "BACKUP"), ("Coordinator", "COORDINATOR")):
            x = person(r[head[col]], "Online Duty Roster", n)
            if not x: continue
            if db.query(Duty).filter_by(session_id=s.id, user_id=x.id, kind=kind).first(): rep["existing"]["duties"] += 1
            else: db.add(Duty(session_id=s.id, user_id=x.id, kind=kind, starts_at=s.starts_at, ends_at=s.ends_at)); rep["new"]["duties"] += 1
    events = {e.name.lower(): e for e in db.query(Event)}
    for n, r in enumerate(list(wb["Issue Log"].iter_rows(values_only=True))[1:], 2):
        if not r[6]: continue
        e = events.get(str(r[3]).strip().lower()); ref = str(r[0]).strip() if r[0] else None
        if not e: err("Issue Log", n, f"No event named '{r[3]}'. Row kept out; fix the name or create the event"); continue
        if ref and db.query(Issue).filter_by(ref=ref).first(): rep["existing"]["issues"] += 1; continue
        try:
            if isinstance(r[1], (dt.datetime, dt.date)): d0 = r[1].date() if isinstance(r[1], dt.datetime) else r[1]
            else: dd, mm, yy = str(r[1]).split("-"); d0 = dt.date(int(yy), int(mm), int(dd))
            t0 = utc(dt.datetime.combine(d0, dt.time(*divmod(minutes(r[2]), 60)) if r[2] is not None else dt.time(0, 0), TZ))
        except Exception: err("Issue Log", n, f"Unreadable date '{r[1]}'"); continue
        sev = str(r[5]).strip().upper(); sev = sev if sev in SEV else "MEDIUM"
        i = new_issue(db, None, dict(title=str(r[6])[:80], description=f"{r[6]}\nOriginal owner: {r[7]}\nOriginal resolution: {r[9]}", event_id=e.id, category="Imported", severity=sev))
        i.created_at = t0; i.ref = ref or i.ref
        if r[10] is not None:  # a closure time exists in the source, so the issue is closed
            i.status, i.resolution, i.first_response_at = "CLOSED", str(r[9]) if r[9] else None, t0
            i.closed_at = utc(dt.datetime.combine(d0, dt.time(*divmod(minutes(r[10]), 60)), TZ))
            db.add(IssueHistory(issue_id=i.id, from_status="REPORTED", to_status="CLOSED", note="Imported from workbook"))
        else: rep["warnings"].append(f"Issue row {n} ({i.ref}) has no closure time, so it was imported as open")
        rep["new"]["issues"] += 1
    return rep
