import datetime as dt, os, uuid
from sqlalchemy import CheckConstraint, DDL, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint, Boolean, Index, LargeBinary, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

def now(): return dt.datetime.now(dt.timezone.utc)
def uid(): return str(uuid.uuid4())
def utc(x):
    if x is None: return None
    return x.replace(tzinfo=dt.timezone.utc) if x.tzinfo is None else x.astimezone(dt.timezone.utc)

URL = os.getenv("DATABASE_URL", "sqlite:///./festops.db")
for p in ("postgres://", "postgresql://"):
    if URL.startswith(p): URL = "postgresql+psycopg2://" + URL[len(p):]
sqlite = URL.startswith("sqlite")
engine = create_engine(URL, pool_pre_ping=True, **({"connect_args": {"check_same_thread": False}} if sqlite else {"pool_size": 2, "max_overflow": 3, "pool_recycle": 300}))
SessionLocal = sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase): pass
S = lambda n=None, **k: mapped_column(String(n) if n else Text, **k)
D = lambda **k: mapped_column(DateTime(timezone=True), **k)
PK = lambda: mapped_column(String(36), primary_key=True, default=uid)
FK = lambda t, **k: mapped_column(String(36), ForeignKey(t), **k)

class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = PK(); email: Mapped[str] = S(255, unique=True, index=True); name: Mapped[str] = S(200)
    phone: Mapped[str | None] = S(30, nullable=True); pw_hash: Mapped[str | None] = S(200, nullable=True)
    role: Mapped[str] = S(20); active: Mapped[bool] = mapped_column(Boolean, default=True)
    reports_to_id: Mapped[str | None] = FK("users.id", nullable=True); created_at = D(default=now)
    __table_args__ = (CheckConstraint("role in ('CORE','DEPUTY_CORE','SUPER_COORDINATOR','COORDINATOR','VOLUNTEER')", name="ck_role"),)

class Event(Base):
    __tablename__ = "events"
    id: Mapped[str] = PK(); code: Mapped[str] = S(40, unique=True); name: Mapped[str] = S(200)
    department: Mapped[str | None] = S(100, nullable=True); status: Mapped[str] = S(20, default="DRAFT")
    meet_url: Mapped[str | None] = S(500, nullable=True); stream_url: Mapped[str | None] = S(500, nullable=True)
    created_by: Mapped[str | None] = FK("users.id", nullable=True); created_at = D(default=now)

class EventScope(Base):
    __tablename__ = "event_scopes"
    user_id: Mapped[str] = FK("users.id", primary_key=True); event_id: Mapped[str] = FK("events.id", primary_key=True)

class EventSession(Base):
    __tablename__ = "event_sessions"
    id: Mapped[str] = PK(); event_id: Mapped[str] = FK("events.id", index=True); stage: Mapped[str] = S(120)
    starts_at = D(nullable=False); ends_at = D(nullable=False); status: Mapped[str] = S(20, default="SCHEDULED")
    __table_args__ = (CheckConstraint("ends_at > starts_at", name="ck_session_time"), UniqueConstraint("event_id", "stage", "starts_at"))

class Duty(Base):
    __tablename__ = "duties"
    id: Mapped[str] = PK(); session_id: Mapped[str] = FK("event_sessions.id", index=True); user_id: Mapped[str] = FK("users.id", index=True)
    kind: Mapped[str] = S(20); status: Mapped[str] = S(20, default="ASSIGNED"); starts_at = D(nullable=False); ends_at = D(nullable=False)
    assigned_by: Mapped[str | None] = FK("users.id", nullable=True); ack_at = D(nullable=True)
    checked_in_at = D(nullable=True); checked_out_at = D(nullable=True)
    __table_args__ = (CheckConstraint("ends_at > starts_at", name="ck_duty_time"), CheckConstraint("kind in ('POC','BACKUP','COORDINATOR')", name="ck_kind"),
                      UniqueConstraint("session_id", "user_id", "kind"), Index("ix_duties_user_start", "user_id", "starts_at"))

