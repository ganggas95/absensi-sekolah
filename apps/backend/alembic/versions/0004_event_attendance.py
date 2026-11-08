"""add event attendance records"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0004_event_attendance"
down_revision = "0003_optional_student_nisn"
branch_labels = None
depends_on = None


def upgrade():
    status = postgresql.ENUM(
        "HADIR",
        "IZIN",
        "SAKIT",
        "ALPA",
        name="event_attendance_status",
        create_type=False,
    )
    status.create(op.get_bind())
    op.create_table(
        "event_attendances",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "schedule_event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("schedule_events.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "student_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("students.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", status, nullable=False),
        sa.Column("notes", sa.Text()),
        sa.Column(
            "recorded_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
        ),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "schedule_event_id",
            "student_id",
            name="uq_event_attendance_student_schedule",
        ),
    )
    op.create_index(
        "ix_event_attendances_schedule_event_id",
        "event_attendances",
        ["schedule_event_id"],
    )
    op.create_index(
        "ix_event_attendances_student_id", "event_attendances", ["student_id"]
    )


def downgrade():
    op.drop_index("ix_event_attendances_student_id", table_name="event_attendances")
    op.drop_index(
        "ix_event_attendances_schedule_event_id", table_name="event_attendances"
    )
    op.drop_table("event_attendances")
    op.execute("DROP TYPE event_attendance_status")
