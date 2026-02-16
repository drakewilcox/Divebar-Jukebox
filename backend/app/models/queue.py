"""Queue model"""
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
import uuid
import enum

from app.database import Base


class QueueStatus(str, enum.Enum):
    """Queue item status"""
    PENDING = "pending"
    PLAYING = "playing"
    PLAYED = "played"


class Queue(Base):
    """Queue model representing tracks in the playback queue"""
    
    __tablename__ = "queue"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    collection_id = Column(String, ForeignKey("collections.id", ondelete="CASCADE"), nullable=False, index=True)
    track_id = Column(String, ForeignKey("tracks.id", ondelete="CASCADE"), nullable=False, index=True)
    position = Column(Integer, nullable=False)  # Queue order
    status = Column(SQLEnum(QueueStatus), default=QueueStatus.PENDING, nullable=False)
    queued_at = Column(DateTime, default=datetime.utcnow, server_default=func.now())
    played_at = Column(DateTime, nullable=True)
    
    # Relationships
    collection = relationship("Collection", back_populates="queue_items")
    track = relationship("Track", back_populates="queue_items")
    
    def __repr__(self):
        return f"<Queue(id={self.id}, track_id={self.track_id}, position={self.position}, status={self.status})>"
