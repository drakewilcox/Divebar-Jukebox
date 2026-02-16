"""Playback State model"""
from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
import uuid

from app.database import Base


class PlaybackState(Base):
    """PlaybackState model representing current playback state for a collection"""
    
    __tablename__ = "playback_state"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    collection_id = Column(String, ForeignKey("collections.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    current_track_id = Column(String, ForeignKey("tracks.id", ondelete="SET NULL"), nullable=True)
    is_playing = Column(Boolean, default=False)
    current_position_ms = Column(Integer, default=0)  # Current position in milliseconds
    volume = Column(Integer, default=70)  # Volume 0-100
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, server_default=func.now())
    
    # Relationships
    collection = relationship("Collection", back_populates="playback_states")
    current_track = relationship("Track", foreign_keys=[current_track_id])
    
    def __repr__(self):
        return f"<PlaybackState(id={self.id}, collection_id={self.collection_id}, is_playing={self.is_playing})>"
