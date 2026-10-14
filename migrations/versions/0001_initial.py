"""initial schema: accounts, events, duties, issues, escalations, notifications, audit

Revision ID: 0001
Revises:
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"; down_revision = None; branch_labels = None; depends_on = None
pk = lambda: sa.Column("id", sa.String(36), primary_key=True)
fk = lambda n, t, **k: sa.Column(n, sa.String(36), sa.ForeignKey(t), **k)
ts = lambda n, **k: sa.Column(n, sa.DateTime(timezone=True), **k)
txt = lambda n, ln=None, **k: sa.Column(n, sa.String(ln) if ln else sa.Text(), **k)

def upgrade() -> None:
    op.create_table("users", pk(), txt("email", 255, nullable=False), txt("name", 200, nullable=False), txt("phone", 30), txt("pw_hash", 200), txt("role", 20, nullable=False),
        sa.Column("active", sa.Boolean, nullable=False), fk("reports_to_id", "users.id"), ts("created_at"),
        sa.CheckConstraint("role in ('CORE','DEPUTY_CORE','SUPER_COORDINATOR','COORDINATOR','VOLUNTEER')", name="ck_role"))
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_table("events", pk(), txt("code", 40, nullable=False, unique=True), txt("name", 200, nullable=False), txt("department", 100), txt("status", 20, nullable=False),
        txt("meet_url", 500), txt("stream_url", 500), fk("created_by", "users.id"), ts("created_at"))
    op.create_table("event_scopes", fk("user_id", "users.id", primary_key=True), fk("event_id", "events.id", primary_key=True))
    op.create_table("event_sessions", pk(), fk("event_id", "events.id", nullable=False), txt("stage", 120, nullable=False), ts("starts_at", nullable=False), ts("ends_at", nullable=False),
        txt("status", 20, nullable=False), sa.CheckConstraint("ends_at > starts_at", name="ck_session_time"), sa.UniqueConstraint("event_id", "stage", "starts_at"))
    op.create_index("ix_event_sessions_event_id", "event_sessions", ["event_id"])
    op.create_table("duties", pk(), fk("session_id", "event_sessions.id", nullable=False), fk("user_id", "users.id", nullable=False), txt("kind", 20, nullable=False), txt("status", 20, nullable=False),
        ts("starts_at", nullable=False), ts("ends_at", nullable=False), fk("assigned_by", "users.id"), ts("ack_at"), ts("checked_in_at"), ts("checked_out_at"),
        sa.CheckConstraint("ends_at > starts_at", name="ck_duty_time"), sa.CheckConstraint("kind in ('POC','BACKUP','COORDINATOR')", name="ck_kind"), sa.UniqueConstraint("session_id", "user_id", "kind"))
    op.create_index("ix_duties_session_id", "duties", ["session_id"]); op.create_index("ix_duties_user_id", "duties", ["user_id"])
    op.create_table("issues", pk(), txt("ref", 40, nullable=False, unique=True), txt("title", 250, nullable=False), txt("description", nullable=False), fk("event_id", "events.id", nullable=False),
        fk("session_id", "event_sessions.id"), fk("reporter_id", "users.id"), fk("owner_id", "users.id"), txt("category", 40, nullable=False), txt("severity", 10, nullable=False), txt("status", 30, nullable=False),
        ts("created_at"), ts("respond_by", nullable=False), ts("resolve_by", nullable=False), ts("first_response_at"), txt("resolution"), fk("resolved_by", "users.id"), ts("resolved_at"),
        fk("verified_by", "users.id"), ts("verified_at"), ts("closed_at"), sa.CheckConstraint("severity in ('LOW','MEDIUM','HIGH','CRITICAL')", name="ck_sev"))
    op.create_index("ix_issues_event_id", "issues", ["event_id"]); op.create_index("ix_issues_status", "issues", ["status"])
    op.create_table("issue_history", pk(), fk("issue_id", "issues.id", nullable=False), fk("actor_id", "users.id"), txt("from_status", 30), txt("to_status", 30, nullable=False), txt("note"), ts("at"))
    op.create_index("ix_issue_history_issue_id", "issue_history", ["issue_id"])
    op.create_table("escalations", pk(), fk("issue_id", "issues.id", nullable=False), txt("kind", 12, nullable=False), txt("level", 20, nullable=False), ts("created_at"),
        fk("acknowledged_by", "users.id"), sa.UniqueConstraint("issue_id", "kind", name="uq_escalation_once"))
    op.create_index("ix_escalations_issue_id", "escalations", ["issue_id"])
    op.create_table("notifications", pk(), fk("user_id", "users.id", nullable=False), txt("title", 250, nullable=False), txt("body"), ts("created_at"), ts("read_at"))
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])
    op.create_table("audit_logs", sa.Column("id", sa.Integer, primary_key=True, autoincrement=True), ts("at"), txt("actor_id", 36), txt("action", 60, nullable=False), txt("entity", 40, nullable=False),
        txt("entity_id", 60), sa.Column("before", sa.JSON), sa.Column("after", sa.JSON), txt("reason"))
    op.create_index("ix_audit_logs_at", "audit_logs", ["at"])
    if op.get_bind().dialect.name == "postgresql":  # the database itself refuses edits to the audit trail
        op.execute("CREATE FUNCTION audit_immutable() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'audit_logs is append-only'; END; $$ LANGUAGE plpgsql")
        op.execute("CREATE TRIGGER audit_no_change BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION audit_immutable()")

def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP TRIGGER IF EXISTS audit_no_change ON audit_logs"); op.execute("DROP FUNCTION IF EXISTS audit_immutable()")
    for t in ("audit_logs", "notifications", "escalations", "issue_history", "issues", "duties", "event_sessions", "event_scopes", "events", "users"): op.drop_table(t)
