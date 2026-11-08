from datetime import time
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import current_user, require_admin
from app.models import (
    AcademicYear,
    ExamPeriod,
    Role,
    Rombel,
    ScheduleBreak,
    ScheduleEvent,
    ScheduleEventType,
    Subject,
    Teacher,
    User,
)
from app.schemas import (
    ExamPeriodCreate,
    ExamPeriodOut,
    ExamPeriodUpdate,
    PaginatedResponse,
    ScheduleBreakCreate,
    ScheduleBreakOut,
    ScheduleBreakUpdate,
    ScheduleEventCreate,
    ScheduleEventOut,
    ScheduleEventUpdate,
)

router = APIRouter(prefix="/api/v1/schedules")


def validate_schedule_break(
    day_of_weeks: list[int],
    start_time: time,
    end_time: time,
    db: Session,
    current_id: UUID | None = None,
) -> None:
    if start_time >= end_time:
        raise HTTPException(
            status_code=422, detail="Waktu selesai harus setelah waktu mulai"
        )
    days = set(day_of_weeks)
    conflicts = db.query(ScheduleBreak).filter(
        ScheduleBreak.start_time < end_time,
        ScheduleBreak.end_time > start_time,
    )
    if current_id:
        conflicts = conflicts.filter(ScheduleBreak.id != current_id)
    if any(days.intersection(item.day_of_weeks) for item in conflicts.all()):
        raise HTTPException(
            status_code=409, detail="Jadwal istirahat bertabrakan pada hari yang sama"
        )


