"""Main FastAPI application"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from app.config import settings
from app.database import init_db
from app.api import collections, albums, queue, playback, admin, media
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
    
    # Ensure the special "all" collection exists
    db = SessionLocal()
    try:
        from app.models.collection import Collection
        all_collection = db.query(Collection).filter(Collection.slug == 'all').first()
        if not all_collection:
            all_collection = Collection(
                id='00000000-0000-0000-0000-000000000000',  # Special UUID for "all"
                name='All Albums',
                slug='all',
                description='Virtual collection containing all albums',
                is_active=True
            )
            db.add(all_collection)
            db.commit()
            logger.info("Created special 'all' collection")
        else:
            logger.info("Special 'all' collection already exists")
    except Exception as e:
        logger.error(f"Failed to create 'all' collection: {e}")
        db.rollback()
    finally:
        db.close()
    
    logger.info("Collections ready (managed in database)")
    
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
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(collections.router)
app.include_router(albums.router)
app.include_router(queue.router)
app.include_router(playback.router)
app.include_router(admin.router)
app.include_router(media.router)


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
