from pathlib import Path
from urllib.parse import urlsplit
from uuid import UUID

from app.core.config import get_settings

PHOTO_URL_PREFIX = "/management/students/photos/"
PHOTO_STORAGE_DIR = get_settings().media_dir.resolve() / "students"
MAX_PHOTO_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_PHOTO_PIXELS = 20_000_000


def photo_path_from_url(photo_url: str | None) -> Path | None:
    if not photo_url:
        return None
    path = urlsplit(photo_url).path
    if not path.startswith(PHOTO_URL_PREFIX):
        return None
    try:
        photo_id = UUID(path.removeprefix(PHOTO_URL_PREFIX))
    except ValueError:
        return None
    return PHOTO_STORAGE_DIR / f"{photo_id}.jpg"
