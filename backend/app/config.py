"""Application configuration"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )
    
    # Database
    database_url: str = "sqlite:///./jukebox.db"
    
    # Music Library
    music_library_path: str = "/Volumes/SamsungT7/MusicLibrary/Albums"
    # Playlists folder (sibling to Albums: same parent, e.g. MusicLibrary/Playlists)
    playlists_path: str | None = None

    @property
    def resolved_playlists_path(self) -> str:
        """Playlists directory: playlists_path if set, else parent of music_library_path + '/Playlists'."""
        if self.playlists_path:
            return self.playlists_path
        from pathlib import Path
        parent = Path(self.music_library_path).parent
        return str(parent / "Playlists")
    
    # Collections
    collections_config_dir: str = "./collections"
    
    # API Configuration
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    
    # Server Configuration
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS origins string into list"""
        return [origin.strip() for origin in self.cors_origins.split(",")]


# Global settings instance
settings = Settings()
