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
    # When False (deployed/cloud mode): library scan is disabled; playback uses Spotify only where available
    enable_local_library: bool = True

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
    
    # API Configuration (include 127.0.0.1 so CORS works when using 127.0.0.1 for Spotify redirect)
    cors_origins: str = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:3000"
    
    # Server Configuration
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    # Public base URL of this API (for OAuth redirect_uri). Use 127.0.0.1 so Spotify accepts the redirect URI.
    api_base_url: str | None = None

    # Auth (JWT and optional seed admin)
    secret_key: str = "change-me-in-production"
    admin_seed_email: str | None = None
    admin_seed_password: str | None = None
    admin_seed_slug: str | None = None  # Optional: URL slug for seed user (e.g. dfranklin). If unset, derived from email.
    # Optional Google OAuth (for "Sign in with Google")
    google_client_id: str | None = None
    google_client_secret: str | None = None

    # Spotify (listener OAuth + optional admin sync later)
    spotify_client_id: str | None = None
    spotify_client_secret: str | None = None
    # Frontend URL for OAuth redirect (use 127.0.0.1 so Spotify accepts it; add same URI in Spotify Dashboard)
    frontend_url: str = "http://127.0.0.1:5173"
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS origins string into list"""
        return [origin.strip() for origin in self.cors_origins.split(",")]


# Global settings instance
settings = Settings()
