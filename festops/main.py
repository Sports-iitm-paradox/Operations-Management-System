import datetime as dt, hashlib, json, logging, os, re, time, uuid
from contextlib import asynccontextmanager
from typing import Literal
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse, Response
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from . import exporting as ex, services as sv
from .importer import run_import
from .models import Attachment, Audit, Duty, ImportJob, ensure_schema, Escalation, Event, EventScope, EventSession, Issue, IssueHistory, Notification, User, engine, now, utc
from .security import GLOBAL, MANAGE, PROD, RANK, check_event, check_pw, current_user, get_db, hash_pw, make_token, require, visible_events

@asynccontextmanager
async def lifespan(_):
    ensure_schema(); yield

docs = os.getenv("ENABLE_DOCS", "0" if PROD else "1") == "1"
app = FastAPI(title="Sports OMS", version="0.1.0", lifespan=lifespan,
              docs_url="/api/docs" if docs else None, openapi_url="/api/openapi.json" if docs else None)
if os.getenv("CORS_ORIGINS"):
    app.add_middleware(CORSMiddleware, allow_origins=os.environ["CORS_ORIGINS"].split(","), allow_headers=["*"], allow_methods=["*"])

logging.basicConfig(level=logging.INFO, format="%(message)s"); log = logging.getLogger("oms")
app.add_middleware(GZipMiddleware, minimum_size=1000)

@app.middleware("http")
async def correlation(request: Request, call_next):
    rid = request.headers.get("x-request-id") or uuid.uuid4().hex; t0 = time.perf_counter()
    r = await call_next(request); r.headers["x-request-id"] = rid; r.headers["x-content-type-options"] = "nosniff"; r.headers.setdefault("cache-control", "no-store")
    log.info(json.dumps({"rid": rid, "method": request.method, "path": request.url.path, "status": r.status_code, "ms": round((time.perf_counter() - t0) * 1000)})); return r

def err(status, code, msg, **extra): return JSONResponse({"error": {"code": code, "message": msg, **extra}}, status_code=status)
@app.exception_handler(HTTPException)
async def _h(_, e): return err(e.status_code, str(e.status_code), e.detail if isinstance(e.detail, str) else "Error", **({"detail": e.detail} if not isinstance(e.detail, str) else {}))
@app.exception_handler(RequestValidationError)
async def _v(_, e): return err(422, "validation_error", "Invalid request", fields=[{"loc": x["loc"], "msg": x["msg"]} for x in e.errors()])
@app.exception_handler(Exception)
async def _x(_, e): return err(500, "internal_error", "Something went wrong")

class LoginIn(BaseModel): email: str; password: str
class UserIn(BaseModel): email: str = Field(pattern=r"^[^@\s]+@[^@\s]+$"); name: str = Field(min_length=1); phone: str | None = None; role: str; password: str = Field(min_length=12); reports_to_id: str | None = None
class EventIn(BaseModel): code: str = Field(min_length=1, max_length=40); name: str = Field(min_length=1); department: str | None = None; meet_url: str | None = None; stream_url: str | None = None
class SessionIn(BaseModel): stage: str = Field(min_length=1); starts_at: dt.datetime; ends_at: dt.datetime
class DutyIn(BaseModel): session_id: str; user_id: str; kind: Literal["POC", "BACKUP", "COORDINATOR"]; override_reason: str | None = None
class IssueIn(BaseModel): title: str = Field(min_length=3, max_length=250); description: str = Field(min_length=1); event_id: str; session_id: str | None = None; category: str = "Other"; severity: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
class TransIn(BaseModel): to: str; note: str | None = None
class NoteIn(BaseModel): note: str | None = None
class AssignIn(BaseModel): owner_id: str
class CorrIn(BaseModel): checked_in_at: dt.datetime | None = None; checked_out_at: dt.datetime | None = None; reason: str = Field(min_length=3)
class RoleIn(BaseModel): role: str
class UserPatch(BaseModel): name: str | None = None; email: str | None = Field(default=None, pattern=r"^[^@\s]+@[^@\s]+$"); phone: str | None = None; reports_to_id: str | None = None
class PwIn(BaseModel): password: str = Field(min_length=12)
class ChangePw(BaseModel): current_password: str; new_password: str = Field(min_length=12)
class ReassignIn(BaseModel): user_id: str; reason: str = Field(min_length=3)
class ReasonIn(BaseModel): reason: str = Field(min_length=3)
class EventPatch(BaseModel): name: str | None = None; department: str | None = None; meet_url: str | None = None; stream_url: str | None = None
class SessionPatch(BaseModel): stage: str | None = None; starts_at: dt.datetime | None = None; ends_at: dt.datetime | None = None

api = APIRouter(prefix="/api/v1")
def get_or_404(db, model, id):
    o = db.get(model, id)
    if not o: raise HTTPException(404, "Not found")
    return o
def commit(db):
    try: db.commit()
    except IntegrityError: db.rollback(); raise HTTPException(409, "Conflicts with existing data")
