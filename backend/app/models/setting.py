"""Setting model for key-value jukebox settings (e.g. default collection)"""
from sqlalchemy import Column, String

from app.database import Base


class Setting(Base):
    """Key-value store for jukebox settings (no auth; single instance)"""

    __tablename__ = "settings"

    key = Column(String, primary_key=True)
    value = Column(String, nullable=False, default="")

    def __repr__(self):
        return f"<Setting(key='{self.key}', value='{self.value}')>"
