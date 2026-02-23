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
        # Add default_settings columns if missing
        for col, sql in [
            ("default_sort_order", "ALTER TABLE collections ADD COLUMN default_sort_order VARCHAR"),
            ("default_show_jump_to_bar", "ALTER TABLE collections ADD COLUMN default_show_jump_to_bar BOOLEAN"),
            ("default_jump_button_type", "ALTER TABLE collections ADD COLUMN default_jump_button_type VARCHAR"),
            ("default_show_color_coding", "ALTER TABLE collections ADD COLUMN default_show_color_coding BOOLEAN"),
            ("default_edit_mode", "ALTER TABLE collections ADD COLUMN default_edit_mode BOOLEAN"),
            ("default_crossfade_seconds", "ALTER TABLE collections ADD COLUMN default_crossfade_seconds INTEGER"),
            ("default_hit_button_mode", "ALTER TABLE collections ADD COLUMN default_hit_button_mode VARCHAR"),
        ]:
            if col not in names:
                conn.execute(text(sql))
                conn.commit()
                logger.info(f"Added collections.{col} column")


def init_db():
    """Initialize database tables and run migrations."""
    Base.metadata.create_all(bind=engine)
    if settings.database_url.startswith("sqlite"):
        _migrate_collections_sections_sqlite()