def page(q, limit, offset): return q.limit(min(max(limit, 1), 200)).offset(max(offset, 0)).all()

@api.get("/health")
def health(): return {"status": "ok"}
@api.get("/ready")
def ready(db=Depends(get_db)): db.execute(text("select 1")); return {"status": "ready"}

# ---------- auth ----------
@api.post("/auth/login")
def login(b: LoginIn, db=Depends(get_db)):
    u = db.query(User).filter(User.email == b.email.lower().strip()).first()
    if u and db.query(Audit).filter(Audit.action == "auth.login_failed", Audit.entity_id == u.id, Audit.at > now() - dt.timedelta(minutes=15)).count() >= 5:
        raise HTTPException(429, "Too many failed attempts. Try again in 15 minutes.")
    if not u or not u.active or not check_pw(b.password, u.pw_hash):
        sv.audit(db, None, "auth.login_failed", "user", u.id if u else None, {"email": b.email[:100]}); db.commit()
        raise HTTPException(401, "Invalid email or password")
    return {"access_token": make_token(u), "user": sv.row(u)}
@api.get("/auth/me")
def me(u=Depends(current_user)): return sv.row(u)

# ---------- users ----------
@api.get("/users")
def users(limit: int = 50, offset: int = 0, role: str | None = None, db=Depends(get_db), u=Depends(require("user.list"))):
    q = db.query(User).order_by(User.name)
    return [sv.row(x) for x in page(q.filter(User.role == role) if role else q, limit, offset)]
@api.post("/users", status_code=201)
def create_user(b: UserIn, db=Depends(get_db), u=Depends(require("user.create"))):
    if b.role not in RANK: raise HTTPException(422, "Unknown role")
    if u.role != "CORE" and RANK[b.role] >= RANK[u.role]: raise HTTPException(403, "You cannot create an account at or above your own level")
    x = User(email=b.email.lower(), name=b.name, phone=b.phone, role=b.role, pw_hash=hash_pw(b.password), reports_to_id=b.reports_to_id)
    db.add(x); db.flush(); sv.audit(db, u, "user.create", "user", x.id, None, {"role": x.role, "email": x.email}); commit(db); return sv.row(x)
@api.post("/users/{uid}/roles")
def set_role(uid: str, b: RoleIn, db=Depends(get_db), u=Depends(require("user.role"))):
    x = get_or_404(db, User, uid)
    if b.role not in RANK: raise HTTPException(422, "Unknown role")
    if x.id == u.id: raise HTTPException(403, "You cannot change your own role")
    sv.audit(db, u, "user.role_change", "user", x.id, {"role": x.role}, {"role": b.role}); x.role = b.role; commit(db); return sv.row(x)
@api.post("/users/{uid}/deactivate")
def deactivate(uid: str, db=Depends(get_db), u=Depends(require("user.create"))):
    x = get_or_404(db, User, uid)
    if x.id == u.id or (u.role != "CORE" and RANK[x.role] >= RANK[u.role]): raise HTTPException(403, "Not allowed")
    x.active = False; sv.audit(db, u, "user.deactivate", "user", x.id); commit(db); return sv.row(x)
@api.put("/users/{uid}/scopes")
def set_scopes(uid: str, event_ids: list[str], db=Depends(get_db), u=Depends(require("user.scope"))):
    x = get_or_404(db, User, uid)
    db.query(EventScope).filter_by(user_id=uid).delete()
    for e in set(event_ids): db.add(EventScope(user_id=uid, event_id=get_or_404(db, Event, e).id))
    sv.audit(db, u, "user.scopes", "user", uid, None, {"events": sorted(set(event_ids))}); commit(db); return {"user_id": uid, "event_ids": sorted(set(event_ids))}

# ---------- events and sessions ----------
@api.get("/events")
def events(limit: int = 50, offset: int = 0, db=Depends(get_db), u=Depends(current_user)):
    q = db.query(Event).order_by(Event.name); v = visible_events(db, u)
    return [sv.row(e) for e in page(q if v is None else q.filter(Event.id.in_(v)), limit, offset)]
@api.post("/events", status_code=201)
def create_event(b: EventIn, db=Depends(get_db), u=Depends(require("event.write"))):
    e = Event(**b.model_dump(), created_by=u.id); db.add(e); db.flush(); sv.audit(db, u, "event.create", "event", e.id, None, b.model_dump()); commit(db); return sv.row(e)
@api.get("/events/{eid}")
def event(eid: str, db=Depends(get_db), u=Depends(current_user)): check_event(db, u, eid); return sv.row(get_or_404(db, Event, eid))
@api.post("/events/{eid}/transition")
def event_transition(eid: str, b: TransIn, db=Depends(get_db), u=Depends(require("event.write"))):
    e = get_or_404(db, Event, eid)
    if b.to not in sv.EVENT_FLOW[e.status]: raise HTTPException(409, f"Cannot move from {e.status} to {b.to}")
    sv.audit(db, u, "event.transition", "event", e.id, {"status": e.status}, {"status": b.to}); e.status = b.to; commit(db); return sv.row(e)
