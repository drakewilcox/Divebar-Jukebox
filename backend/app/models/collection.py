"""Collection model"""
from sqlalchemy import Column, String, Boolean, Integer, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.types import JSON
from datetime import datetime
import uuid

from app.database import Base


class Collection(Base):
    """Collection model representing a jukebox collection/version"""
    
    __tablename__ = "collections"
    __table_args__ = (UniqueConstraint("user_id", "slug", "source", name="uq_collection_user_slug_source"),)
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False, index=True)  # Not globally unique; per-user
    slug = Column(String, nullable=False, index=True)  # Unique per user (uq_collection_user_slug)
    description = Column(String, nullable=True)
    published = Column(Boolean, default=False, nullable=False, server_default="0")
    source = Column(String, nullable=False, default='local', server_default='local')  # 'local' | 'spotify'
    config_file = Column(String, nullable=True)  # Path to JSON config file
    is_active = Column(Boolean, default=True)
    sections_enabled = Column(Boolean, default=False, nullable=False, server_default="0")
    sections = Column(JSON, nullable=True)  # List of {"order": int, "name": str, "color": str}, 3-10 when enabled
    # Collection default settings (used when viewing this collection in jukebox)
    default_sort_order = Column(String, nullable=True)  # 'alphabetical' | 'curated'
    default_show_jump_to_bar = Column(Boolean, nullable=True)
    default_jump_button_type = Column(String, nullable=True)  # 'letter-ranges' | 'number-ranges' | 'sections'
    default_show_color_coding = Column(Boolean, nullable=True)
    default_show_card_background = Column(Boolean, nullable=True)  # True = overlay, False = 5px top line
    default_edit_mode = Column(Boolean, nullable=True)
    default_crossfade_seconds = Column(Integer, nullable=True)  # 0-12, null = use 0
    default_hit_button_mode = Column(String, nullable=True)  # 'favorites' | 'favorites-and-recommended' | 'any' | 'prioritize-section'
    created_at = Column(DateTime, default=datetime.utcnow, server_default=func.now())
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, server_default=func.now())
    
    # Relationships
    user = relationship("User", back_populates="collections")
    collection_albums = relationship("CollectionAlbum", back_populates="collection", cascade="all, delete-orphan")
    queue_items = relationship("Queue", back_populates="collection", cascade="all, delete-orphan")
    playback_states = relationship("PlaybackState", back_populates="collection", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Collection(id={self.id}, name='{self.name}', slug='{self.slug}')>"
