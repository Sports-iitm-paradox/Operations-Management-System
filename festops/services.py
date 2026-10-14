import datetime as dt, os, statistics, uuid
from zoneinfo import ZoneInfo
from sqlalchemy import exists, func
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from .models import Audit, Duty, Escalation, EventSession, Issue, IssueHistory, Notification, User, now, utc
from .security import MANAGE, visible_events

GRACE = int(os.getenv("CHECKIN_GRACE_MIN", "10")); TURNAROUND = int(os.getenv("TURNAROUND_MIN", "15"))
SLA = {"CRITICAL": (10, 120), "HIGH": (30, 360), "MEDIUM": (120, 1440), "LOW": (480, 4320)}  # (respond, resolve) minutes
EVENT_FLOW = {"DRAFT": {"PUBLISHED"}, "PUBLISHED": {"ACTIVE"}, "ACTIVE": {"COMPLETED"}, "COMPLETED": {"ARCHIVED"}, "ARCHIVED": set()}
FLOW = {"REPORTED": {"TRIAGED", "NEEDS_INFORMATION", "CANCELLED"}, "TRIAGED": {"ASSIGNED", "NEEDS_INFORMATION", "CANCELLED"},
        "NEEDS_INFORMATION": {"TRIAGED"}, "ASSIGNED": {"IN_PROGRESS", "CANCELLED"}, "IN_PROGRESS": {"RESOLUTION_SUBMITTED", "NEEDS_INFORMATION"},
        "RESOLUTION_SUBMITTED": {"VERIFIED", "IN_PROGRESS"}, "VERIFIED": {"CLOSED"}, "CLOSED": {"REOPENED"}, "REOPENED": {"ASSIGNED", "IN_PROGRESS"}, "CANCELLED": set()}
OPEN_STATES = {"REPORTED", "TRIAGED", "NEEDS_INFORMATION", "ASSIGNED", "IN_PROGRESS", "RESOLUTION_SUBMITTED", "REOPENED"}

def audit(db, actor, action, entity, eid=None, before=None, after=None, reason=None):
    db.add(Audit(actor_id=getattr(actor, "id", actor), action=action, entity=entity, entity_id=eid, before=before, after=after, reason=reason))

def row(o, skip=("pw_hash", "data")):
    out = {}
    for c in o.__table__.columns:
        if c.name in skip: continue
        v = getattr(o, c.name)
        out[c.name] = utc(v).isoformat() if isinstance(v, dt.datetime) else v
    return {k: v for k, v in out.items() if k not in skip}

def conflicts(db, user_id, start, end, exclude=None):
    gap = dt.timedelta(minutes=TURNAROUND)
    q = db.query(Duty).filter(Duty.user_id == user_id, Duty.status != "CANCELLED", Duty.starts_at < end + gap, Duty.ends_at > start - gap)
    return q.filter(Duty.id != exclude).all() if exclude else q.all()

