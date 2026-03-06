"""User model for admin users"""
from sqlalchemy import Column, String, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
import uuid

from app.database import Base


class User(Base):
    """Admin user who owns collections and can use the admin UI."""

    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    slug = Column(String, nullable=False, unique=True, index=True)  # For URLs, e.g. "drake"
    email = Column(String, nullable=False, unique=True, index=True)
    password_hash = Column(String, nullable=True)  # Nullable if only OAuth
    google_id = Column(String, nullable=True, unique=True, index=True)  # Optional Google OAuth
    created_at = Column(DateTime, default=datetime.utcnow, server_default=func.now())
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, server_default=func.now())

    # Relationships
    collections = relationship("Collection", back_populates="user", cascade="all, delete-orphan")
    albums = relationship("Album", back_populates="user", cascade="all, delete-orphan")
    spotify_connection = relationship(
        "UserSpotifyConnection",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return f"<User(id={self.id}, slug='{self.slug}', email='{self.email}')>"
