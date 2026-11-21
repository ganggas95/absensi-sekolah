from datetime import date, datetime, time, timedelta, timezone
from io import BytesIO
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_admin
from app.models import (
    AttendanceStatus,
    DailyAttendance,
    EventAttendance,
    ExamPeriod,
    Rombel,
    ScheduleEvent,
    ScheduleEventType,
    Student,
    Subject,
    User,
)

router = APIRouter(prefix="/api/v1/reports")
REPORT_TIMEZONE = ZoneInfo("Asia/Makassar")
STATUS_LABELS = {
    "HADIR": "Hadir",
    "TERLAMBAT": "Terlambat",
    "IZIN": "Izin",
    "SAKIT": "Sakit",
    "ALPA": "Alpa",
}
REPORT_HEADERS = [
    "Tanggal",
    "Nama Siswa",
    "NISN",
    "Rombel",
    "Mata Pelajaran",
    "Sesi",
    "Status",
    "Waktu Masuk",
    "Waktu Pulang",
    "Catatan",
]


def _validate_dates(date_from: date | None, date_to: date | None) -> None:
    if date_from and date_to and date_from > date_to:
        raise HTTPException(
            status_code=422,
            detail="Tanggal mulai harus sebelum atau sama dengan tanggal selesai.",
        )


def _local_day_utc(value: date) -> datetime:
    return datetime.combine(value, time.min, REPORT_TIMEZONE).astimezone(timezone.utc)


def _local_datetime(value: datetime | None) -> str:
    if not value:
        return ""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(REPORT_TIMEZONE).strftime("%H:%M")


def _row(
    *,
    attendance_date: date,
    student: Student,
    rombel: Rombel | None,
    subject: Subject | None = None,
    session: str = "",
    status: str,
    check_in: datetime | None = None,
    check_out: datetime | None = None,
    notes: str | None = None,
) -> dict[str, str]:
    return {
        "date": attendance_date.isoformat(),
        "student_name": student.full_name,
        "nisn": student.nisn or "",
        "rombel": rombel.name if rombel else "",
        "subject": subject.name if subject else "",
        "session": session,
        "status": status,
        "check_in": _local_datetime(check_in),
        "check_out": _local_datetime(check_out),
        "notes": notes or "",
    }


def _summary(rows: list[dict[str, str]]) -> dict[str, int]:
    result = {label: 0 for label in STATUS_LABELS.values()}
    for row in rows:
        label = STATUS_LABELS.get(row["status"], row["status"])
        result[label] = result.get(label, 0) + 1
    return result


def _daily_rows(
    db: Session,
    date_from: date | None,
    date_to: date | None,
    rombel_id: UUID | None,
    student_id: UUID | None,
    status: AttendanceStatus | None,
    subject_id: UUID | None = None,
    schedule_event_id: UUID | None = None,
    kbm_only: bool = False,
) -> list[dict[str, str]]:
    """Rows of session-scoped KBM attendance.

    Each schedule session stores its own records, so the same student can
    appear once per schedule on the same day without mixing teachers.
    """

    query = (
        db.query(DailyAttendance, Student, Rombel, ScheduleEvent, Subject)
        .join(Student, Student.id == DailyAttendance.student_id)
        .outerjoin(Rombel, Rombel.id == Student.rombel_id)
        .outerjoin(
            ScheduleEvent, ScheduleEvent.id == DailyAttendance.schedule_event_id
        )
        .outerjoin(Subject, Subject.id == ScheduleEvent.subject_id)
    )
    if kbm_only:
        query = query.filter(ScheduleEvent.event_type == ScheduleEventType.KBM)
    if date_from:
        query = query.filter(DailyAttendance.date >= date_from)
    if date_to:
        query = query.filter(DailyAttendance.date <= date_to)
    if rombel_id:
        query = query.filter(Student.rombel_id == rombel_id)
    if student_id:
        query = query.filter(Student.id == student_id)
    if status:
        query = query.filter(DailyAttendance.status == status)
    if subject_id:
        query = query.filter(ScheduleEvent.subject_id == subject_id)
    if schedule_event_id:
        query = query.filter(DailyAttendance.schedule_event_id == schedule_event_id)
    entries = query.order_by(
        DailyAttendance.date.desc(), Student.full_name, ScheduleEvent.start_time
    ).all()
    return [
        _row(
            attendance_date=attendance.date,
            student=student,
            rombel=rombel,
            subject=subject,
            session=schedule.title if schedule else "",
            status=attendance.status.value,
            check_in=attendance.check_in_time,
            check_out=attendance.check_out_time,
            notes=attendance.notes,
        )
        for attendance, student, rombel, schedule, subject in entries
    ]


