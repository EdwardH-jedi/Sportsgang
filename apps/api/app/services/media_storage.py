"""Local/dev media storage for profile photos.

Writes uploaded files to ``{media_root}/profile_photos/{user_id}/`` and
returns public URLs under ``{media_url_prefix}/profile_photos/{user_id}/``.
The ``main.py`` mounts ``media_url_prefix`` as a StaticFiles route.

This is a deliberately minimal slice. Cloud object storage (S3/GCS) and
content-type validation / image moderation are out of scope.
"""

from __future__ import annotations

import contextlib
import shutil
import uuid
from pathlib import Path
from typing import Iterable
from uuid import UUID

from fastapi import UploadFile

from app.core.config import get_settings

_ALLOWED_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".heic"}
_DEFAULT_SUFFIX = ".jpg"


def _profile_photos_root() -> Path:
    return Path(get_settings().media_root) / "profile_photos"


def _user_dir(user_id: UUID) -> Path:
    return _profile_photos_root() / str(user_id)


def _safe_suffix(filename: str | None) -> str:
    if not filename:
        return _DEFAULT_SUFFIX
    suffix = Path(filename).suffix.lower()
    return suffix if suffix in _ALLOWED_SUFFIXES else _DEFAULT_SUFFIX


def _url(user_id: UUID, name: str) -> str:
    return f"{get_settings().media_url_prefix.rstrip('/')}/profile_photos/{user_id}/{name}"


def is_empty(upload: UploadFile) -> bool:
    upload.file.seek(0, 2)
    size = upload.file.tell()
    upload.file.seek(0)
    return size == 0


def list_user_photos(user_id: UUID) -> list[str]:
    """Public URLs of the photo files currently stored for the user."""
    user_dir = _user_dir(user_id)
    if not user_dir.is_dir():
        return []
    return [_url(user_id, path.name) for path in sorted(user_dir.iterdir()) if path.is_file()]


def delete_user_photos(user_id: UUID, urls: Iterable[str]) -> None:
    """Best-effort removal of the user's photo files named by ``urls``."""
    user_dir = _user_dir(user_id)
    for url in urls:
        with contextlib.suppress(OSError):
            (user_dir / url.rsplit("/", 1)[-1]).unlink(missing_ok=True)


def save_user_photos(user_id: UUID, files: Iterable[UploadFile]) -> list[str]:
    """Persist uploads to local disk and return ordered public URLs.

    Each call writes uniquely named files next to any existing ones, so the
    previous photos stay on disk until the caller deletes them. If a write
    fails, the files this call already wrote are removed before re-raising.
    """
    user_dir = _user_dir(user_id)
    user_dir.mkdir(parents=True, exist_ok=True)

    urls: list[str] = []
    try:
        for index, upload in enumerate(files):
            suffix = _safe_suffix(upload.filename)
            name = f"{index:02d}_{uuid.uuid4().hex}{suffix}"
            dest = user_dir / name

            upload.file.seek(0)
            urls.append(_url(user_id, name))
            with dest.open("wb") as fh:
                shutil.copyfileobj(upload.file, fh)
    except Exception:
        delete_user_photos(user_id, urls)
        raise

    return urls
