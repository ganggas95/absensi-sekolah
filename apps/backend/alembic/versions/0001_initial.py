"""initial schema"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("username", sa.String(50), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(100), nullable=False),
        sa.Column("role", sa.Enum("ADMIN", "GURU", name="user_role"), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "academic_years",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("year_name", sa.String(20), nullable=False, unique=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "rombels",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column(
            "academic_year_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("academic_years.id", ondelete="CASCADE"),
        ),
        sa.Column(
            "homeroom_teacher_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "students",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("nisn", sa.String(20), nullable=False, unique=True),
        sa.Column("full_name", sa.String(100), nullable=False),
        sa.Column("gender", sa.String(1)),
        sa.Column(
            "rombel_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("rombels.id", ondelete="SET NULL"),
        ),
        sa.Column("parent_phone", sa.String(20)),
        sa.Column("photo_url", sa.String(255)),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "attendance_configs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("config_name", sa.String(50), nullable=False),
        sa.Column("check_in_start", sa.Time(), nullable=False),
        sa.Column("check_in_end", sa.Time(), nullable=False),
        sa.Column("check_out_start", sa.Time(), nullable=False),
        sa.Column("check_out_end", sa.Time(), nullable=False),
        sa.Column("late_threshold", sa.Time(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_table(
        "daily_attendances",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "student_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("students.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("check_in_time", sa.DateTime(timezone=True)),
        sa.Column("check_out_time", sa.DateTime(timezone=True)),
        sa.Column(
            "status",
            sa.Enum(
                "HADIR", "TERLAMBAT", "IZIN", "SAKIT", "ALPA", name="attendance_status"
            ),
            nullable=False,
        ),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("student_id", "date", name="uq_daily_student_date"),
    )


def downgrade():
    op.drop_table("daily_attendances")
    op.drop_table("attendance_configs")
    op.drop_table("students")
    op.drop_table("rombels")
    op.drop_table("academic_years")
    op.drop_table("users")
    op.execute("DROP TYPE attendance_status")
    op.execute("DROP TYPE user_role")
