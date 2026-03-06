"""Store Spotify OAuth tokens per admin user (for sync and Add by URL)."""
from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
import uuid

from app.database import Base


class UserSpotifyConnection(Base):
    """Spotify OAuth tokens for an admin user. Used for Sync from Spotify and Add by URL only."""

    __tablename__ = "user_spotify_connections"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    access_token = Column(String, nullable=False)
    refresh_token = Column(String, nullable=False)
    expires_at = Column(DateTime, nullable=True)  # When access_token expires (optional)
    created_at = Column(DateTime, default=datetime.utcnow, server_default=func.now())
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, server_default=func.now())

    user = relationship("User", back_populates="spotify_connection")


# Add to User model: spotify_connection = relationship("UserSpotifyConnection", back_populates="user", uselist=False)