@api.get("/events/{eid}/sessions")
def sessions(eid: str, db=Depends(get_db), u=Depends(current_user)):
    check_event(db, u, eid); return [sv.row(s) for s in db.query(EventSession).filter_by(event_id=eid).order_by(EventSession.starts_at)]
@api.post("/events/{eid}/sessions", status_code=201)
def create_session(eid: str, b: SessionIn, db=Depends(get_db), u=Depends(require("event.write"))):
    get_or_404(db, Event, eid)
    if utc(b.ends_at) <= utc(b.starts_at): raise HTTPException(422, "ends_at must be after starts_at")
    s = EventSession(event_id=eid, stage=b.stage, starts_at=utc(b.starts_at), ends_at=utc(b.ends_at)); db.add(s); db.flush()
    sv.audit(db, u, "session.create", "session", s.id, None, {"stage": b.stage}); commit(db); return sv.row(s)

# ---------- duties ----------
def own_duty(db, u, did):
    d = get_or_404(db, Duty, did)
    if d.user_id != u.id: raise HTTPException(403, "This duty belongs to someone else")
    return d
@api.get("/duties/my-duties")
def my_duties(db=Depends(get_db), u=Depends(current_user)):
    rows = db.query(Duty, EventSession, Event).join(EventSession, EventSession.id == Duty.session_id).join(Event, Event.id == EventSession.event_id).filter(Duty.user_id == u.id).order_by(Duty.starts_at).limit(500).all()
    return [{**sv.duty_view(d), "stage": s_.stage, "event_name": e_.name, "meet_url": e_.meet_url, "stream_url": e_.stream_url} for d, s_, e_ in rows]
@api.get("/duties/coverage")
def coverage(session_id: str, db=Depends(get_db), u=Depends(current_user)):
    s = get_or_404(db, EventSession, session_id); check_event(db, u, s.event_id)
    ds = [d for d in db.query(Duty).filter_by(session_id=session_id) if d.status != "CANCELLED"]
    by = {k: [d.user_id for d in ds if d.kind == k] for k in ("POC", "BACKUP", "COORDINATOR")}
    return {"session_id": session_id, "assignments": by, "missing": [k for k, v in by.items() if not v]}
@api.get("/duties")
def duties(session_id: str | None = None, user_id: str | None = None, limit: int = 100, offset: int = 0, db=Depends(get_db), u=Depends(current_user)):
    q = db.query(Duty).join(EventSession, EventSession.id == Duty.session_id).order_by(Duty.starts_at); v = visible_events(db, u)
    if u.role == "VOLUNTEER": q = q.filter(Duty.user_id == u.id)
    elif v is not None: q = q.filter(EventSession.event_id.in_(v))
    if session_id: q = q.filter(Duty.session_id == session_id)
    if user_id: q = q.filter(Duty.user_id == user_id)
    return [sv.duty_view(d) for d in page(q, limit, offset)]
@api.post("/duties", status_code=201)
def assign(b: DutyIn, db=Depends(get_db), u=Depends(require("duty.assign"))):
    s = get_or_404(db, EventSession, b.session_id); x = get_or_404(db, User, b.user_id)
    if not x.active: raise HTTPException(422, "User is inactive")
    clash = sv.conflicts(db, x.id, utc(s.starts_at), utc(s.ends_at))
    if clash:
        if not (b.override_reason and b.override_reason.strip() and u.role in {"CORE", "DEPUTY_CORE"}):
            raise HTTPException(409, {"message": "Scheduling conflict", "conflicts": [sv.row(c) for c in clash]})
        sv.audit(db, u, "duty.override", "duty", None, None, {"user": x.id, "conflicts": [c.id for c in clash]}, b.override_reason)
    d = Duty(session_id=s.id, user_id=x.id, kind=b.kind, starts_at=s.starts_at, ends_at=s.ends_at, assigned_by=u.id)
    db.add(d); db.flush(); sv.audit(db, u, "duty.assign", "duty", d.id, None, {"user": x.id, "kind": b.kind}); db.add(Notification(user_id=x.id, title="New duty assigned", body=f"{b.kind} for {s.stage}"))
    commit(db); return sv.duty_view(d)
@api.post("/duties/{did}/acknowledge")
def acknowledge(did: str, db=Depends(get_db), u=Depends(current_user)):
    d = own_duty(db, u, did)
    if d.status == "ASSIGNED": d.status, d.ack_at = "ACKNOWLEDGED", now(); sv.audit(db, u, "duty.ack", "duty", d.id); commit(db)
    return sv.duty_view(d)
@api.post("/duties/{did}/check-in")
def check_in(did: str, db=Depends(get_db), u=Depends(current_user)):
    d = own_duty(db, u, did)
    if d.checked_in_at: return sv.duty_view(d)  # idempotent: server timestamp is never overwritten
    t = now()
    if d.status not in ("ASSIGNED", "ACKNOWLEDGED"): raise HTTPException(409, f"Duty is {d.status}")
    if t < utc(d.starts_at) - dt.timedelta(minutes=60) or t > utc(d.ends_at): raise HTTPException(409, "Check-in opens 60 minutes before the duty and closes when it ends")
    d.checked_in_at, d.status = t, "CHECKED_IN"; sv.audit(db, u, "duty.check_in", "duty", d.id); commit(db); return sv.duty_view(d)
