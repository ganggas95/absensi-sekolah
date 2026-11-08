"""add exam periods and link exam schedules"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0005_exam_periods"
down_revision = "0004_event_attendance"
branch_labels = None
depends_on = None


def upgrade():
    period_type = postgresql.ENUM(
        "GANJIL", "GENAP", "MID_SEMESTER", name="exam_period_type", create_type=False
    )
    period_type.create(op.get_bind())
    op.create_table(
        "exam_periods",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "academic_year_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("academic_years.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("period_type", period_type, nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "academic_year_id", "period_type", name="uq_exam_period_year_type"
        ),
    )
    op.create_index(
        "ix_exam_periods_academic_year_id", "exam_periods", ["academic_year_id"]
    )
    op.add_column(
        "schedule_events",
        sa.Column(
            "exam_period_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("exam_periods.id", ondelete="RESTRICT"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_schedule_events_exam_period_id", "schedule_events", ["exam_period_id"]
    )


def downgrade():
    op.drop_index("ix_schedule_events_exam_period_id", table_name="schedule_events")
    op.drop_column("schedule_events", "exam_period_id")
    op.drop_index("ix_exam_periods_academic_year_id", table_name="exam_periods")
    op.drop_table("exam_periods")
    op.execute("DROP TYPE exam_period_type")
