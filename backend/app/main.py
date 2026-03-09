"""Main FastAPI application"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from app.config import settings
from app.database import init_db
from app.api import collections, albums, queue, playback, admin, media, settings as settings_api, auth as auth_api, users as users_api, spotify_listener as spotify_listener_api, config as config_api
from app.services.collection_service import CollectionService
from app.database import SessionLocal

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan events for startup and shutdown"""
    # Startup
    logger.info("Starting Dive Bar Jukebox API...")
    
    # Initialize database
    init_db()
    logger.info("Database initialized")
    
    logger.info("Collections ready (managed in database)")

    # Seed initial admin user if configured (creates new or upgrades migration placeholder)
    SEED_USER_ID = "00000000-0000-0000-0000-000000000001"
    if settings.admin_seed_email and settings.admin_seed_password:
        from app.models.user import User
        from app.auth import hash_password, slug_from_email
        db = SessionLocal()
        try:
            existing_by_email = db.query(User).filter(User.email == settings.admin_seed_email).first()
            slug = (settings.admin_seed_slug or slug_from_email(settings.admin_seed_email)).strip().lower()
            slug = "".join(c for c in slug if c.isalnum() or c in "_-") or "user"
            slug = slug[:64]
            if existing_by_email:
                # Do not overwrite slug for existing users — they may have changed it in the UI.
                logger.info("Seed admin user already exists: %s (slug=%s)", settings.admin_seed_email, existing_by_email.slug)
            else:
                placeholder = db.query(User).filter(User.id == SEED_USER_ID).first()
                if db.query(User).filter(User.slug == slug).first():
                    slug = slug + "-1"
                if placeholder:
                    placeholder.email = settings.admin_seed_email
                    placeholder.slug = slug
                    placeholder.password_hash = hash_password(settings.admin_seed_password)
                    db.commit()
                    logger.info("Updated placeholder seed user to: %s (slug=%s)", settings.admin_seed_email, slug)
                else:
                    seed_user = User(
                        email=settings.admin_seed_email,
                        slug=slug,
                        password_hash=hash_password(settings.admin_seed_password),
                    )
                    db.add(seed_user)
                    db.commit()
                    logger.info("Created seed admin user: %s (slug=%s)", settings.admin_seed_email, slug)
        except Exception as e:
            logger.error("Failed to create seed admin user: %s", e)
            db.rollback()
        finally:
            db.close()
    
    logger.info("Application startup complete")
    
    yield
    
    # Shutdown
    logger.info("Shutting down...")


# Create FastAPI app
app = FastAPI(
    title="Dive Bar Jukebox API",
    description="API for retro-style digital jukebox",
    version="0.1.0",
    lifespan=lifespan
)

# Configure CORS
_origins = [o.rstrip("/") for o in settings.cors_origins_list if o.strip()]
logger.info("CORS allowed origins: %s", _origins)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth_api.router)
app.include_router(collections.router)
app.include_router(albums.router)
app.include_router(queue.router)
app.include_router(playback.router)
app.include_router(admin.router)
app.include_router(media.router)
app.include_router(settings_api.router)
app.include_router(users_api.router)
app.include_router(spotify_listener_api.router)
app.include_router(config_api.router)


@app.get("/")
def root():
    """Root endpoint"""
    return {
        "message": "Dive Bar Jukebox API",
        "version": "0.1.0",
        "docs": "/docs"
    }


@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=True
    )