@api.post("/duties/{did}/check-out")
def check_out(did: str, db=Depends(get_db), u=Depends(current_user)):
    d = own_duty(db, u, did)
    if d.checked_out_at: return sv.duty_view(d)
    if not d.checked_in_at: raise HTTPException(409, "Check in first")
    d.checked_out_at, d.status = now(), "COMPLETED"; sv.audit(db, u, "duty.check_out", "duty", d.id); commit(db); return sv.duty_view(d)
@api.post("/duties/{did}/attendance-correction")
def correct(did: str, b: CorrIn, db=Depends(get_db), u=Depends(require("attendance.correct"))):
    d = get_or_404(db, Duty, did); s = db.get(EventSession, d.session_id); check_event(db, u, s.event_id)
    before = {"in": str(d.checked_in_at), "out": str(d.checked_out_at)}
    if b.checked_in_at: d.checked_in_at = utc(b.checked_in_at)
    if b.checked_out_at: d.checked_out_at = utc(b.checked_out_at)
    d.status = "COMPLETED" if d.checked_out_at else "CHECKED_IN"
    sv.audit(db, u, "attendance.correction", "duty", d.id, before, {"in": str(d.checked_in_at), "out": str(d.checked_out_at)}, b.reason); commit(db); return sv.duty_view(d)

# ---------- issues ----------
def issue_for(db, u, iid):
    i = get_or_404(db, Issue, iid)
    if u.role not in MANAGE and u.id not in (i.reporter_id, i.owner_id): raise HTTPException(404, "Not found")
    check_event(db, u, i.event_id) if u.role in MANAGE else None
    return i
@api.get("/issues/overdue")
def overdue(db=Depends(get_db), u=Depends(current_user)):
    t, v = now(), visible_events(db, u); out = []
    for i in db.query(Issue).filter(Issue.status.in_(sv.OPEN_STATES)).order_by(Issue.resolve_by):
        if utc(i.resolve_by) < t and (u.role in MANAGE and (v is None or i.event_id in v) or u.id in (i.reporter_id, i.owner_id)): out.append(sv.issue_view(i, u))
    return out
@api.get("/issues")
def issues(status: str | None = None, severity: str | None = None, event_id: str | None = None, q: str | None = None, limit: int = 50, offset: int = 0, db=Depends(get_db), u=Depends(current_user)):
    qs = db.query(Issue).order_by(Issue.created_at.desc()); v = visible_events(db, u)
    if u.role not in MANAGE: qs = qs.filter((Issue.reporter_id == u.id) | (Issue.owner_id == u.id))
    elif v is not None: qs = qs.filter(Issue.event_id.in_(v))
    if status: qs = qs.filter(Issue.status == status)
    if severity: qs = qs.filter(Issue.severity == severity)
    if event_id: qs = qs.filter(Issue.event_id == event_id)
    if q: qs = qs.filter(Issue.title.ilike(f"%{q}%") | Issue.description.ilike(f"%{q}%") | Issue.ref.ilike(f"%{q}%"))
    return {"total": qs.count(), "items": [sv.issue_view(i, u) for i in page(qs, limit, offset)]}
@api.post("/issues", status_code=201)
def report(b: IssueIn, db=Depends(get_db), u=Depends(current_user)):
    get_or_404(db, Event, b.event_id); check_event(db, u, b.event_id)
    i = sv.new_issue(db, u, b.model_dump()); commit(db); return sv.issue_view(i, u)
@api.get("/issues/{iid}")
def issue(iid: str, db=Depends(get_db), u=Depends(current_user)): return sv.issue_view(issue_for(db, u, iid), u)
@api.get("/issues/{iid}/history")
def history(iid: str, db=Depends(get_db), u=Depends(current_user)):
    issue_for(db, u, iid); return [sv.row(h) for h in db.query(IssueHistory).filter_by(issue_id=iid).order_by(IssueHistory.at)]
@api.post("/issues/{iid}/transition")
def transition(iid: str, b: TransIn, db=Depends(get_db), u=Depends(current_user)):
    i = issue_for(db, u, iid); sv.move(db, i, u, b.to, b.note); commit(db); return sv.issue_view(i, u)
@api.post("/issues/{iid}/assign")
def assign_issue(iid: str, b: AssignIn, db=Depends(get_db), u=Depends(current_user)):
    i = issue_for(db, u, iid)
    if u.role not in MANAGE: raise HTTPException(403, "Only coordinators and above can assign issues")
    o = get_or_404(db, User, b.owner_id); before = i.owner_id
    if i.status == "REPORTED": sv.move(db, i, u, "TRIAGED")
    if i.status in ("TRIAGED", "REOPENED"): sv.move(db, i, u, "ASSIGNED")
    i.owner_id = o.id; sv.audit(db, u, "issue.assign", "issue", i.id, {"owner": before}, {"owner": o.id})
    db.add(Notification(user_id=o.id, title=f"Issue {i.ref} assigned to you", body=i.title)); commit(db); return sv.issue_view(i, u)
