"""Track model"""
from sqlalchemy import Column, String, Integer, Boolean, JSON, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
import uuid

from app.database import Base


class Track(Base):
    """Track model representing a music track/song"""
    
    __tablename__ = "tracks"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    album_id = Column(String, ForeignKey("albums.id", ondelete="CASCADE"), nullable=False, index=True)
    file_path = Column(String, nullable=False, unique=True)  # Full relative path to FLAC file
    disc_number = Column(Integer, default=1)
    track_number = Column(Integer, nullable=False)
    title = Column(String, nullable=False)
    artist = Column(String, nullable=False)
    duration_ms = Column(Integer, default=0)  # Duration in milliseconds
    enabled = Column(Boolean, default=True)  # User can disable tracks
    extra_metadata = Column(JSON, default=dict)  # Additional metadata
    created_at = Column(DateTime, default=datetime.utcnow, server_default=func.now())
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, server_default=func.now())
    
    # Relationships
    album = relationship("Album", back_populates="tracks")
    queue_items = relationship("Queue", back_populates="track", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Track(id={self.id}, artist='{self.artist}', title='{self.title}', track_number={self.track_number})>"
