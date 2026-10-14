"""attachments, import jobs, and composite indexes for the hot queries

Revision ID: 0002
Revises: 0001
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"; down_revision = "0001"; branch_labels = None; depends_on = None

def upgrade() -> None:
    op.create_table("attachments", sa.Column("id", sa.String(36), primary_key=True), sa.Column("issue_id", sa.String(36), sa.ForeignKey("issues.id"), nullable=False),
        sa.Column("uploader_id", sa.String(36), sa.ForeignKey("users.id")), sa.Column("filename", sa.String(200), nullable=False), sa.Column("content_type", sa.String(60), nullable=False),
        sa.Column("size", sa.Integer, nullable=False), sa.Column("created_at", sa.DateTime(timezone=True)), sa.Column("data", sa.LargeBinary))
    op.create_index("ix_attachments_issue_id", "attachments", ["issue_id"])
    op.create_table("import_jobs", sa.Column("id", sa.String(36), primary_key=True), sa.Column("filename", sa.String(255), nullable=False), sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("status", sa.String(12), nullable=False), sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id")), sa.Column("created_at", sa.DateTime(timezone=True)), sa.Column("report", sa.JSON))
    op.create_index("ix_import_jobs_sha256", "import_jobs", ["sha256"])
    op.create_index("ix_duties_user_start", "duties", ["user_id", "starts_at"]); op.create_index("ix_issues_status_event", "issues", ["status", "event_id"])

def downgrade() -> None:
    op.drop_index("ix_issues_status_event", "issues"); op.drop_index("ix_duties_user_start", "duties"); op.drop_table("import_jobs"); op.drop_table("attachments")