def _event_rows(
    db: Session,
    event_type: ScheduleEventType,
    date_from: date | None,
    date_to: date | None,
    rombel_id: UUID | None,
    student_id: UUID | None,
    subject_id: UUID | None,
    schedule_event_id: UUID | None,
    exam_period_id: UUID | None = None,
) -> list[dict[str, str]]:
    query = (
        db.query(EventAttendance, Student, Rombel, Subject, ScheduleEvent)
        .join(Student, Student.id == EventAttendance.student_id)
        .join(ScheduleEvent, ScheduleEvent.id == EventAttendance.schedule_event_id)
        .join(Rombel, Rombel.id == Student.rombel_id)
        .join(Subject, Subject.id == ScheduleEvent.subject_id)
        .filter(ScheduleEvent.event_type == event_type)
    )
    if event_type == ScheduleEventType.KBM:
        if date_from:
            query = query.filter(
                EventAttendance.recorded_at >= _local_day_utc(date_from)
            )
        if date_to:
            query = query.filter(
                EventAttendance.recorded_at
                < _local_day_utc(date_to + timedelta(days=1))
            )
    else:
        if date_from:
            query = query.filter(ScheduleEvent.schedule_date >= date_from)
        if date_to:
            query = query.filter(ScheduleEvent.schedule_date <= date_to)
        if exam_period_id:
            query = query.filter(ScheduleEvent.exam_period_id == exam_period_id)
    if rombel_id:
        query = query.filter(Student.rombel_id == rombel_id)
    if student_id:
        query = query.filter(Student.id == student_id)
    if subject_id:
        query = query.filter(ScheduleEvent.subject_id == subject_id)
    if schedule_event_id:
        query = query.filter(ScheduleEvent.id == schedule_event_id)
    entries = query.order_by(
        EventAttendance.recorded_at.desc(), Student.full_name
    ).all()
    rows = []
    for attendance, student, rombel, subject, event in entries:
        event_date = event.schedule_date
        if event_type == ScheduleEventType.KBM:
            event_date = attendance.recorded_at
            if event_date.tzinfo is None:
                event_date = event_date.replace(tzinfo=timezone.utc)
            event_date = event_date.astimezone(REPORT_TIMEZONE).date()
        rows.append(
            _row(
                attendance_date=event_date,
                student=student,
                rombel=rombel,
                subject=subject,
                session=event.title,
                status=attendance.status.value,
                notes=attendance.notes,
            )
        )
    return rows


def _report(rows: list[dict[str, str]]) -> dict[str, object]:
    return {"total": len(rows), "summary": _summary(rows), "rows": rows}


def _report_response(
    rows: list[dict[str, str]], file_type: str, report_name: str
) -> StreamingResponse:
    output = BytesIO()
    if file_type == "xlsx":
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "Laporan Absensi"
        sheet.append(REPORT_HEADERS)
        columns = [
            "date",
            "student_name",
            "nisn",
            "rombel",
            "subject",
            "session",
            "status",
            "check_in",
            "check_out",
            "notes",
        ]
        for row in rows:
            sheet.append([row[column] for column in columns])
        sheet.freeze_panes = "A2"
        sheet.auto_filter.ref = sheet.dimensions
        workbook.save(output)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        extension = "xlsx"
    else:
        document = SimpleDocTemplate(output, pagesize=landscape(A4), title=report_name)
        table_rows = [REPORT_HEADERS]
        columns = [
            "date",
            "student_name",
            "nisn",
            "rombel",
            "subject",
            "session",
            "status",
            "check_in",
            "check_out",
            "notes",
        ]
        table_rows.extend([[row[column] for column in columns] for row in rows])
        table = Table(table_rows, repeatRows=1)
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#315efb")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#d8deea")),
                    ("FONTSIZE", (0, 0), (-1, -1), 7),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    (
                        "ROWBACKGROUNDS",
                        (0, 1),
                        (-1, -1),
                        [colors.white, colors.HexColor("#f5f7fb")],
                    ),
                ]
            )
        )
        document.build([table])
        media_type = "application/pdf"
        extension = "pdf"
    output.seek(0)
    return StreamingResponse(
        output,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{report_name}.{extension}"'
        },
    )


