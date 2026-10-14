import datetime as dt, hashlib, hmac, os
import jwt
from fastapi import Depends, HTTPException, Request
from .models import Duty, EventScope, EventSession, Issue, SessionLocal, User

PROD = os.getenv("VERCEL_ENV") == "production" or os.getenv("ENV") == "production"
SECRET = os.getenv("JWT_SECRET")
if not SECRET:
    if PROD: raise RuntimeError("JWT_SECRET must be set in production")
    SECRET = "dev-only-secret-not-for-production-use-0123456789"
RANK = {"VOLUNTEER": 0, "COORDINATOR": 1, "SUPER_COORDINATOR": 2, "DEPUTY_CORE": 3, "CORE": 4}
GLOBAL = {"CORE", "DEPUTY_CORE"}; MANAGE = {"CORE", "DEPUTY_CORE", "SUPER_COORDINATOR", "COORDINATOR"}
POLICY = {  # action -> roles. Deny by default: anything not listed is refused.
    "user.create": {"CORE", "DEPUTY_CORE"}, "user.role": {"CORE"}, "user.scope": {"CORE", "DEPUTY_CORE"}, "user.list": MANAGE,
    "event.write": {"CORE", "DEPUTY_CORE"}, "duty.assign": {"CORE", "DEPUTY_CORE"}, "duty.override": {"CORE", "DEPUTY_CORE"},
    "attendance.correct": MANAGE, "escalation.ack": MANAGE, "audit.read": {"CORE", "DEPUTY_CORE"}, "export": MANAGE, "import": {"CORE"},
}

def hash_pw(pw: str) -> str:
    salt = os.urandom(16); h = hashlib.scrypt(pw.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return f"scrypt${salt.hex()}${h.hex()}"
def check_pw(pw: str, stored: str | None) -> bool:
    if not stored: return False
    _, s, h = stored.split("$")
    return hmac.compare_digest(hashlib.scrypt(pw.encode(), salt=bytes.fromhex(s), n=2**14, r=8, p=1, dklen=32).hex(), h)
def make_token(u: User) -> str:
    return jwt.encode({"sub": u.id, "exp": dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=int(os.getenv("JWT_TTL_MIN", "720")))}, SECRET, algorithm="HS256")

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

def current_user(request: Request, db=Depends(get_db)) -> User:
    h = request.headers.get("authorization", "")
    try: sub = jwt.decode(h.split(" ", 1)[1], SECRET, algorithms=["HS256"])["sub"]
    except Exception: raise HTTPException(401, "Not authenticated")
    u = db.get(User, sub)
    if not u or not u.active: raise HTTPException(401, "Not authenticated")
    return u

def require(action: str):
    def dep(u: User = Depends(current_user)) -> User:
        if u.role not in POLICY[action]: raise HTTPException(403, "You do not have permission for this action")
        return u
    return dep

def visible_events(db, u: User):
    """None means every event. Otherwise the set of event ids the user may touch."""
    if u.role in GLOBAL: return None
    if u.role in ("COORDINATOR", "SUPER_COORDINATOR"):
        return {r[0] for r in db.query(EventScope.event_id).filter_by(user_id=u.id)}
    ids = {r[0] for r in db.query(EventSession.event_id).join(Duty, Duty.session_id == EventSession.id).filter(Duty.user_id == u.id)}
    return ids | {r[0] for r in db.query(Issue.event_id).filter((Issue.reporter_id == u.id) | (Issue.owner_id == u.id))}

def check_event(db, u: User, event_id: str):
    v = visible_events(db, u)
    if v is not None and event_id not in v: raise HTTPException(404, "Not found")
