import enum
import uuid
from datetime import date, datetime, time, timezone

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    Column,
    ForeignKey,
    JSON,
    String,
    Table,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Role(str, enum.Enum):
    ADMIN = "ADMIN"
    GURU = "GURU"


class AttendanceStatus(str, enum.Enum):
    HADIR = "HADIR"
    TERLAMBAT = "TERLAMBAT"
    IZIN = "IZIN"
    SAKIT = "SAKIT"
    ALPA = "ALPA"


class EventAttendanceStatus(str, enum.Enum):
    HADIR = "HADIR"
    IZIN = "IZIN"
    SAKIT = "SAKIT"
    ALPA = "ALPA"


class ScheduleEventType(str, enum.Enum):
    KBM = "KBM"
    EXAM = "EXAM"


class ExamPeriodType(str, enum.Enum):
    GANJIL = "GANJIL"
    GENAP = "GENAP"
    MID_SEMESTER = "MID_SEMESTER"


class User(Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(100))
    role: Mapped[Role] = mapped_column(Enum(Role, name="user_role"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class Teacher(Base):
    __tablename__ = "teachers"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )
    nip: Mapped[str | None] = mapped_column(String(30), unique=True)
    phone: Mapped[str | None] = mapped_column(String(20))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    user: Mapped[User] = relationship()
    subjects: Mapped[list["Subject"]] = relationship(
        secondary="teacher_subjects", back_populates="teachers"
    )


class Subject(Base):
    __tablename__ = "subjects"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    teachers: Mapped[list[Teacher]] = relationship(
        secondary="teacher_subjects", back_populates="subjects"
    )


class TeacherSubject(Base):
    __tablename__ = "teacher_subjects"
    teacher_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("teachers.id", ondelete="CASCADE"), primary_key=True
    )
    subject_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("subjects.id", ondelete="CASCADE"), primary_key=True
    )


class AcademicYear(Base):
    __tablename__ = "academic_years"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    year_name: Mapped[str] = mapped_column(String(20), unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    rombels: Mapped[list["Rombel"]] = relationship(back_populates="academic_year")


class Rombel(Base):
    __tablename__ = "rombels"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(50))
    academic_year_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("academic_years.id", ondelete="CASCADE")
    )
    homeroom_teacher_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    academic_year: Mapped[AcademicYear | None] = relationship(back_populates="rombels")
    students: Mapped[list["Student"]] = relationship(back_populates="rombel")


class ExamPeriod(Base):
    __tablename__ = "exam_periods"
    __table_args__ = (
        UniqueConstraint(
            "academic_year_id", "period_type", name="uq_exam_period_year_type"
        ),
    )
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    academic_year_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("academic_years.id", ondelete="CASCADE"), index=True
    )
    period_type: Mapped[ExamPeriodType] = mapped_column(
        Enum(ExamPeriodType, name="exam_period_type")
    )
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    academic_year: Mapped[AcademicYear] = relationship()


class Student(Base):
    __tablename__ = "students"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    nisn: Mapped[str | None] = mapped_column(String(20), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(100), index=True)
    gender: Mapped[str | None] = mapped_column(String(1))
    rombel_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("rombels.id", ondelete="SET NULL"), index=True
    )
    parent_phone: Mapped[str | None] = mapped_column(String(20))
    photo_url: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    rombel: Mapped[Rombel | None] = relationship(back_populates="students")

    @property
    def id_siswa(self) -> uuid.UUID:
        return self.id


class AttendanceConfig(Base):
    __tablename__ = "attendance_configs"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    config_name: Mapped[str] = mapped_column(String(50))
    check_in_start: Mapped[time] = mapped_column(Time)
    check_in_end: Mapped[time] = mapped_column(Time)
    check_out_start: Mapped[time] = mapped_column(Time)
    check_out_end: Mapped[time] = mapped_column(Time)
    late_threshold: Mapped[time] = mapped_column(Time)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


schedule_event_rombels = Table(
    "schedule_event_rombels",
    Base.metadata,
    Column(
        "schedule_event_id",
        ForeignKey("schedule_events.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "rombel_id",
        ForeignKey("rombels.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class ScheduleEvent(Base):
    __tablename__ = "schedule_events"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    event_type: Mapped[ScheduleEventType] = mapped_column(
        Enum(ScheduleEventType, name="schedule_event_type")
    )
    title: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text)
    academic_year_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("academic_years.id", ondelete="CASCADE")
    )
    exam_period_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("exam_periods.id", ondelete="RESTRICT"), index=True
    )
    rombel_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("rombels.id", ondelete="CASCADE")
    )
    subject_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("subjects.id", ondelete="RESTRICT")
    )
    teacher_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("teachers.id", ondelete="RESTRICT")
    )
    schedule_date: Mapped[date | None] = mapped_column(Date)
    day_of_week: Mapped[int | None] = mapped_column()
    start_time: Mapped[time] = mapped_column(Time)
    end_time: Mapped[time] = mapped_column(Time)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    additional_rombels: Mapped[list[Rombel]] = relationship(
        secondary=schedule_event_rombels
    )

    @property
    def rombel_ids(self) -> list[uuid.UUID]:
        return [self.rombel_id, *(rombel.id for rombel in self.additional_rombels)]


class ScheduleBreak(Base):
    __tablename__ = "schedule_breaks"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    day_of_weeks: Mapped[list[int]] = mapped_column(JSON)
    start_time: Mapped[time] = mapped_column(Time)
    end_time: Mapped[time] = mapped_column(Time)


class DailyAttendance(Base):
    __tablename__ = "daily_attendances"
    __table_args__ = (
        UniqueConstraint("student_id", "date", name="uq_daily_student_date"),
    )
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    student_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"), index=True
    )
    date: Mapped[date] = mapped_column(Date, index=True)
    check_in_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    check_out_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[AttendanceStatus] = mapped_column(
        Enum(AttendanceStatus, name="attendance_status")
    )
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class TeacherAttendance(Base):
    __tablename__ = "teacher_attendances"
    __table_args__ = (
        UniqueConstraint("teacher_id", "date", name="uq_teacher_attendance_date"),
    )
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    teacher_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("teachers.id", ondelete="CASCADE"), index=True
    )
    date: Mapped[date] = mapped_column(Date, index=True)
    check_in_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    check_out_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[AttendanceStatus] = mapped_column(
        Enum(AttendanceStatus, name="attendance_status")
    )
    check_in_ip: Mapped[str | None] = mapped_column(String(45))
    check_out_ip: Mapped[str | None] = mapped_column(String(45))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    teacher: Mapped[Teacher] = relationship()


class EventAttendance(Base):
    __tablename__ = "event_attendances"
    __table_args__ = (
        UniqueConstraint(
            "schedule_event_id",
            "student_id",
            name="uq_event_attendance_student_schedule",
        ),
    )
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    schedule_event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("schedule_events.id", ondelete="CASCADE"), index=True
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[EventAttendanceStatus] = mapped_column(
        Enum(EventAttendanceStatus, name="event_attendance_status")
    )
    notes: Mapped[str | None] = mapped_column(Text)
    recorded_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
