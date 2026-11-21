"""persist KBM attendance sessions and scope records per schedule

Records from different schedule sessions on the same day and rombel used to
collide because daily_attendances was unique per student and date. The session
table keeps the teacher's open/closed state and each record now belongs to the
schedule session that produced it.

Revision ID: 0009_attendance_sessions
Revises: 0008_teacher_attendance
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0009_attendance_sessions"
down_revision = "0008_teacher_attendance"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "attendance_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "schedule_event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("schedule_events.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("session_date", sa.Date(), nullable=False),
        sa.Column(
            "opened_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
        ),
        sa.Column(
            "opened_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "closed_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
        ),
        sa.Column("closed_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint(
            "schedule_event_id",
            "session_date",
            name="uq_attendance_session_schedule_date",
        ),
    )
    op.create_index(
        "ix_attendance_sessions_schedule_event_id",
        "attendance_sessions",
        ["schedule_event_id"],
    )
    op.create_index(
        "ix_attendance_sessions_session_date",
        "attendance_sessions",
        ["session_date"],
    )

    op.add_column(
        "daily_attendances",
        sa.Column(
            "schedule_event_id", postgresql.UUID(as_uuid=True), nullable=True
        ),
    )
    op.create_foreign_key(
        "fk_daily_attendances_schedule_event_id",
        "daily_attendances",
        "schedule_events",
        ["schedule_event_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_daily_attendances_schedule_event_id",
        "daily_attendances",
        ["schedule_event_id"],
    )
    op.drop_constraint(
        "uq_daily_student_date", "daily_attendances", type_="unique"
    )
    op.create_unique_constraint(
        "uq_daily_student_schedule_date",
        "daily_attendances",
        ["student_id", "schedule_event_id", "date"],
    )
    # Legacy rows have no schedule; keep one record per student and date.
    op.create_index(
        "uq_daily_student_date_legacy",
        "daily_attendances",
        ["student_id", "date"],
        unique=True,
        postgresql_where=sa.text("schedule_event_id IS NULL"),
    )


def downgrade():
    op.drop_index("uq_daily_student_date_legacy", table_name="daily_attendances")
    op.drop_constraint(
        "uq_daily_student_schedule_date", "daily_attendances", type_="unique"
    )
    op.create_unique_constraint(
        "uq_daily_student_date", "daily_attendances", ["student_id", "date"]
    )
    op.drop_index(
        "ix_daily_attendances_schedule_event_id", table_name="daily_attendances"
    )
    op.drop_constraint(
        "fk_daily_attendances_schedule_event_id",
        "daily_attendances",
        type_="foreignkey",
    )
    op.drop_column("daily_attendances", "schedule_event_id")
    op.drop_index(
        "ix_attendance_sessions_session_date", table_name="attendance_sessions"
    )
    op.drop_index(
        "ix_attendance_sessions_schedule_event_id", table_name="attendance_sessions"
    )
    op.drop_table("attendance_sessions")
