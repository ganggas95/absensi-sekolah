import logging
import warnings
from io import BytesIO
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, ImageOps
from sqlalchemy import or_
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.management_pagination import paginate
from app.db import get_db
from app.deps import current_user, require_admin
from app.models import Rombel, Student, User
from app.photo_storage import (
    MAX_PHOTO_PIXELS,
    MAX_PHOTO_UPLOAD_BYTES,
    PHOTO_STORAGE_DIR,
    PHOTO_URL_PREFIX,
    photo_path_from_url,
)
from app.schemas import PaginatedResponse, StudentCreate, StudentOut, StudentUpdate

router = APIRouter(prefix="/api/v1/management")
logger = logging.getLogger(__name__)


@router.get(
    "/students", response_model=list[StudentOut] | PaginatedResponse[StudentOut]
)
def list_students(
    rombel_id: UUID | None = None,
    without_rombel: bool = False,
    gender: str | None = Query(None, pattern="^[LP]$"),
    q: str | None = Query(None, min_length=1, max_length=100),
    page: int | None = Query(None, ge=1),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    _: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Student).outerjoin(Rombel).filter(Student.is_active.is_(True))
    if rombel_id:
        query = query.filter(Student.rombel_id == rombel_id)
    elif without_rombel:
        query = query.filter(Student.rombel_id.is_(None))
    if gender:
        query = query.filter(Student.gender == gender)
    if q and (search := q.strip()):
        query = query.filter(
            or_(
                Student.nisn.ilike(f"%{search}%"),
                Student.full_name.ilike(f"%{search}%"),
                Student.gender.ilike(f"%{search}%"),
                Rombel.name.ilike(f"%{search}%"),
            )
        )
    query = query.order_by(Student.full_name, Student.id)
    if page is not None:
        return paginate(query, page, limit)
    return query.offset(offset).limit(limit).all()


@router.post("/students", response_model=StudentOut, status_code=201)
def create_student(
    payload: StudentCreate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if (
        payload.nisn is not None
        and db.query(Student).filter(Student.nisn == payload.nisn).first()
    ):
        raise HTTPException(status_code=409, detail="NISN sudah terdaftar")
    if payload.rombel_id and not db.get(Rombel, payload.rombel_id):
        raise HTTPException(status_code=422, detail="Rombel tidak ditemukan")
    student = Student(**payload.model_dump())
    db.add(student)
    db.commit()
    db.refresh(student)
    return student


@router.put("/students/{student_id}", response_model=StudentOut)
def update_student(
    student_id: UUID,
    payload: StudentUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    student = db.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Siswa tidak ditemukan")
    values = payload.model_dump(exclude_unset=True)
    if (
        values.get("nisn") is not None
        and db.query(Student)
        .filter(Student.nisn == values["nisn"], Student.id != student_id)
        .first()
    ):
        raise HTTPException(status_code=409, detail="NISN sudah terdaftar")
    if values.get("rombel_id") and not db.get(Rombel, values["rombel_id"]):
        raise HTTPException(status_code=422, detail="Rombel tidak ditemukan")
    for key, value in values.items():
        setattr(student, key, value)
    db.commit()
    db.refresh(student)
    return student


@router.post("/students/{student_id}/photo")
def upload_student_photo(
    student_id: UUID,
    photo: UploadFile = File(...),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    student = db.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Siswa tidak ditemukan")

    content = photo.file.read(MAX_PHOTO_UPLOAD_BYTES + 1)
    if len(content) > MAX_PHOTO_UPLOAD_BYTES:
        photo.file.close()
        raise HTTPException(status_code=413, detail="Ukuran foto maksimal 5 MB")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            image = Image.open(BytesIO(content))
            if image.format not in {"JPEG", "PNG", "WEBP"}:
                raise HTTPException(
                    status_code=415, detail="Format foto harus JPEG, PNG, atau WebP"
                )
            if image.width * image.height > MAX_PHOTO_PIXELS:
                raise HTTPException(
                    status_code=413, detail="Resolusi foto terlalu besar"
                )
            image.verify()
            image = ImageOps.exif_transpose(Image.open(BytesIO(content)))
            image.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
            if "A" in image.getbands():
                background = Image.new("RGB", image.size, "white")
                background.paste(image, mask=image.getchannel("A"))
                image = background
            else:
                image = image.convert("RGB")
            output = BytesIO()
            image.save(output, format="JPEG", quality=88, optimize=True)
    except HTTPException:
        raise
    except (
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
        OSError,
        SyntaxError,
        ValueError,
    ):
        raise HTTPException(
            status_code=415,
            detail="File bukan gambar yang valid atau tidak dapat diproses",
        )
    finally:
        photo.file.close()

    photo_id = uuid4()
    photo_path = PHOTO_STORAGE_DIR / f"{photo_id}.jpg"
    PHOTO_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    temporary_path = PHOTO_STORAGE_DIR / f".{photo_id}.tmp"
    temporary_path.write_bytes(output.getvalue())
    temporary_path.replace(photo_path)

    old_photo_path = photo_path_from_url(student.photo_url)
    student.photo_url = f"{PHOTO_URL_PREFIX}{photo_id}"
    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        photo_path.unlink(missing_ok=True)
        raise
    if old_photo_path and old_photo_path != photo_path:
        try:
            old_photo_path.unlink(missing_ok=True)
        except OSError:
            logger.warning("Could not remove replaced student photo %s", old_photo_path)
    return {"photo_url": student.photo_url}


@router.get("/students/photos/{photo_id}")
def get_student_photo(photo_id: UUID, _: User = Depends(current_user)):
    photo_path = PHOTO_STORAGE_DIR / f"{photo_id}.jpg"
    if not photo_path.is_file():
        raise HTTPException(status_code=404, detail="Foto siswa tidak ditemukan")
    return FileResponse(
        photo_path,
        media_type="image/jpeg",
        headers={"Cache-Control": "private, no-store"},
    )


@router.delete("/students/{student_id}", status_code=204)
def deactivate_student(
    student_id: UUID, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    student = db.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Siswa tidak ditemukan")
    student.is_active = False
    db.commit()