def shortcut(path, to):
    def f(iid: str, b: NoteIn = NoteIn(), db=Depends(get_db), u=Depends(current_user)):
        i = issue_for(db, u, iid); sv.move(db, i, u, to, b.note); commit(db); return sv.issue_view(i, u)
    api.post(f"/issues/{{iid}}/{path}", name=path)(f)
for p, t in (("verify", "VERIFIED"), ("close", "CLOSED"), ("reopen", "REOPENED"), ("resolve", "RESOLUTION_SUBMITTED")): shortcut(p, t)

# ---------- escalations, notifications, dashboard, audit ----------
@api.get("/escalations")
def escalations(db=Depends(get_db), u=Depends(require("escalation.ack"))):
    v = visible_events(db, u); q = db.query(Escalation, Issue).join(Issue, Issue.id == Escalation.issue_id).order_by(Escalation.created_at.desc())
    return [{**sv.row(e), "issue_ref": i.ref, "severity": i.severity, "title": i.title} for e, i in q if v is None or i.event_id in v]
@api.post("/escalations/{eid}/acknowledge")
def ack_escalation(eid: str, db=Depends(get_db), u=Depends(require("escalation.ack"))):
    e = get_or_404(db, Escalation, eid); e.acknowledged_by = e.acknowledged_by or u.id; sv.audit(db, u, "escalation.ack", "escalation", e.id); commit(db); return sv.row(e)
@api.post("/jobs/escalate")
@api.get("/jobs/escalate")
def job(request: Request, db=Depends(get_db)):
    secret = os.getenv("CRON_SECRET")
    if not secret or request.headers.get("authorization") != f"Bearer {secret}": raise HTTPException(401, "Not authenticated")
    return {"escalations_created": sv.run_escalations(db)}
@api.get("/notifications")
def notifications(db=Depends(get_db), u=Depends(current_user)):
    return [sv.row(n) for n in db.query(Notification).filter_by(user_id=u.id).order_by(Notification.created_at.desc()).limit(50)]
@api.post("/notifications/{nid}/read")
def read(nid: str, db=Depends(get_db), u=Depends(current_user)):
    n = get_or_404(db, Notification, nid)
    if n.user_id != u.id: raise HTTPException(404, "Not found")
    n.read_at = n.read_at or now(); commit(db); return sv.row(n)
@api.get("/dashboard/summary")
def dash(db=Depends(get_db), u=Depends(current_user)): return sv.summary(db, u)
@api.get("/audit-logs")
def audit_logs(limit: int = 50, offset: int = 0, action: str | None = None, entity: str | None = None, db=Depends(get_db), u=Depends(require("audit.read"))):
    q = db.query(Audit)
    if action: q = q.filter(Audit.action.ilike(f"{action}%"))
    if entity: q = q.filter(Audit.entity == entity)
    total = q.count(); rows = page(q.order_by(Audit.id.desc()), limit, offset)
    names = {x.id: x.name for x in db.query(User.id, User.name).filter(User.id.in_({a.actor_id for a in rows if a.actor_id}))} if rows else {}
    return {"total": total, "items": [{**sv.row(a), "actor_name": names.get(a.actor_id) or a.actor_id or "system"} for a in rows]}

# ---------- member management (CORE and DEPUTY_CORE within their level) ----------
def manageable(u, x):
    if x.id == u.id: raise HTTPException(403, "Use your own profile page for this")
    if u.role != "CORE" and RANK[x.role] >= RANK[u.role]: raise HTTPException(403, "You cannot manage an account at or above your own level")
@api.patch("/users/{uid}")
def patch_user(uid: str, b: UserPatch, db=Depends(get_db), u=Depends(require("user.create"))):
    x = get_or_404(db, User, uid); manageable(u, x); before = sv.row(x)
    for k, v in b.model_dump(exclude_unset=True).items(): setattr(x, k, v.lower() if k == "email" and v else v)
    sv.audit(db, u, "user.update", "user", x.id, {k: before[k] for k in b.model_dump(exclude_unset=True)}, b.model_dump(exclude_unset=True)); commit(db); return sv.row(x)
@api.post("/users/{uid}/reset-password")
def reset_pw(uid: str, b: PwIn, db=Depends(get_db), u=Depends(require("user.create"))):
    x = get_or_404(db, User, uid); manageable(u, x)
    x.pw_hash = hash_pw(b.password); x.active = True; sv.audit(db, u, "user.password_set", "user", x.id); commit(db); return sv.row(x)
@api.post("/users/{uid}/activate")
def activate(uid: str, db=Depends(get_db), u=Depends(require("user.create"))):
    x = get_or_404(db, User, uid); manageable(u, x)
    if not x.pw_hash: raise HTTPException(409, "Set a password for this member first")
    x.active = True; sv.audit(db, u, "user.activate", "user", x.id); commit(db); return sv.row(x)
