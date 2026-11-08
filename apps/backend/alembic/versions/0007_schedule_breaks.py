"""add weekly break schedules"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0007_schedule_breaks"
down_revision = "0006_shared_schedule_rombels"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "schedule_breaks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("day_of_weeks", sa.JSON(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
    )


def downgrade():
    op.drop_table("schedule_breaks")
