"""add teacher check-in/check-out attendance"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0008_teacher_attendance"
down_revision = "0007_schedule_breaks"
branch_labels = None
depends_on = None


def upgrade():
    attendance_status = postgresql.ENUM(
        "HADIR",
        "TERLAMBAT",
        "IZIN",
        "SAKIT",
        "ALPA",
        name="attendance_status",
        create_type=False,
    )
    op.create_table(
        "teacher_attendances",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "teacher_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("teachers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("check_in_time", sa.DateTime(timezone=True)),
        sa.Column("check_out_time", sa.DateTime(timezone=True)),
        sa.Column("status", attendance_status, nullable=False),
        sa.Column("check_in_ip", sa.String(45)),
        sa.Column("check_out_ip", sa.String(45)),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("teacher_id", "date", name="uq_teacher_attendance_date"),
    )
    op.create_index(
        "ix_teacher_attendances_teacher_id", "teacher_attendances", ["teacher_id"]
    )
    op.create_index("ix_teacher_attendances_date", "teacher_attendances", ["date"])


def downgrade():
    op.drop_index("ix_teacher_attendances_date", table_name="teacher_attendances")
    op.drop_index("ix_teacher_attendances_teacher_id", table_name="teacher_attendances")
    op.drop_table("teacher_attendances")