@router.get("/daily")
def daily_report(
    date_from: date | None = None,
    date_to: date | None = None,
    rombel_id: UUID | None = None,
    student_id: UUID | None = None,
    status: AttendanceStatus | None = None,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    _validate_dates(date_from, date_to)
    return _report(_daily_rows(db, date_from, date_to, rombel_id, student_id, status))


@router.get("/daily/export")
def export_daily_report(
    file_type: str = Query(default="pdf", alias="format", pattern="^(pdf|xlsx)$"),
    date_from: date | None = None,
    date_to: date | None = None,
    rombel_id: UUID | None = None,
    student_id: UUID | None = None,
    status: AttendanceStatus | None = None,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    _validate_dates(date_from, date_to)
    rows = _daily_rows(db, date_from, date_to, rombel_id, student_id, status)
    return _report_response(rows, file_type, "laporan-absensi-harian")


@router.get("/class")
def class_report(
    date_from: date | None = None,
    date_to: date | None = None,
    rombel_id: UUID | None = None,
    student_id: UUID | None = None,
    subject_id: UUID | None = None,
    schedule_event_id: UUID | None = None,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    _validate_dates(date_from, date_to)
    rows = _daily_rows(
        db,
        date_from,
        date_to,
        rombel_id,
        student_id,
        status=None,
        subject_id=subject_id,
        schedule_event_id=schedule_event_id,
        kbm_only=True,
    )
    return _report(rows)


@router.get("/class/export")
def export_class_report(
    file_type: str = Query(default="pdf", alias="format", pattern="^(pdf|xlsx)$"),
    date_from: date | None = None,
    date_to: date | None = None,
    rombel_id: UUID | None = None,
    student_id: UUID | None = None,
    subject_id: UUID | None = None,
    schedule_event_id: UUID | None = None,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    _validate_dates(date_from, date_to)
    rows = _daily_rows(
        db,
        date_from,
        date_to,
        rombel_id,
        student_id,
        status=None,
        subject_id=subject_id,
        schedule_event_id=schedule_event_id,
        kbm_only=True,
    )
    return _report_response(rows, file_type, "laporan-absensi-kbm")


@router.get("/exam")
def exam_report(
    date_from: date | None = None,
    date_to: date | None = None,
    rombel_id: UUID | None = None,
    student_id: UUID | None = None,
    subject_id: UUID | None = None,
    schedule_event_id: UUID | None = None,
    exam_period_id: UUID | None = None,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    _validate_dates(date_from, date_to)
    if exam_period_id and not db.get(ExamPeriod, exam_period_id):
        raise HTTPException(status_code=422, detail="Periode ujian tidak ditemukan.")
    rows = _event_rows(
        db,
        ScheduleEventType.EXAM,
        date_from,
        date_to,
        rombel_id,
        student_id,
        subject_id,
        schedule_event_id,
        exam_period_id,
    )
    return _report(rows)


@router.get("/exam/export")
def export_exam_report(
    file_type: str = Query(default="pdf", alias="format", pattern="^(pdf|xlsx)$"),
    date_from: date | None = None,
    date_to: date | None = None,
    rombel_id: UUID | None = None,
    student_id: UUID | None = None,
    subject_id: UUID | None = None,
    schedule_event_id: UUID | None = None,
    exam_period_id: UUID | None = None,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    _validate_dates(date_from, date_to)
    if exam_period_id and not db.get(ExamPeriod, exam_period_id):
        raise HTTPException(status_code=422, detail="Periode ujian tidak ditemukan.")
    rows = _event_rows(
        db,
        ScheduleEventType.EXAM,
        date_from,
        date_to,
        rombel_id,
        student_id,
        subject_id,
        schedule_event_id,
        exam_period_id,
    )
    return _report_response(rows, file_type, "laporan-absensi-ujian")