@api.post("/auth/change-password")
def change_pw(b: ChangePw, db=Depends(get_db), u=Depends(current_user)):
    if not check_pw(b.current_password, u.pw_hash): raise HTTPException(403, "Current password is wrong")
    u.pw_hash = hash_pw(b.new_password); sv.audit(db, u, "user.password_change", "user", u.id); commit(db); return {"ok": True}

@api.patch("/events/{eid}")
def patch_event(eid: str, b: EventPatch, db=Depends(get_db), u=Depends(require("event.write"))):
    e = get_or_404(db, Event, eid); d = b.model_dump(exclude_unset=True)
    sv.audit(db, u, "event.update", "event", e.id, {k: getattr(e, k) for k in d}, d)
    for k, v in d.items(): setattr(e, k, v)
    commit(db); return sv.row(e)
@api.patch("/sessions/{sid}")
def patch_session(sid: str, b: SessionPatch, db=Depends(get_db), u=Depends(require("event.write"))):
    s = get_or_404(db, EventSession, sid); d = b.model_dump(exclude_unset=True)
    for k in ("starts_at", "ends_at"):
        if k in d and d[k]: d[k] = utc(d[k])
    if utc(d.get("ends_at", s.ends_at)) <= utc(d.get("starts_at", s.starts_at)): raise HTTPException(422, "ends_at must be after starts_at")
    sv.audit(db, u, "session.update", "session", s.id, {k: str(getattr(s, k)) for k in d}, {k: str(v) for k, v in d.items()})
    for k, v in d.items(): setattr(s, k, v)
    for duty in db.query(Duty).filter_by(session_id=s.id).filter(Duty.status != "CANCELLED"):  # keep duty times aligned with the session
        duty.starts_at, duty.ends_at = s.starts_at, s.ends_at
    commit(db); return sv.row(s)

@api.post("/duties/{did}/cancel")
def cancel_duty(did: str, b: ReasonIn, db=Depends(get_db), u=Depends(require("duty.assign"))):
    d = get_or_404(db, Duty, did)
    if d.status in ("COMPLETED", "CANCELLED"): raise HTTPException(409, f"Duty is already {d.status}")
    d.status = "CANCELLED"; sv.audit(db, u, "duty.cancel", "duty", d.id, {"user": d.user_id}, None, b.reason)
    db.add(Notification(user_id=d.user_id, title="Duty cancelled", body=b.reason)); commit(db); return sv.duty_view(d)
@api.post("/duties/{did}/reassign")
def reassign(did: str, b: ReassignIn, db=Depends(get_db), u=Depends(require("duty.assign"))):
    d = get_or_404(db, Duty, did); x = get_or_404(db, User, b.user_id)
    if d.status in ("COMPLETED", "CANCELLED"): raise HTTPException(409, f"Duty is already {d.status}")
    if not x.active: raise HTTPException(422, "User is inactive")
    if x.id == d.user_id: raise HTTPException(422, "Already assigned to this person")
    clash = sv.conflicts(db, x.id, utc(d.starts_at), utc(d.ends_at), exclude=d.id)
    if clash: raise HTTPException(409, {"message": "Scheduling conflict", "conflicts": [sv.row(c) for c in clash]})
    old = d.user_id; d.status = "CANCELLED"
    n = Duty(session_id=d.session_id, user_id=x.id, kind=d.kind, starts_at=d.starts_at, ends_at=d.ends_at, assigned_by=u.id); db.add(n); db.flush()
    sv.audit(db, u, "duty.reassign", "duty", n.id, {"from": old, "old_duty": d.id}, {"to": x.id}, b.reason)
    db.add_all([Notification(user_id=old, title="Duty reassigned", body=b.reason), Notification(user_id=x.id, title="New duty assigned", body=f"{d.kind}")]); commit(db); return sv.duty_view(n)

@api.get("/calendar")
def calendar(start: dt.datetime, end: dt.datetime, db=Depends(get_db), u=Depends(current_user)):
    v = visible_events(db, u)
    q = db.query(EventSession, Event).join(Event, Event.id == EventSession.event_id).filter(EventSession.starts_at < utc(end), EventSession.ends_at > utc(start)).order_by(EventSession.starts_at)
    if v is not None: q = q.filter(EventSession.event_id.in_(v))
    rows = q.limit(500).all(); ids = [x.id for x, _ in rows]  # three queries total, however many sessions
    ds = db.query(Duty).filter(Duty.session_id.in_(ids), Duty.status != "CANCELLED").all() if ids else []
    names = {x.id: x.name for x in db.query(User.id, User.name).filter(User.id.in_({d.user_id for d in ds}))} if ds else {}; by = {}
    for d in ds: by.setdefault(d.session_id, []).append(d)
    return [{**sv.row(s_), "event_name": e.name, "event_code": e.code, "event_status": e.status, "meet_url": e.meet_url, "stream_url": e.stream_url,
             "staff": [{"duty_id": d.id, "user_id": d.user_id, "name": names.get(d.user_id), "kind": d.kind, "status": d.status, "checked_in": bool(d.checked_in_at)} for d in by.get(s_.id, [])],
             "missing": [k for k in ("POC", "BACKUP", "COORDINATOR") if not any(d.kind == k for d in by.get(s_.id, []))]} for s_, e in rows]

