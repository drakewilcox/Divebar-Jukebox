"""User-scoped API: collections by user_slug (for routing /:user_slug/:collection_slug)."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Any
from pydantic import BaseModel

from app.auth import get_current_user_optional
from app.database import get_db
from app.models.user import User
from app.services.collection_service import CollectionService

router = APIRouter(prefix="/api/users", tags=["users"])


class CollectionResponse(BaseModel):
    id: str
    name: str
    slug: str
    description: str | None
    is_active: bool
    published: bool = False
    source: str = 'local'
    sections_enabled: bool = False
    sections: List[Any] | None = None
    default_sort_order: str | None = None
    default_show_jump_to_bar: bool | None = None
    default_jump_button_type: str | None = None
    default_show_color_coding: bool | None = None
    default_show_card_background: bool | None = None
    default_edit_mode: bool | None = None
    default_crossfade_seconds: int | None = None
    default_hit_button_mode: str | None = None

    class Config:
        from_attributes = True


def _virtual_all_collection(user_slug: str) -> dict:
    """Return a synthesized 'all' collection dict — not stored as a regular collection."""
    return {
        "id": "00000000-0000-0000-0000-000000000000",
        "name": "All Albums",
        "slug": "all",
        "description": None,
        "is_active": True,
        "published": False,
        "source": "local",
        "sections_enabled": False,
        "sections": None,
        "default_sort_order": None,
        "default_show_jump_to_bar": None,
        "default_jump_button_type": None,
        "default_show_color_coding": None,
        "default_show_card_background": None,
        "default_edit_mode": None,
        "default_crossfade_seconds": None,
        "default_hit_button_mode": None,
    }


@router.get("/{user_slug}/collections", response_model=List[CollectionResponse])
def list_user_collections(user_slug: str, db: Session = Depends(get_db)):
    """List published collections for this user, plus the virtual 'all' collection."""
    service = CollectionService(db)
    user = db.query(User).filter(User.slug == user_slug).first()
    if not user:
        return []
    collections = service.get_collections_for_user_slug(user_slug, include_private=False)
    return [_virtual_all_collection(user_slug)] + list(collections)


@router.get("/{user_slug}/collections/{collection_slug}", response_model=CollectionResponse)
def get_user_collection(
    user_slug: str,
    collection_slug: str,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """Get one collection by user slug and collection slug. Returns 404 if not found. Unpublished collections are only visible to the owner (when logged in)."""
    if collection_slug == "all":
        user = db.query(User).filter(User.slug == user_slug).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return _virtual_all_collection(user_slug)
    service = CollectionService(db)
    collection = service.get_collection_by_user_slug_and_collection_slug(user_slug, collection_slug)
    if not collection:
        raise HTTPException(
            status_code=404,
            detail="Collection not found. Check that the URL uses your profile slug (e.g. from your account) and the collection slug.",
        )
    published = getattr(collection, "published", True)
    is_owner = current_user and str(collection.user_id) == str(current_user.id)
    if not published and not is_owner:
        raise HTTPException(status_code=404, detail="Collection not found")
    return collection
