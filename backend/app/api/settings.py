"""Settings API endpoints (e.g. default collection)"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.setting import Setting

router = APIRouter(prefix="/api/settings", tags=["settings"])

DEFAULT_COLLECTION_KEY = "default_collection_slug"


class SettingsResponse(BaseModel):
    default_collection_slug: str


class SettingsUpdate(BaseModel):
    default_collection_slug: str


def _get_setting(db: Session, key: str) -> str | None:
    row = db.query(Setting).filter(Setting.key == key).first()
    return row.value if row else None


def _set_setting(db: Session, key: str, value: str) -> None:
    row = db.query(Setting).filter(Setting.key == key).first()
    if row:
        row.value = value
    else:
        db.add(Setting(key=key, value=value))
    db.commit()


@router.get("", response_model=SettingsResponse)
def get_settings(db: Session = Depends(get_db)):
    """Get jukebox settings (e.g. default collection)."""
    slug = _get_setting(db, DEFAULT_COLLECTION_KEY)
    return SettingsResponse(default_collection_slug=slug or "all")


@router.patch("", response_model=SettingsResponse)
def update_settings(body: SettingsUpdate, db: Session = Depends(get_db)):
    """Update settings (e.g. set default collection)."""
    if not body.default_collection_slug or not body.default_collection_slug.strip():
        raise HTTPException(status_code=400, detail="default_collection_slug is required")
    _set_setting(db, DEFAULT_COLLECTION_KEY, body.default_collection_slug.strip())
    return SettingsResponse(default_collection_slug=body.default_collection_slug.strip())