@router.get("/breaks", response_model=list[ScheduleBreakOut])
def list_schedule_breaks(
    _: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    return db.query(ScheduleBreak).order_by(
        ScheduleBreak.start_time, ScheduleBreak.id
    ).all()


@router.post("/breaks", response_model=ScheduleBreakOut, status_code=201)
def create_schedule_break(
    payload: ScheduleBreakCreate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    validate_schedule_break(
        payload.day_of_weeks, payload.start_time, payload.end_time, db
    )
    schedule_break = ScheduleBreak(**payload.model_dump())
    db.add(schedule_break)
    db.commit()
    db.refresh(schedule_break)
    return schedule_break


@router.put("/breaks/{break_id}", response_model=ScheduleBreakOut)
def update_schedule_break(
    break_id: UUID,
    payload: ScheduleBreakUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    schedule_break = db.get(ScheduleBreak, break_id)
    if not schedule_break:
        raise HTTPException(status_code=404, detail="Jadwal istirahat tidak ditemukan")
    values = {
        "day_of_weeks": schedule_break.day_of_weeks,
        "start_time": schedule_break.start_time,
        "end_time": schedule_break.end_time,
        **payload.model_dump(exclude_unset=True),
    }
    validate_schedule_break(
        values["day_of_weeks"],
        values["start_time"],
        values["end_time"],
        db,
        break_id,
    )
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(schedule_break, key, value)
    db.commit()
    db.refresh(schedule_break)
    return schedule_break


@router.delete("/breaks/{break_id}", status_code=204)
def delete_schedule_break(
    break_id: UUID,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    schedule_break = db.get(ScheduleBreak, break_id)
    if not schedule_break:
        raise HTTPException(status_code=404, detail="Jadwal istirahat tidak ditemukan")
    db.delete(schedule_break)
    db.commit()


def validate_schedule(
    payload: ScheduleEventCreate | ScheduleEventUpdate,
    db: Session,
    current_id: UUID | None = None,
) -> None:
    values = payload.model_dump(exclude_unset=True)
    event_type = values.get("event_type")
    academic_year_id = values.get("academic_year_id")
    exam_period_id = values.get("exam_period_id")
    rombel_ids = (
        values["rombel_ids"]
        if values.get("rombel_ids") is not None
        else [values["rombel_id"]] if values.get("rombel_id") else []
    )
    if not rombel_ids or len(rombel_ids) != len(set(rombel_ids)):
        raise HTTPException(status_code=422, detail="Pilih rombel jadwal yang valid")
    if values.get("rombel_id") != rombel_ids[0]:
        raise HTTPException(
            status_code=422, detail="Rombel utama harus menjadi rombel pertama"
        )
    subject_id = values.get("subject_id")
    teacher_id = values.get("teacher_id")
    if academic_year_id and not db.get(AcademicYear, academic_year_id):
        raise HTTPException(status_code=422, detail="Tahun ajaran tidak ditemukan")
    rombels = db.query(Rombel).filter(Rombel.id.in_(rombel_ids)).all()
    if len(rombels) != len(rombel_ids):
        raise HTTPException(status_code=422, detail="Rombel tidak ditemukan")
    if any(
        rombel.academic_year_id and rombel.academic_year_id != academic_year_id
        for rombel in rombels
    ):
        raise HTTPException(
            status_code=422, detail="Tahun ajaran rombel tidak sesuai dengan jadwal"
        )
    subject = db.get(Subject, subject_id) if subject_id else None
    teacher = db.get(Teacher, teacher_id) if teacher_id else None
    if subject_id and (not subject or not subject.is_active):
        raise HTTPException(
            status_code=422, detail="Mata Pelajaran tidak aktif atau tidak ditemukan"
        )
    if teacher_id and (not teacher or not teacher.is_active):
        raise HTTPException(
            status_code=422, detail="Guru tidak aktif atau tidak ditemukan"
        )
    if (
        event_type == ScheduleEventType.KBM
        and subject
        and teacher
        and subject not in teacher.subjects
    ):
        raise HTTPException(
            status_code=422, detail="Guru belum mengampu Mata Pelajaran tersebut"
        )
    if event_type == ScheduleEventType.KBM:
        if len(rombel_ids) > 1 and not all(
            rombel.academic_year_id == academic_year_id for rombel in rombels
        ):
            raise HTTPException(
                status_code=422,
                detail="Semua rombel gabungan harus terdaftar pada tahun ajaran jadwal",
            )
        if exam_period_id:
            raise HTTPException(
                status_code=422, detail="Jadwal KBM tidak boleh memakai periode ujian"
            )
        if values.get("day_of_week") is None or values.get("schedule_date") is not None:
            raise HTTPException(
                status_code=422,
                detail="Jadwal Mapel wajib memakai hari dan tidak memakai tanggal",
            )
        day = values["day_of_week"]
        start = values.get("start_time")
        end = values.get("end_time")
        query = db.query(ScheduleEvent).filter(
            ScheduleEvent.event_type == ScheduleEventType.KBM,
            ScheduleEvent.academic_year_id == academic_year_id,
            ScheduleEvent.day_of_week == day,
        )
    else:
        if len(rombel_ids) > 1:
            raise HTTPException(
                status_code=422, detail="Jadwal ujian hanya dapat memakai satu rombel"
            )
        exam_period = db.get(ExamPeriod, exam_period_id) if exam_period_id else None
        if not exam_period:
            raise HTTPException(status_code=422, detail="Periode ujian wajib dipilih")
        if exam_period.academic_year_id != academic_year_id:
            raise HTTPException(
                status_code=422, detail="Tahun ajaran tidak sesuai dengan periode ujian"
            )
        if rombels[0].academic_year_id != academic_year_id:
            raise HTTPException(
                status_code=422,
                detail="Rombel harus terdaftar pada tahun ajaran jadwal",
            )
        if not values.get("schedule_date") or not (
            exam_period.start_date <= values["schedule_date"] <= exam_period.end_date
        ):
            raise HTTPException(
                status_code=422,
                detail="Tanggal ujian harus berada dalam rentang periode ujian",
            )
        if values.get("schedule_date") is None or values.get("day_of_week") is not None:
            raise HTTPException(
                status_code=422,
                detail="Jadwal Ujian wajib memakai tanggal dan tidak memakai hari",
            )
        start = values.get("start_time")
        end = values.get("end_time")
        query = db.query(ScheduleEvent).filter(
            ScheduleEvent.event_type == ScheduleEventType.EXAM,
            ScheduleEvent.academic_year_id == academic_year_id,
            ScheduleEvent.schedule_date == values["schedule_date"],
        )
    if start and end and start >= end:
        raise HTTPException(
            status_code=422, detail="Waktu selesai harus setelah waktu mulai"
        )
    if current_id:
        query = query.filter(ScheduleEvent.id != current_id)
    conflicts = query.filter(
        ScheduleEvent.start_time < end,
        ScheduleEvent.end_time > start,
    ).all()
    rombel_ids_set = set(rombel_ids)
    if any(rombel_ids_set.intersection(conflict.rombel_ids) for conflict in conflicts):
        raise HTTPException(status_code=409, detail="Jadwal Rombel bertabrakan")
    if teacher_id and any(
        conflict.teacher_id == teacher_id for conflict in conflicts
    ):
        raise HTTPException(status_code=409, detail="Jadwal Guru bertabrakan")


@router.get(
    "/events",
    response_model=list[ScheduleEventOut] | PaginatedResponse[ScheduleEventOut],
)
def list_schedule_events(
    event_type: ScheduleEventType | None = None,
    academic_year_id: UUID | None = None,
    rombel_id: UUID | None = None,
    teacher_id: UUID | None = None,
    subject_id: UUID | None = None,
    day_of_week: int | None = Query(default=None, ge=0, le=6),
    page: int | None = Query(default=None, ge=1),
    limit: int | None = Query(default=None, ge=1, le=100),
    current: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    query = db.query(ScheduleEvent)
    if event_type == ScheduleEventType.EXAM and current.role == Role.GURU:
        supervisor = (
            db.query(Teacher)
            .filter(Teacher.user_id == current.id, Teacher.is_active.is_(True))
            .first()
        )
        if not supervisor:
            return []
        query = query.filter(ScheduleEvent.teacher_id == supervisor.id)
    if event_type:
        query = query.filter(ScheduleEvent.event_type == event_type)
    if academic_year_id:
        query = query.filter(ScheduleEvent.academic_year_id == academic_year_id)
    if rombel_id:
        query = query.filter(
            (ScheduleEvent.rombel_id == rombel_id)
            | ScheduleEvent.additional_rombels.any(Rombel.id == rombel_id)
        )
    if teacher_id:
        query = query.filter(ScheduleEvent.teacher_id == teacher_id)
    if subject_id:
        query = query.filter(ScheduleEvent.subject_id == subject_id)
    if day_of_week is not None:
        exam_weekday = (func.extract("dow", ScheduleEvent.schedule_date) + 6) % 7
        query = query.filter(
            (ScheduleEvent.day_of_week == day_of_week)
            | (exam_weekday == day_of_week)
        )
    query = query.order_by(
        ScheduleEvent.schedule_date,
        ScheduleEvent.day_of_week,
        ScheduleEvent.start_time,
        ScheduleEvent.id,
    )
    if page is None and limit is None:
        return query.all()
    page = page or 1
    limit = limit or 10
    total = query.count()
    return PaginatedResponse[ScheduleEventOut](
        items=query.offset((page - 1) * limit).limit(limit).all(),
        total=total,
        page=page,
        limit=limit,
    )


@router.get("/exam-periods", response_model=list[ExamPeriodOut])
def list_exam_periods(
    academic_year_id: UUID | None = None,
    _: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    query = db.query(ExamPeriod)
    if academic_year_id:
        query = query.filter(ExamPeriod.academic_year_id == academic_year_id)
    return query.order_by(ExamPeriod.start_date.desc()).all()


@router.post("/exam-periods", response_model=ExamPeriodOut, status_code=201)
def create_exam_period(
    payload: ExamPeriodCreate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if not db.get(AcademicYear, payload.academic_year_id):
        raise HTTPException(status_code=422, detail="Tahun ajaran tidak ditemukan")
    if (
        db.query(ExamPeriod)
        .filter(
            ExamPeriod.academic_year_id == payload.academic_year_id,
            ExamPeriod.period_type == payload.period_type,
        )
        .first()
    ):
        raise HTTPException(
            status_code=409,
            detail="Periode ujian ini sudah terdaftar pada tahun ajaran",
        )
    period = ExamPeriod(**payload.model_dump())
    db.add(period)
    db.commit()
    db.refresh(period)
    return period


@router.put("/exam-periods/{period_id}", response_model=ExamPeriodOut)
def update_exam_period(
    period_id: UUID,
    payload: ExamPeriodUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    period = db.get(ExamPeriod, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Periode ujian tidak ditemukan")
    values = payload.model_dump(exclude_unset=True, exclude_none=True)
    next_values = {
        "academic_year_id": period.academic_year_id,
        "period_type": period.period_type,
        "start_date": period.start_date,
        "end_date": period.end_date,
        **values,
    }
    if next_values["start_date"] > next_values["end_date"]:
        raise HTTPException(
            status_code=422,
            detail="Tanggal mulai harus sebelum atau sama dengan tanggal selesai",
        )
    if not db.get(AcademicYear, next_values["academic_year_id"]):
        raise HTTPException(status_code=422, detail="Tahun ajaran tidak ditemukan")
    if (
        db.query(ExamPeriod)
        .filter(
            ExamPeriod.id != period.id,
            ExamPeriod.academic_year_id == next_values["academic_year_id"],
            ExamPeriod.period_type == next_values["period_type"],
        )
        .first()
    ):
        raise HTTPException(
            status_code=409,
            detail="Periode ujian ini sudah terdaftar pada tahun ajaran",
        )
    scheduled_events = (
        db.query(ScheduleEvent).filter(ScheduleEvent.exam_period_id == period.id).all()
    )
    if scheduled_events and (
        next_values["academic_year_id"] != period.academic_year_id
        or next_values["period_type"] != period.period_type
    ):
        raise HTTPException(
            status_code=409,
            detail="Tahun ajaran atau jenis periode tidak dapat diubah setelah memiliki jadwal",
        )
    if any(
        not next_values["start_date"] <= event.schedule_date <= next_values["end_date"]
        for event in scheduled_events
    ):
        raise HTTPException(
            status_code=409,
            detail="Rentang tanggal bertabrakan dengan jadwal ujian yang sudah dibuat",
        )
    for key, value in values.items():
        setattr(period, key, value)
    db.commit()
    db.refresh(period)
    return period


@router.delete("/exam-periods/{period_id}", status_code=204)
def delete_exam_period(
    period_id: UUID,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    period = db.get(ExamPeriod, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Periode ujian tidak ditemukan")
    if (
        db.query(ScheduleEvent)
        .filter(ScheduleEvent.exam_period_id == period.id)
        .first()
    ):
        raise HTTPException(
            status_code=409, detail="Periode ujian masih digunakan oleh jadwal"
        )
    db.delete(period)
    db.commit()


@router.post("/events", response_model=ScheduleEventOut, status_code=201)
def create_schedule_event(
    payload: ScheduleEventCreate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    validate_schedule(payload, db)
    values = payload.model_dump(exclude={"rombel_ids"})
    rombel_ids = payload.rombel_ids or [payload.rombel_id]
    values["rombel_id"] = rombel_ids[0]
    event = ScheduleEvent(**values)
    event.additional_rombels = [
        db.get(Rombel, rombel_id) for rombel_id in rombel_ids[1:]
    ]
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.put("/events/{event_id}", response_model=ScheduleEventOut)
def update_schedule_event(
    event_id: UUID,
    payload: ScheduleEventUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    event = db.get(ScheduleEvent, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Jadwal tidak ditemukan")
    values = {
        **{
            "event_type": event.event_type,
            "academic_year_id": event.academic_year_id,
            "rombel_id": event.rombel_id,
            "rombel_ids": event.rombel_ids,
            "exam_period_id": event.exam_period_id,
            "subject_id": event.subject_id,
            "teacher_id": event.teacher_id,
            "schedule_date": event.schedule_date,
            "day_of_week": event.day_of_week,
            "start_time": event.start_time,
            "end_time": event.end_time,
        },
        **payload.model_dump(exclude_unset=True),
    }
    if "rombel_ids" in payload.model_fields_set:
        values["rombel_ids"] = (
            payload.rombel_ids if payload.rombel_ids is not None else event.rombel_ids
        )
        if values["rombel_ids"]:
            values["rombel_id"] = values["rombel_ids"][0]
    elif "rombel_id" in payload.model_fields_set and payload.rombel_id is not None:
        values["rombel_ids"] = [payload.rombel_id]
    if values["rombel_ids"]:
        values["rombel_id"] = values["rombel_ids"][0]
    values["title"] = payload.title or event.title
    values["description"] = (
        payload.description
        if "description" in payload.model_fields_set
        else event.description
    )
    validate_schedule(
        ScheduleEventCreate(**values),
        db,
        event_id,
    )
    for key, value in payload.model_dump(exclude_unset=True).items():
        if key == "rombel_ids":
            continue
        setattr(event, key, value)
    event.rombel_id = values["rombel_id"]
    event.additional_rombels = [
        db.get(Rombel, rombel_id) for rombel_id in values["rombel_ids"][1:]
    ]
    db.commit()
    db.refresh(event)
    return event


@router.delete("/events/{event_id}", status_code=204)
def delete_schedule_event(
    event_id: UUID, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    event = db.get(ScheduleEvent, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Jadwal tidak ditemukan")
    db.delete(event)
    db.commit()
