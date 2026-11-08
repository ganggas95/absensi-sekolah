"""allow students without NISN"""

from alembic import op


revision = "0003_optional_student_nisn"
down_revision = "0002_teacher_subject_schedule"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column("students", "nisn", nullable=True)


def downgrade():
    op.alter_column("students", "nisn", nullable=False)