@api.get("/reports/workload")
def workload(db=Depends(get_db), u=Depends(require("user.list"))):
    v, out = visible_events(db, u), {}
    for d, s in db.query(Duty, EventSession).join(EventSession, EventSession.id == Duty.session_id):
        if d.status == "CANCELLED" or (v is not None and s.event_id not in v): continue
        r = out.setdefault(d.user_id, {"user_id": d.user_id, "POC": 0, "BACKUP": 0, "COORDINATOR": 0, "hours": 0.0})  # one count per assignment, never per join row
        r[d.kind] += 1; r["hours"] = round(r["hours"] + (utc(d.ends_at) - utc(d.starts_at)).total_seconds() / 3600, 2)
    return list(out.values())

@api.post("/notifications/read-all")
def read_all(db=Depends(get_db), u=Depends(current_user)):
    for n in db.query(Notification).filter_by(user_id=u.id, read_at=None): n.read_at = now()
    commit(db); return {"ok": True}

@api.get("/users/{uid}/scopes")
def get_scopes(uid: str, db=Depends(get_db), u=Depends(require("user.scope"))):
    get_or_404(db, User, uid); return {"user_id": uid, "event_ids": [r[0] for r in db.query(EventScope.event_id).filter_by(user_id=uid)]}

# ---------- attachments ----------
MAX_UPLOAD = 3 * 1024 * 1024
def sniff(b: bytes):
    if b[:3] == b"\xff\xd8\xff": return "image/jpeg"
    if b[:8] == b"\x89PNG\r\n\x1a\n": return "image/png"
    if b[:4] == b"RIFF" and b[8:12] == b"WEBP": return "image/webp"
    if b[:5] == b"%PDF-": return "application/pdf"
async def read_body(request: Request, limit: int) -> bytes:
    if int(request.headers.get("content-length") or 0) > limit: raise HTTPException(413, "File is too large")
    data = await request.body()
    if len(data) > limit: raise HTTPException(413, "File is too large")
    if not data: raise HTTPException(422, "Empty upload")
    return data
@api.post("/issues/{iid}/attachments", status_code=201)
async def upload(iid: str, request: Request, filename: str = "file", db=Depends(get_db), u=Depends(current_user)):
    data = await read_body(request, MAX_UPLOAD)
    def work():
        i = issue_for(db, u, iid); kind = sniff(data)  # type is decided from the bytes, never from the client header
        if not kind: raise HTTPException(415, "Only JPEG, PNG, WebP and PDF files are accepted")
        if db.query(Attachment).filter_by(issue_id=i.id).count() >= 10: raise HTTPException(409, "Attachment limit reached for this issue")
        a = Attachment(issue_id=i.id, uploader_id=u.id, filename=re.sub(r"[^A-Za-z0-9._ -]", "_", os.path.basename(filename))[:120] or "file", content_type=kind, size=len(data), data=data)
        db.add(a); db.flush(); sv.audit(db, u, "issue.attachment", "issue", i.id, None, {"file": a.filename, "size": a.size}); commit(db); return sv.row(a)
    return await run_in_threadpool(work)
@api.get("/issues/{iid}/attachments")
def attachments(iid: str, db=Depends(get_db), u=Depends(current_user)):
    issue_for(db, u, iid); return [sv.row(a) for a in db.query(Attachment).filter_by(issue_id=iid).order_by(Attachment.created_at)]
@api.get("/attachments/{aid}")
def download(aid: str, db=Depends(get_db), u=Depends(current_user)):
    a = get_or_404(db, Attachment, aid); issue_for(db, u, a.issue_id)
    return Response(a.data, media_type=a.content_type, headers={"Content-Disposition": f'inline; filename="{a.filename}"', "Content-Security-Policy": "default-src 'none'; sandbox", "Cache-Control": "private, max-age=3600"})

