"""allow one schedule event to include multiple rombels"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0006_shared_schedule_rombels"
down_revision = "0005_exam_periods"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "schedule_event_rombels",
        sa.Column(
            "schedule_event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("schedule_events.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "rombel_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("rombels.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )


def downgrade():
    op.drop_table("schedule_event_rombels")