def duty_view(d):
    r = row(d); r["late_minutes"] = 0
    if d.checked_in_at: r["late_minutes"] = max(0, int((utc(d.checked_in_at) - utc(d.starts_at)).total_seconds() // 60) - GRACE)
    return r

def permitted(actor, issue, to):
    mgr = actor.role in MANAGE
    if to in ("IN_PROGRESS", "RESOLUTION_SUBMITTED"): return mgr or actor.id == issue.owner_id
    if to == "VERIFIED" and actor.id == issue.resolved_by and actor.role != "CORE": return False  # separation of duties
    return mgr

def issue_view(i, actor):
    r = row(i); r["allowed"] = sorted(s for s in FLOW[i.status] if permitted(actor, i, s)); return r

def move(db, issue, actor, to, note=None):
    if to not in FLOW[issue.status]: raise HTTPException(409, f"Cannot move from {issue.status} to {to}")
    if not permitted(actor, issue, to): raise HTTPException(403, "You may not make this transition")
    if to in ("RESOLUTION_SUBMITTED", "CANCELLED", "REOPENED") and not (note or "").strip(): raise HTTPException(422, "A note is required for this transition")
    before, t = issue.status, now()
    if issue.first_response_at is None and before == "REPORTED": issue.first_response_at = t
    if to == "RESOLUTION_SUBMITTED": issue.resolution, issue.resolved_by, issue.resolved_at = note, actor.id, t
    if to == "VERIFIED": issue.verified_by, issue.verified_at = actor.id, t
    if to == "CLOSED": issue.closed_at = t
    if to == "REOPENED": issue.closed_at = issue.verified_at = issue.verified_by = None
    issue.status = to
    db.add(IssueHistory(issue_id=issue.id, actor_id=actor.id, from_status=before, to_status=to, note=note))
    audit(db, actor, "issue.transition", "issue", issue.id, {"status": before}, {"status": to}, note)

def new_issue(db, actor, d):
    resp, res = SLA[d["severity"]]; t = now()
    i = Issue(ref="FO-" + uuid.uuid4().hex[:6].upper(), reporter_id=getattr(actor, "id", None), respond_by=t + dt.timedelta(minutes=resp), resolve_by=t + dt.timedelta(minutes=res), **d)
    db.add(i); db.flush()
    db.add(IssueHistory(issue_id=i.id, actor_id=getattr(actor, "id", None), to_status="REPORTED")); audit(db, actor, "issue.create", "issue", i.id, None, {"severity": i.severity})
    return i

def run_escalations(db):
    """Idempotent: the unique (issue, kind) constraint guarantees one escalation even if two workers race."""
    t, made = now(), 0
    for i in db.query(Issue).filter(Issue.status.in_(OPEN_STATES)).all():
        for kind, hit in (("RESPONSE", i.first_response_at is None and utc(i.respond_by) < t), ("RESOLUTION", utc(i.resolve_by) < t)):
            if not hit or db.query(Escalation).filter_by(issue_id=i.id, kind=kind).first(): continue
            level = "DEPUTY_CORE" if i.severity in ("CRITICAL", "HIGH") else "COORDINATOR"
            try:
                with db.begin_nested():
                    db.add(Escalation(issue_id=i.id, kind=kind, level=level)); db.flush()
                    for u in db.query(User).filter(User.active, User.role.in_(["CORE", level])):
                        v = visible_events(db, u)
                        if v is None or i.event_id in v:
                            db.add(Notification(user_id=u.id, title=f"{i.severity} issue {i.ref}: {kind.lower()} deadline missed", body=i.title))
                    audit(db, None, "escalation.create", "issue", i.id, None, {"kind": kind, "level": level}); made += 1
            except IntegrityError: pass
    db.commit(); return made

def summary(db, u):
    """All counts are SQL aggregates (no row loading) so the dashboard stays cheap under polling."""
    vis, t = visible_events(db, u), now(); tz = ZoneInfo(os.getenv("EVENT_TZ", "Asia/Kolkata"))
    ls = t.astimezone(tz).replace(hour=0, minute=0, second=0, microsecond=0); a, b = ls.astimezone(dt.timezone.utc), (ls + dt.timedelta(days=1)).astimezone(dt.timezone.utc)
    sc = lambda q, col: q if vis is None else q.filter(col.in_(vis)); n = lambda q: q.scalar() or 0; grace = dt.timedelta(minutes=GRACE)
    def dq():
        q = sc(db.query(func.count(Duty.id)).select_from(Duty).join(EventSession, EventSession.id == Duty.session_id).filter(Duty.status != "CANCELLED"), EventSession.event_id)
        return q.filter(Duty.user_id == u.id) if u.role == "VOLUNTEER" else q
    poc = exists().where(Duty.session_id == EventSession.id, Duty.kind == "POC", Duty.status != "CANCELLED")
    iq = lambda *c: sc(db.query(*c).select_from(Issue), Issue.event_id)
    sev = {k: 0 for k in SLA}; sev.update(dict(iq(Issue.severity, func.count(Issue.id)).filter(Issue.status.in_(OPEN_STATES)).group_by(Issue.severity).all()))
    mins = [(utc(c1) - utc(c0)).total_seconds() / 60 for c0, c1 in iq(Issue.created_at, Issue.closed_at).filter(Issue.closed_at.isnot(None)).limit(5000)]
    return {"definitions": "duties and issues count records; sessions count scheduled sessions; cancelled duties excluded; today uses the event time zone",
            "sessions_today": n(sc(db.query(func.count(EventSession.id)).filter(EventSession.starts_at >= a, EventSession.starts_at < b), EventSession.event_id)),
            "duties_scheduled": n(dq()), "duties_checked_in": n(dq().filter(Duty.checked_in_at.isnot(None))),
            "duties_missing_checkin": n(dq().filter(Duty.checked_in_at.is_(None), Duty.starts_at < t - grace, Duty.ends_at > t)),
            "sessions_without_poc": n(sc(db.query(func.count(EventSession.id)).filter(EventSession.ends_at > t, ~poc), EventSession.event_id)),
            "open_issues_by_severity": sev, "overdue_issues": n(iq(func.count(Issue.id)).filter(Issue.status.in_(OPEN_STATES), Issue.resolve_by < t)),
            "median_resolution_minutes": round(statistics.median(mins), 1) if mins else None}
