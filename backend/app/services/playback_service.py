"""Playback service for managing playback state"""
from sqlalchemy.orm import Session
from typing import Optional
import logging

from app.models.playback_state import PlaybackState
from app.models.queue import Queue, QueueStatus
from app.services.queue_service import QueueService

logger = logging.getLogger(__name__)


class PlaybackService:
    """Service for playback state operations"""
    
    def __init__(self, db: Session):
        """
        Initialize playback service
        
        Args:
            db: Database session
        """
        self.db = db
        self.queue_service = QueueService(db)
    
    def get_playback_state(self, collection_id: str) -> Optional[PlaybackState]:
        """
        Get playback state for a collection
        
        Args:
            collection_id: Collection UUID
            
        Returns:
            PlaybackState instance or None
        """
        return self.db.query(PlaybackState).filter(
            PlaybackState.collection_id == collection_id
        ).first()
    
    def get_or_create_playback_state(self, collection_id: str) -> PlaybackState:
        """
        Get or create playback state for a collection
        
        Args:
            collection_id: Collection UUID
            
        Returns:
            PlaybackState instance
        """
        state = self.get_playback_state(collection_id)
        if not state:
            state = PlaybackState(
                collection_id=collection_id,
                is_playing=False,
                current_position_ms=0,
                volume=70
            )
            self.db.add(state)
            self.db.commit()
        return state
    
    def play(self, collection_id: str) -> Optional[PlaybackState]:
        """
        Start or resume playback
        
        Args:
            collection_id: Collection UUID
            
        Returns:
            Updated PlaybackState or None
        """
        state = self.get_or_create_playback_state(collection_id)
        
        # If no current track, try to get next from queue
        if not state.current_track_id:
            next_queue = self.queue_service.get_next_track(collection_id)
            if next_queue:
                state.current_track_id = next_queue.track_id
                state.current_position_ms = 0
                self.queue_service.mark_playing(next_queue.id)
            else:
                logger.warning(f"No tracks in queue for collection {collection_id}")
                return state
        
        state.is_playing = True
        self.db.commit()
        
        logger.info(f"Started playback for collection {collection_id}")
        return state
    
    def pause(self, collection_id: str) -> Optional[PlaybackState]:
        """
        Pause playback
        
        Args:
            collection_id: Collection UUID
            
        Returns:
            Updated PlaybackState or None
        """
        state = self.get_playback_state(collection_id)
        if state:
            state.is_playing = False
            self.db.commit()
            logger.info(f"Paused playback for collection {collection_id}")
        return state
    
    def stop(self, collection_id: str) -> Optional[PlaybackState]:
        """
        Stop playback and reset position
        
        Args:
            collection_id: Collection UUID
            
        Returns:
            Updated PlaybackState or None
        """
        state = self.get_playback_state(collection_id)
        if state:
            state.is_playing = False
            state.current_position_ms = 0
            state.current_track_id = None
            self.db.commit()
            logger.info(f"Stopped playback for collection {collection_id}")
        return state
    
    def skip(self, collection_id: str) -> Optional[PlaybackState]:
        """
        Skip to next track in queue
        
        Args:
            collection_id: Collection UUID
            
        Returns:
            Updated PlaybackState or None
        """
        state = self.get_or_create_playback_state(collection_id)
        
        # Mark current track as played if exists
        if state.current_track_id:
            current_queue = self.db.query(Queue).filter(
                Queue.collection_id == collection_id,
                Queue.track_id == state.current_track_id,
                Queue.status == QueueStatus.PLAYING
            ).first()
            if current_queue:
                self.queue_service.mark_played(current_queue.id)
        
        # Get next track
        next_queue = self.queue_service.get_next_track(collection_id)
        if next_queue:
            state.current_track_id = next_queue.track_id
            state.current_position_ms = 0
            self.queue_service.mark_playing(next_queue.id)
            logger.info(f"Skipped to next track for collection {collection_id}")
        else:
            # No more tracks in queue
            state.current_track_id = None
            state.current_position_ms = 0
            state.is_playing = False
            logger.info(f"No more tracks in queue for collection {collection_id}")
        
        self.db.commit()
        return state
    
    def update_position(self, collection_id: str, position_ms: int) -> Optional[PlaybackState]:
        """
        Update current playback position
        
        Args:
            collection_id: Collection UUID
            position_ms: Position in milliseconds
            
        Returns:
            Updated PlaybackState or None
        """
        state = self.get_playback_state(collection_id)
        if state:
            state.current_position_ms = position_ms
            self.db.commit()
        return state
    
    def set_volume(self, collection_id: str, volume: int) -> Optional[PlaybackState]:
        """
        Set playback volume
        
        Args:
            collection_id: Collection UUID
            volume: Volume level (0-100)
            
        Returns:
            Updated PlaybackState or None
        """
        state = self.get_or_create_playback_state(collection_id)
        state.volume = max(0, min(100, volume))  # Clamp to 0-100
        self.db.commit()
        return state
