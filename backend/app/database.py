"""Database configuration and session management"""
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from typing import Generator
import logging

from app.config import settings

logger = logging.getLogger(__name__)

# Create SQLAlchemy engine
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
    echo=False
)

# Create SessionLocal class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create Base class for models
Base = declarative_base()


def get_db() -> Generator:
    """
    Dependency function to get database session.
    
    Yields:
        Database session
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _migrate_collections_sections_sqlite():
    """Add sections_enabled and sections columns to collections if missing (SQLite)."""
    with engine.connect() as conn:
        r = conn.execute(text("PRAGMA table_info(collections)"))
        rows = r.fetchall()
    # SQLite returns (cid, name, type, notnull, dflt_value, pk)
    names = [row[1] for row in rows]
    with engine.connect() as conn:
        if "sections_enabled" not in names:
            conn.execute(text("ALTER TABLE collections ADD COLUMN sections_enabled BOOLEAN DEFAULT 0 NOT NULL"))
            conn.commit()
            logger.info("Added collections.sections_enabled column")
        if "sections" not in names:
            conn.execute(text("ALTER TABLE collections ADD COLUMN sections JSON"))
            conn.commit()
            logger.info("Added collections.sections column")


def init_db():
    """Initialize database tables and run migrations."""
    Base.metadata.create_all(bind=engine)
    if settings.database_url.startswith("sqlite"):
        _migrate_collections_sections_sqlite()
