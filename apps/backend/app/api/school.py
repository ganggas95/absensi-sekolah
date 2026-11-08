from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.management_pagination import paginate
from app.db import get_db
from app.deps import current_user, require_admin
from app.models import (
    AcademicYear,
    ExamPeriod,
    Rombel,
    ScheduleEvent,
    Student,
    Subject,
    User,
)
from app.schemas import (
    AcademicYearCreate,
    AcademicYearOut,
    AcademicYearUpdate,
    PaginatedResponse,
    RombelCreate,
    RombelOut,
    RombelUpdate,
    SubjectCreate,
    SubjectOut,
    SubjectUpdate,
)

router = APIRouter(prefix="/api/v1/management")


@router.get("/subjects", response_model=list[SubjectOut] | PaginatedResponse[SubjectOut])
def list_subjects(
    q: str | None = Query(None, min_length=1, max_length=100),
    is_active: bool | None = None,
    page: int | None = Query(None, ge=1),
    limit: int = Query(10, ge=1, le=100),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    query = db.query(Subject)
    if q and (search := q.strip()):
        query = query.filter(or_(Subject.code.ilike(f"%{search}%"), Subject.name.ilike(f"%{search}%")))
    if is_active is not None:
        query = query.filter(Subject.is_active.is_(is_active))
    query = query.order_by(Subject.name, Subject.id)
    return paginate(query, page, limit) if page is not None else query.all()


@router.post("/subjects", response_model=SubjectOut, status_code=201)
def create_subject(
    payload: SubjectCreate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if (
        db.query(Subject)
        .filter(or_(Subject.code == payload.code, Subject.name == payload.name))
        .first()
    ):
        raise HTTPException(
            status_code=409, detail="Kode atau nama Mata Pelajaran sudah digunakan"
        )
    subject = Subject(**payload.model_dump())
    db.add(subject)
    db.commit()
    db.refresh(subject)
    return subject


@router.put("/subjects/{subject_id}", response_model=SubjectOut)
def update_subject(
    subject_id: UUID,
    payload: SubjectUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    subject = db.get(Subject, subject_id)
    if not subject:
        raise HTTPException(status_code=404, detail="Mata Pelajaran tidak ditemukan")
    values = payload.model_dump(exclude_unset=True)
    if (
        "code" in values
        and db.query(Subject)
        .filter(Subject.code == values["code"], Subject.id != subject_id)
        .first()
    ):
        raise HTTPException(
            status_code=409, detail="Kode Mata Pelajaran sudah digunakan"
        )
    if (
        "name" in values
        and db.query(Subject)
        .filter(Subject.name == values["name"], Subject.id != subject_id)
        .first()
    ):
        raise HTTPException(
            status_code=409, detail="Nama Mata Pelajaran sudah digunakan"
        )
    for key, value in values.items():
        setattr(subject, key, value)
    db.commit()
    db.refresh(subject)
    return subject


@router.delete("/subjects/{subject_id}", status_code=204)
def deactivate_subject(
    subject_id: UUID, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    subject = db.get(Subject, subject_id)
    if not subject:
        raise HTTPException(status_code=404, detail="Mata Pelajaran tidak ditemukan")
    subject.is_active = False
    db.commit()


@router.get(
    "/academic-years",
    response_model=list[AcademicYearOut] | PaginatedResponse[AcademicYearOut],
)
def list_academic_years(
    q: str | None = Query(None, min_length=1, max_length=100),
    is_active: bool | None = None,
    page: int | None = Query(None, ge=1),
    limit: int = Query(10, ge=1, le=100),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    query = db.query(AcademicYear)
    if q and (search := q.strip()):
        query = query.filter(AcademicYear.year_name.ilike(f"%{search}%"))
    if is_active is not None:
        query = query.filter(AcademicYear.is_active.is_(is_active))
    query = query.order_by(AcademicYear.year_name.desc(), AcademicYear.id)
    return paginate(query, page, limit) if page is not None else query.all()


@router.post("/academic-years", response_model=AcademicYearOut, status_code=201)
def create_academic_year(
    payload: AcademicYearCreate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if (
        db.query(AcademicYear)
        .filter(AcademicYear.year_name == payload.year_name)
        .first()
    ):
        raise HTTPException(status_code=409, detail="Tahun ajaran sudah terdaftar")
    if payload.is_active:
        db.query(AcademicYear).update(
            {AcademicYear.is_active: False}, synchronize_session=False
        )
    year = AcademicYear(**payload.model_dump())
    db.add(year)
    db.commit()
    db.refresh(year)
    return year


@router.put("/academic-years/{year_id}", response_model=AcademicYearOut)
def update_academic_year(
    year_id: UUID,
    payload: AcademicYearUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    year = db.get(AcademicYear, year_id)
    if not year:
        raise HTTPException(status_code=404, detail="Tahun ajaran tidak ditemukan")
    values = payload.model_dump(exclude_unset=True)
    if (
        "year_name" in values
        and db.query(AcademicYear)
        .filter(
            AcademicYear.year_name == values["year_name"], AcademicYear.id != year_id
        )
        .first()
    ):
        raise HTTPException(status_code=409, detail="Tahun ajaran sudah terdaftar")
    if values.get("is_active"):
        db.query(AcademicYear).filter(AcademicYear.id != year_id).update(
            {AcademicYear.is_active: False}, synchronize_session=False
        )
    for key, value in values.items():
        setattr(year, key, value)
    db.commit()
    db.refresh(year)
    return year


@router.delete("/academic-years/{year_id}", status_code=204)
def delete_academic_year(
    year_id: UUID, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    year = db.get(AcademicYear, year_id)
    if not year:
        raise HTTPException(status_code=404, detail="Tahun ajaran tidak ditemukan")
    if (
        db.query(Rombel).filter(Rombel.academic_year_id == year_id).first()
        or db.query(ExamPeriod).filter(ExamPeriod.academic_year_id == year_id).first()
    ):
        raise HTTPException(
            status_code=409,
            detail="Tahun ajaran masih digunakan oleh rombel atau periode ujian",
        )
    db.delete(year)
    db.commit()


@router.get("/rombels", response_model=list[RombelOut] | PaginatedResponse[RombelOut])
def list_rombels(
    q: str | None = Query(None, min_length=1, max_length=100),
    academic_year_id: UUID | None = None,
    without_academic_year: bool = False,
    homeroom_teacher_id: UUID | None = None,
    without_homeroom_teacher: bool = False,
    page: int | None = Query(None, ge=1),
    limit: int = Query(10, ge=1, le=100),
    _: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    query = (
        db.query(Rombel)
        .outerjoin(AcademicYear)
        .outerjoin(User, Rombel.homeroom_teacher_id == User.id)
    )
    if q and (search := q.strip()):
        query = query.filter(
            or_(
                Rombel.name.ilike(f"%{search}%"),
                AcademicYear.year_name.ilike(f"%{search}%"),
                User.full_name.ilike(f"%{search}%"),
            )
        )
    if academic_year_id:
        query = query.filter(Rombel.academic_year_id == academic_year_id)
    elif without_academic_year:
        query = query.filter(Rombel.academic_year_id.is_(None))
    if homeroom_teacher_id:
        query = query.filter(Rombel.homeroom_teacher_id == homeroom_teacher_id)
    elif without_homeroom_teacher:
        query = query.filter(Rombel.homeroom_teacher_id.is_(None))
    query = query.order_by(Rombel.name, Rombel.id)
    return paginate(query, page, limit) if page is not None else query.all()


@router.post("/rombels", response_model=RombelOut, status_code=201)
def create_rombel(
    payload: RombelCreate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if payload.academic_year_id and not db.get(AcademicYear, payload.academic_year_id):
        raise HTTPException(status_code=422, detail="Tahun ajaran tidak ditemukan")
    if payload.homeroom_teacher_id and not db.get(User, payload.homeroom_teacher_id):
        raise HTTPException(status_code=422, detail="Wali kelas tidak ditemukan")
    rombel = Rombel(**payload.model_dump())
    db.add(rombel)
    db.commit()
    db.refresh(rombel)
    return rombel


@router.put("/rombels/{rombel_id}", response_model=RombelOut)
def update_rombel(
    rombel_id: UUID,
    payload: RombelUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    rombel = db.get(Rombel, rombel_id)
    if not rombel:
        raise HTTPException(status_code=404, detail="Rombel tidak ditemukan")
    values = payload.model_dump(exclude_unset=True)
    if values.get("academic_year_id") and not db.get(
        AcademicYear, values["academic_year_id"]
    ):
        raise HTTPException(status_code=422, detail="Tahun ajaran tidak ditemukan")
    if values.get("homeroom_teacher_id") and not db.get(
        User, values["homeroom_teacher_id"]
    ):
        raise HTTPException(status_code=422, detail="Wali kelas tidak ditemukan")
    for key, value in values.items():
        setattr(rombel, key, value)
    db.commit()
    db.refresh(rombel)
    return rombel


@router.delete("/rombels/{rombel_id}", status_code=204)
def delete_rombel(
    rombel_id: UUID, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    rombel = db.get(Rombel, rombel_id)
    if not rombel:
        raise HTTPException(status_code=404, detail="Rombel tidak ditemukan")
    if db.query(Student).filter(Student.rombel_id == rombel_id).first():
        raise HTTPException(status_code=409, detail="Rombel masih memiliki siswa")
    for event in db.query(ScheduleEvent).filter(ScheduleEvent.rombel_id == rombel_id):
        if event.additional_rombels:
            replacement = event.additional_rombels[0]
            event.rombel_id = replacement.id
            event.additional_rombels = event.additional_rombels[1:]
    db.delete(rombel)
    db.commit()
