"""Collection model"""
from sqlalchemy import Column, String, Boolean, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.types import JSON
from datetime import datetime
import uuid

from app.database import Base


class Collection(Base):
    """Collection model representing a jukebox collection/version"""
    
    __tablename__ = "collections"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False, unique=True, index=True)  # e.g., "Dive Bar Jukebox"
    slug = Column(String, nullable=False, unique=True, index=True)  # e.g., "dive-bar"
    description = Column(String, nullable=True)
    config_file = Column(String, nullable=True)  # Path to JSON config file
    is_active = Column(Boolean, default=True)
    sections_enabled = Column(Boolean, default=False, nullable=False, server_default="0")
    sections = Column(JSON, nullable=True)  # List of {"order": int, "name": str, "color": str}, 3-10 when enabled
    created_at = Column(DateTime, default=datetime.utcnow, server_default=func.now())
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, server_default=func.now())
    
    # Relationships
    collection_albums = relationship("CollectionAlbum", back_populates="collection", cascade="all, delete-orphan")
    queue_items = relationship("Queue", back_populates="collection", cascade="all, delete-orphan")
    playback_states = relationship("PlaybackState", back_populates="collection", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Collection(id={self.id}, name='{self.name}', slug='{self.slug}')>"