class Issue(Base):
    __tablename__ = "issues"
    id: Mapped[str] = PK(); ref: Mapped[str] = S(40, unique=True); title: Mapped[str] = S(250); description: Mapped[str] = S()
    event_id: Mapped[str] = FK("events.id", index=True); session_id: Mapped[str | None] = FK("event_sessions.id", nullable=True)
    reporter_id: Mapped[str | None] = FK("users.id", nullable=True); owner_id: Mapped[str | None] = FK("users.id", nullable=True)
    category: Mapped[str] = S(40); severity: Mapped[str] = S(10); status: Mapped[str] = S(30, default="REPORTED", index=True)
    created_at = D(default=now); respond_by = D(nullable=False); resolve_by = D(nullable=False); first_response_at = D(nullable=True)
    resolution: Mapped[str | None] = S(nullable=True); resolved_by: Mapped[str | None] = FK("users.id", nullable=True); resolved_at = D(nullable=True)
    verified_by: Mapped[str | None] = FK("users.id", nullable=True); verified_at = D(nullable=True); closed_at = D(nullable=True)
    __table_args__ = (CheckConstraint("severity in ('LOW','MEDIUM','HIGH','CRITICAL')", name="ck_sev"), Index("ix_issues_status_event", "status", "event_id"))

class IssueHistory(Base):
    __tablename__ = "issue_history"
    id: Mapped[str] = PK(); issue_id: Mapped[str] = FK("issues.id", index=True); actor_id: Mapped[str | None] = FK("users.id", nullable=True)
    from_status: Mapped[str | None] = S(30, nullable=True); to_status: Mapped[str] = S(30); note: Mapped[str | None] = S(nullable=True); at = D(default=now)

class Escalation(Base):
    __tablename__ = "escalations"
    id: Mapped[str] = PK(); issue_id: Mapped[str] = FK("issues.id", index=True); kind: Mapped[str] = S(12); level: Mapped[str] = S(20)
    created_at = D(default=now); acknowledged_by: Mapped[str | None] = FK("users.id", nullable=True)
    __table_args__ = (UniqueConstraint("issue_id", "kind", name="uq_escalation_once"),)

class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[str] = PK(); user_id: Mapped[str] = FK("users.id", index=True); title: Mapped[str] = S(250); body: Mapped[str | None] = S(nullable=True)
    created_at = D(default=now); read_at = D(nullable=True)

class Audit(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True); at = D(default=now, index=True)
    actor_id: Mapped[str | None] = S(36, nullable=True); action: Mapped[str] = S(60); entity: Mapped[str] = S(40); entity_id: Mapped[str | None] = S(60, nullable=True)
    before = mapped_column(JSON, nullable=True); after = mapped_column(JSON, nullable=True); reason: Mapped[str | None] = S(nullable=True)

# Append-only audit trail enforced by the database itself (PostgreSQL).
event.listen(Audit.__table__, "after_create", DDL("""
CREATE FUNCTION audit_immutable() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'audit_logs is append-only'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER audit_no_change BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION audit_immutable();
""").execute_if(dialect="postgresql"))

class Attachment(Base):
    __tablename__ = "attachments"
    id: Mapped[str] = PK(); issue_id: Mapped[str] = FK("issues.id", index=True); uploader_id: Mapped[str | None] = FK("users.id", nullable=True)
    filename: Mapped[str] = S(200); content_type: Mapped[str] = S(60); size: Mapped[int] = mapped_column(Integer); created_at = D(default=now)
    data = mapped_column(LargeBinary, deferred=True)  # never loaded in list queries

class ImportJob(Base):
    __tablename__ = "import_jobs"
    id: Mapped[str] = PK(); filename: Mapped[str] = S(255); sha256: Mapped[str] = S(64, index=True); status: Mapped[str] = S(12)
    user_id: Mapped[str | None] = FK("users.id", nullable=True); created_at = D(default=now); report = mapped_column(JSON, nullable=True)

def ensure_schema():
    """SQLite (tests, local dev) is created directly. PostgreSQL is managed only by Alembic migrations."""
    if sqlite: Base.metadata.create_all(engine)
