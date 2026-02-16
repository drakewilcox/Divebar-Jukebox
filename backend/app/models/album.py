"""Album model"""
from sqlalchemy import Column, String, Integer, Boolean, JSON, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
import uuid

from app.database import Base


class Album(Base):
    """Album model representing a music album"""
    
    __tablename__ = "albums"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    file_path = Column(String, nullable=False, unique=True, index=True)  # Relative path: Artist/Album
    title = Column(String, nullable=False)
    artist = Column(String, nullable=False)
    cover_art_path = Column(String, nullable=True)  # Path to cover art file (from metadata)
    custom_cover_art_path = Column(String, nullable=True)  # User-uploaded custom cover art
    total_tracks = Column(Integer, default=0)
    year = Column(Integer, nullable=True)
    has_multi_disc = Column(Boolean, default=False)
    archived = Column(Boolean, default=False)  # Hide from jukebox when archived
    extra_metadata = Column(JSON, default=dict)  # Additional metadata from FLAC tags
    created_at = Column(DateTime, default=datetime.utcnow, server_default=func.now())
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, server_default=func.now())
    
    # Relationships
    tracks = relationship("Track", back_populates="album", cascade="all, delete-orphan")
    collection_albums = relationship("CollectionAlbum", back_populates="album", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Album(id={self.id}, artist='{self.artist}', title='{self.title}')>"