# ---------- exports ----------
@api.get("/exports/{kind}")
def export(kind: Literal["issues", "duties", "attendance"], format: Literal["csv", "xlsx"] = "csv", event_id: str | None = None, db=Depends(get_db), u=Depends(require("export"))):
    v = visible_events(db, u); names = {x.id: x.name for x in db.query(User.id, User.name)}
    if kind == "issues":
        q = db.query(Issue, Event).join(Event, Event.id == Issue.event_id).order_by(Issue.created_at)
        if v is not None: q = q.filter(Issue.event_id.in_(v))
        if event_id: q = q.filter(Issue.event_id == event_id)
        head = ["Reference", "Event", "Title", "Description", "Category", "Severity", "Status", "Reported by", "Owner", "Created", "Respond by", "Resolve by", "First response", "Resolution", "Resolved", "Verified by", "Closed"]
        rows = [[i.ref, e.name, i.title, i.description, i.category, i.severity, i.status, names.get(i.reporter_id, ""), names.get(i.owner_id, ""), ex.loc(i.created_at), ex.loc(i.respond_by), ex.loc(i.resolve_by),
                 ex.loc(i.first_response_at), i.resolution or "", ex.loc(i.resolved_at), names.get(i.verified_by, ""), ex.loc(i.closed_at)] for i, e in q]
    else:
        q = db.query(Duty, EventSession, Event).join(EventSession, EventSession.id == Duty.session_id).join(Event, Event.id == EventSession.event_id).order_by(EventSession.starts_at, Duty.kind)
        if v is not None: q = q.filter(EventSession.event_id.in_(v))
        if event_id: q = q.filter(EventSession.event_id == event_id)
        if kind == "duties":
            head = ["Event", "Stage", "Session start", "Session end", "Person", "Duty type", "Status", "Acknowledged", "Assigned by"]
            rows = [[e.name, s_.stage, ex.loc(s_.starts_at), ex.loc(s_.ends_at), names.get(d.user_id, ""), d.kind, d.status, ex.loc(d.ack_at), names.get(d.assigned_by, "")] for d, s_, e in q]
        else:
            head = ["Event", "Stage", "Person", "Duty type", "Scheduled start", "Scheduled end", "Checked in", "Checked out", "Minutes late (after grace)", "Planned hours", "Status"]
            rows = [[e.name, s_.stage, names.get(d.user_id, ""), d.kind, ex.loc(d.starts_at), ex.loc(d.ends_at), ex.loc(d.checked_in_at), ex.loc(d.checked_out_at), sv.duty_view(d)["late_minutes"] if d.checked_in_at else "",
                     round((utc(d.ends_at) - utc(d.starts_at)).total_seconds() / 3600, 2), d.status] for d, s_, e in q]
    sv.audit(db, u, "export", "export", kind, None, {"format": format, "rows": len(rows), "event": event_id}); commit(db); return ex.build(kind, format, head, rows)

# ---------- workbook import (preview first, then commit the identical file) ----------
async def xlsx_body(request: Request) -> bytes:
    data = await read_body(request, 5 * 1024 * 1024)
    if data[:2] != b"PK": raise HTTPException(415, "Upload an .xlsx workbook")
    return data
@api.post("/imports/workbook/preview")
async def import_preview(request: Request, filename: str = "workbook.xlsx", db=Depends(get_db), u=Depends(require("import"))):
    data = await xlsx_body(request); sha = hashlib.sha256(data).hexdigest()
    def work():
        try: rep = run_import(db, data)
        except Exception as e: db.rollback(); raise HTTPException(422, f"Could not read this workbook: {type(e).__name__}")
        db.rollback()  # preview never keeps changes
        job = ImportJob(filename=os.path.basename(filename)[:255], sha256=sha, status="PREVIEW", user_id=u.id, report=rep); db.add(job); db.commit(); return {"job_id": job.id, "sha256": sha, "report": rep}
    return await run_in_threadpool(work)
@api.post("/imports/workbook/commit")
async def import_commit(request: Request, sha256: str, filename: str = "workbook.xlsx", db=Depends(get_db), u=Depends(require("import"))):
    data = await xlsx_body(request)
    if hashlib.sha256(data).hexdigest() != sha256: raise HTTPException(409, "This is not the file you previewed")
    def work():
        if not db.query(ImportJob).filter_by(sha256=sha256, status="PREVIEW", user_id=u.id).first(): raise HTTPException(409, "Preview this exact file before committing")
        try:
            rep = run_import(db, data); job = ImportJob(filename=os.path.basename(filename)[:255], sha256=sha256, status="COMMITTED", user_id=u.id, report=rep); db.add(job)
            sv.audit(db, u, "import.workbook", "import", None, None, {"file": job.filename, "new": rep["new"], "errors": len(rep["errors"])}); db.commit(); return {"job_id": job.id, "report": rep}
        except Exception:
            db.rollback(); db.add(ImportJob(filename=os.path.basename(filename)[:255], sha256=sha256, status="FAILED", user_id=u.id)); db.commit(); raise HTTPException(500, "Import failed and was rolled back")
    return await run_in_threadpool(work)
@api.get("/imports/{job_id}")
def import_job(job_id: str, db=Depends(get_db), u=Depends(require("import"))): return sv.row(get_or_404(db, ImportJob, job_id))
@api.get("/imports/{job_id}/errors")
def import_errors(job_id: str, db=Depends(get_db), u=Depends(require("import"))):
    j = get_or_404(db, ImportJob, job_id); rep = j.report or {}
    return ex.build("import-errors", "csv", ["Sheet", "Row", "Problem"], [[e["sheet"], e["row"], e["message"]] for e in rep.get("errors", [])] + [["Issue Log", "", w] for w in rep.get("warnings", [])])

app.include_router(api)
