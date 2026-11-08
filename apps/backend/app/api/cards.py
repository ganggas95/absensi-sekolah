from io import BytesIO
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.deps import current_user
from app.models import AcademicYear, ExamPeriod, ExamPeriodType, Rombel, Student, User
from app.schemas import (
    ExamCardBatchRequest,
    ExamCardPreview,
    StudentCardBatchRequest,
    StudentCardPreview,
)
from app.services.student_cards import (
    ExamCardDetails,
    create_cards_pdf,
    create_qr_data_url,
)

router = APIRouter(prefix="/api/v1/cards")
MAX_CARDS_PER_EXPORT = 500


@router.get("/preview/{student_id}", response_model=StudentCardPreview)
def preview_student_card(
    student_id: UUID,
    _: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    student = (
        db.query(Student)
        .options(joinedload(Student.rombel))
        .filter(Student.id == student_id, Student.is_active.is_(True))
        .first()
    )
    if not student:
        raise HTTPException(
            status_code=404, detail="Siswa tidak ditemukan atau tidak aktif"
        )

    return StudentCardPreview.from_student(student, create_qr_data_url(str(student.id)))


@router.get("/export/{student_id}")
def export_student_card(
    student_id: UUID,
    _: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    student = (
        db.query(Student)
        .options(joinedload(Student.rombel))
        .filter(Student.id == student_id, Student.is_active.is_(True))
        .first()
    )
    if not student:
        raise HTTPException(
            status_code=404, detail="Siswa tidak ditemukan atau tidak aktif"
        )

    return _pdf_response([student], f"kartu-pelajar-{student.id}.pdf")


@router.post("/batch-print")
def export_student_cards(
    payload: StudentCardBatchRequest,
    _: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    query = (
        db.query(Student)
        .options(joinedload(Student.rombel))
        .filter(Student.is_active.is_(True))
    )
    if payload.student_ids:
        query = query.filter(Student.id.in_(payload.student_ids))
    else:
        if not db.get(Rombel, payload.rombel_id):
            raise HTTPException(status_code=404, detail="Rombel tidak ditemukan")
        query = query.filter(Student.rombel_id == payload.rombel_id)

    students = query.order_by(Student.full_name).limit(MAX_CARDS_PER_EXPORT + 1).all()
    if len(students) > MAX_CARDS_PER_EXPORT:
        raise HTTPException(
            status_code=413,
            detail=f"Ekspor dibatasi maksimal {MAX_CARDS_PER_EXPORT} kartu per file.",
        )
    if not students:
        raise HTTPException(
            status_code=404, detail="Tidak ada siswa aktif untuk dicetak"
        )
    if payload.student_ids and len(students) != len(payload.student_ids):
        raise HTTPException(
            status_code=404,
            detail="Satu atau lebih siswa tidak ditemukan atau tidak aktif",
        )

    return _pdf_response(students, "kartu-pelajar-bulk.pdf")


@router.get(
    "/exams/preview/{exam_period_id}/{rombel_id}/{student_id}",
    response_model=ExamCardPreview,
)
def preview_exam_card(
    exam_period_id: UUID,
    rombel_id: UUID,
    student_id: UUID,
    _: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    rombel, details = _get_exam_card_details(exam_period_id, rombel_id, db)
    student = (
        db.query(Student)
        .options(joinedload(Student.rombel))
        .filter(
            Student.id == student_id,
            Student.rombel_id == rombel.id,
            Student.is_active.is_(True),
        )
        .first()
    )
    if not student:
        raise HTTPException(
            status_code=404, detail="Siswa aktif tidak ditemukan pada rombel ini"
        )
    return ExamCardPreview(
        id=student.id,
        id_siswa=student.id_siswa,
        nisn=student.nisn,
        full_name=student.full_name,
        class_name=student.rombel.name if student.rombel else None,
        photo_url=student.photo_url,
        qr_data_url=create_qr_data_url(str(student.id)),
        exam_name=details.exam_name,
        academic_year_name=details.academic_year_name,
    )


@router.get("/exams/export/{exam_period_id}/{rombel_id}/{student_id}")
def export_exam_card(
    exam_period_id: UUID,
    rombel_id: UUID,
    student_id: UUID,
    _: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    rombel, details = _get_exam_card_details(exam_period_id, rombel_id, db)
    student = (
        db.query(Student)
        .options(joinedload(Student.rombel))
        .filter(
            Student.id == student_id,
            Student.rombel_id == rombel.id,
            Student.is_active.is_(True),
        )
        .first()
    )
    if not student:
        raise HTTPException(
            status_code=404, detail="Siswa aktif tidak ditemukan pada rombel ini"
        )
    return _pdf_response([student], f"kartu-ujian-{student.id}.pdf", details)


@router.post("/exams/batch-print")
def export_exam_cards(
    payload: ExamCardBatchRequest,
    _: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    rombel, details = _get_exam_card_details(
        payload.exam_period_id, payload.rombel_id, db
    )
    query = (
        db.query(Student)
        .options(joinedload(Student.rombel))
        .filter(Student.rombel_id == rombel.id, Student.is_active.is_(True))
    )
    if payload.student_ids:
        query = query.filter(Student.id.in_(payload.student_ids))
    students = query.order_by(Student.full_name).limit(MAX_CARDS_PER_EXPORT + 1).all()
    if len(students) > MAX_CARDS_PER_EXPORT:
        raise HTTPException(
            status_code=413,
            detail=f"Ekspor dibatasi maksimal {MAX_CARDS_PER_EXPORT} kartu per file.",
        )
    if not students:
        raise HTTPException(
            status_code=404, detail="Tidak ada siswa aktif untuk dicetak"
        )
    if payload.student_ids and len(students) != len(payload.student_ids):
        raise HTTPException(
            status_code=404,
            detail="Satu atau lebih siswa tidak aktif atau bukan anggota rombel",
        )
    return _pdf_response(students, "kartu-peserta-ujian.pdf", details)


def _get_exam_card_details(
    exam_period_id: UUID,
    rombel_id: UUID,
    db: Session,
) -> tuple[Rombel, ExamCardDetails]:
    period = db.get(ExamPeriod, exam_period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Periode ujian tidak ditemukan")
    rombel = db.get(Rombel, rombel_id)
    if not rombel:
        raise HTTPException(status_code=404, detail="Rombel tidak ditemukan")
    if rombel.academic_year_id != period.academic_year_id:
        raise HTTPException(
            status_code=422,
            detail="Rombel tidak sesuai dengan tahun ajaran periode ujian",
        )
    academic_year = db.get(AcademicYear, period.academic_year_id)
    if not academic_year:
        raise HTTPException(
            status_code=422, detail="Tahun ajaran periode ujian tidak tersedia"
        )
    exam_names = {
        ExamPeriodType.GANJIL: "Semester Ganjil",
        ExamPeriodType.GENAP: "Semester Genap",
        ExamPeriodType.MID_SEMESTER: "Mid Semester",
    }
    return rombel, ExamCardDetails(
        exam_name=exam_names[period.period_type],
        academic_year_name=academic_year.year_name,
    )


def _pdf_response(
    students: list[Student],
    filename: str,
    exam: ExamCardDetails | None = None,
) -> StreamingResponse:
    pdf = create_cards_pdf(students, exam)
    return StreamingResponse(
        BytesIO(pdf),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
