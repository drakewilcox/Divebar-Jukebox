"""Collection Album model (many-to-many relationship)"""
from sqlalchemy import Column, String, Integer, JSON, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
import uuid

from app.database import Base


class CollectionAlbum(Base):
    """CollectionAlbum model representing album membership in a collection"""
    
    __tablename__ = "collection_albums"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    collection_id = Column(String, ForeignKey("collections.id", ondelete="CASCADE"), nullable=False, index=True)
    album_id = Column(String, ForeignKey("albums.id", ondelete="CASCADE"), nullable=False, index=True)
    display_number = Column(Integer, nullable=False)  # 1-999, dynamically assigned based on sort_order
    sort_order = Column(Integer, nullable=False)  # Actual sort position, can be changed
    enabled_track_ids = Column(JSON, default=list)  # Array of track UUIDs enabled for this collection
    created_at = Column(DateTime, default=datetime.utcnow, server_default=func.now())
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, server_default=func.now())
    
    # Relationships
    collection = relationship("Collection", back_populates="collection_albums")
    album = relationship("Album", back_populates="collection_albums")
    
    # Ensure unique album per collection
    __table_args__ = (
        UniqueConstraint('collection_id', 'album_id', name='unique_collection_album'),
    )
    
    def __repr__(self):
        return f"<CollectionAlbum(id={self.id}, collection_id={self.collection_id}, album_id={self.album_id}, display_number={self.display_number})>"
