import uuid
from datetime import date as date_type, datetime, time
from typing import Generic, Self, TypeVar

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import (
    AttendanceStatus,
    EventAttendanceStatus,
    ExamPeriodType,
    Role,
    ScheduleEventType,
    Student,
)

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    limit: int


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    username: str
    full_name: str
    role: Role
    is_active: bool


class LoginRequest(BaseModel):
    username: str
    password: str = Field(min_length=6)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=6)
    full_name: str = Field(min_length=2, max_length=100)
    role: Role = Role.GURU


class UserUpdate(BaseModel):
    username: str | None = Field(default=None, min_length=3, max_length=50)
    password: str | None = Field(default=None, min_length=6)
    full_name: str | None = Field(default=None, min_length=2, max_length=100)
    role: Role | None = None
    is_active: bool | None = None


class TeacherCreate(BaseModel):
    user_id: uuid.UUID
    nip: str | None = Field(default=None, max_length=30)
    phone: str | None = Field(default=None, max_length=20)
    is_active: bool = True


class TeacherUpdate(BaseModel):
    user_id: uuid.UUID | None = None
    nip: str | None = Field(default=None, max_length=30)
    phone: str | None = Field(default=None, max_length=20)
    is_active: bool | None = None


class TeacherOut(TeacherCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    full_name: str | None = None
    username: str | None = None
    subject_ids: list[uuid.UUID] = []


class TeacherSubjectUpdate(BaseModel):
    subject_ids: list[uuid.UUID] = []


class SubjectCreate(BaseModel):
    code: str = Field(min_length=1, max_length=30)
    name: str = Field(min_length=2, max_length=100)
    is_active: bool = True


class SubjectUpdate(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=30)
    name: str | None = Field(default=None, min_length=2, max_length=100)
    is_active: bool | None = None


class SubjectOut(SubjectCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID


class ExamPeriodCreate(BaseModel):
    academic_year_id: uuid.UUID
    period_type: ExamPeriodType
    start_date: date_type
    end_date: date_type

    @model_validator(mode="after")
    def validate_date_range(self) -> Self:
        if self.start_date > self.end_date:
            raise ValueError(
                "Tanggal mulai harus sebelum atau sama dengan tanggal selesai."
            )
        return self


class ExamPeriodUpdate(BaseModel):
    academic_year_id: uuid.UUID | None = None
    period_type: ExamPeriodType | None = None
    start_date: date_type | None = None
    end_date: date_type | None = None

    @model_validator(mode="after")
    def validate_date_range(self) -> Self:
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValueError(
                "Tanggal mulai harus sebelum atau sama dengan tanggal selesai."
            )
        return self


class ExamPeriodOut(ExamPeriodCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID


class ScheduleEventCreate(BaseModel):
    event_type: ScheduleEventType
    title: str = Field(min_length=2, max_length=100)
    description: str | None = None
    academic_year_id: uuid.UUID
    exam_period_id: uuid.UUID | None = None
    rombel_id: uuid.UUID
    rombel_ids: list[uuid.UUID] | None = None
    subject_id: uuid.UUID
    teacher_id: uuid.UUID
    schedule_date: date_type | None = None
    day_of_week: int | None = Field(default=None, ge=0, le=6)
    start_time: time
    end_time: time


class ScheduleEventUpdate(BaseModel):
    event_type: ScheduleEventType | None = None
    title: str | None = Field(default=None, min_length=2, max_length=100)
    description: str | None = None
    academic_year_id: uuid.UUID | None = None
    exam_period_id: uuid.UUID | None = None
    rombel_id: uuid.UUID | None = None
    rombel_ids: list[uuid.UUID] | None = None
    subject_id: uuid.UUID | None = None
    teacher_id: uuid.UUID | None = None
    schedule_date: date_type | None = None
    day_of_week: int | None = Field(default=None, ge=0, le=6)
    start_time: time | None = None
    end_time: time | None = None


class ScheduleEventOut(ScheduleEventCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    rombel_ids: list[uuid.UUID]


class ScheduleBreakCreate(BaseModel):
    day_of_weeks: list[int] = Field(min_length=1, max_length=7)
    start_time: time
    end_time: time

    @model_validator(mode="after")
    def validate_days_and_times(self) -> Self:
        if (
            any(day < 0 or day > 6 for day in self.day_of_weeks)
            or len(self.day_of_weeks) != len(set(self.day_of_weeks))
        ):
            raise ValueError("Pilih hari istirahat yang valid dan tidak berulang")
        if self.start_time >= self.end_time:
            raise ValueError("Waktu selesai harus setelah waktu mulai")
        return self


class ScheduleBreakUpdate(BaseModel):
    day_of_weeks: list[int] | None = Field(default=None, min_length=1, max_length=7)
    start_time: time | None = None
    end_time: time | None = None

    @model_validator(mode="after")
    def validate_days(self) -> Self:
        if self.day_of_weeks is not None and (
            any(day < 0 or day > 6 for day in self.day_of_weeks)
            or len(self.day_of_weeks) != len(set(self.day_of_weeks))
        ):
            raise ValueError("Pilih hari istirahat yang valid dan tidak berulang")
        return self


class ScheduleBreakOut(ScheduleBreakCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID


class AcademicYearCreate(BaseModel):
    year_name: str = Field(min_length=1, max_length=20)
    is_active: bool = False


class AcademicYearUpdate(BaseModel):
    year_name: str | None = Field(default=None, min_length=1, max_length=20)
    is_active: bool | None = None


class AcademicYearOut(AcademicYearCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID


class RombelCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    academic_year_id: uuid.UUID | None = None
    homeroom_teacher_id: uuid.UUID | None = None


class RombelUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=50)
    academic_year_id: uuid.UUID | None = None
    homeroom_teacher_id: uuid.UUID | None = None


class RombelOut(RombelCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID


class StudentCreate(BaseModel):
    nisn: str | None = Field(default=None, max_length=20)
    full_name: str = Field(min_length=2, max_length=100)
    gender: str | None = Field(default=None, pattern="^[LP]$")
    rombel_id: uuid.UUID | None = None
    parent_phone: str | None = None
    is_active: bool = True


class StudentUpdate(BaseModel):
    nisn: str | None = Field(default=None, min_length=1, max_length=20)
    full_name: str | None = Field(default=None, min_length=2, max_length=100)
    gender: str | None = Field(default=None, pattern="^[LP]$")
    rombel_id: uuid.UUID | None = None
    parent_phone: str | None = None
    is_active: bool | None = None


class StudentOut(StudentCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    id_siswa: uuid.UUID
    photo_url: str | None = None


class StudentCardPreview(BaseModel):
    id: uuid.UUID
    id_siswa: uuid.UUID
    nisn: str | None
    full_name: str
    gender: str | None
    class_name: str | None
    photo_url: str | None
    qr_data_url: str

    @classmethod
    def from_student(cls, student: Student, qr_data_url: str) -> Self:
        return cls(
            id=student.id,
            id_siswa=student.id_siswa,
            nisn=student.nisn,
            full_name=student.full_name,
            gender=student.gender,
            class_name=student.rombel.name if student.rombel else None,
            photo_url=student.photo_url,
            qr_data_url=qr_data_url,
        )


class StudentCardBatchRequest(BaseModel):
    student_ids: list[uuid.UUID] | None = Field(
        default=None, min_length=1, max_length=500
    )
    rombel_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def validate_filter(self) -> Self:
        if (self.student_ids is None) == (self.rombel_id is None):
            raise ValueError("Pilih student_ids atau rombel_id.")
        if self.student_ids and len(set(self.student_ids)) != len(self.student_ids):
            raise ValueError("student_ids tidak boleh duplikat.")
        return self


class ExamCardBatchRequest(BaseModel):
    exam_period_id: uuid.UUID
    rombel_id: uuid.UUID
    student_ids: list[uuid.UUID] | None = Field(
        default=None, min_length=1, max_length=500
    )

    @model_validator(mode="after")
    def validate_student_ids(self) -> Self:
        if self.student_ids and len(set(self.student_ids)) != len(self.student_ids):
            raise ValueError("student_ids tidak boleh duplikat.")
        return self


class ExamCardPreview(BaseModel):
    id: uuid.UUID
    id_siswa: uuid.UUID
    nisn: str | None
    full_name: str
    class_name: str | None
    photo_url: str | None
    qr_data_url: str
    exam_name: str
    academic_year_name: str


class EventAttendanceRecord(BaseModel):
    schedule_event_id: uuid.UUID
    student_id: uuid.UUID
    status: EventAttendanceStatus = EventAttendanceStatus.HADIR
    notes: str | None = None


class EventAttendanceOut(BaseModel):
    student_id: uuid.UUID
    full_name: str
    nisn: str | None
    status: EventAttendanceStatus | None
    recorded_at: datetime | None
    already_recorded: bool = False


class DailyRecord(BaseModel):
    schedule_event_id: uuid.UUID
    id_siswa: uuid.UUID | None = None
    student_id: uuid.UUID | None = None
    nisn: str | None = None
    date: date_type | None = None
    check_in: bool = True
    status: AttendanceStatus = AttendanceStatus.HADIR
    notes: str | None = None


class AttendanceConfigOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    config_name: str
    check_in_start: time
    check_in_end: time
    check_out_start: time
    check_out_end: time
    late_threshold: time
    is_active: bool


class DailyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    student_id: uuid.UUID
    student_name: str | None = None
    date: date_type
    check_in_time: datetime | None
    check_out_time: datetime | None
    status: AttendanceStatus
    notes: str | None
    already_recorded: bool = False
