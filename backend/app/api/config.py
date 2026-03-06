"""Public config/capabilities for frontend (no auth)."""
from fastapi import APIRouter

from app.config import settings

router = APIRouter(prefix="/api/config", tags=["config"])


@router.get("")
def get_config():
    """Return deployment capabilities so frontend can hide local-only UI and choose playback source."""
    return {"enable_local_library": settings.enable_local_library}
