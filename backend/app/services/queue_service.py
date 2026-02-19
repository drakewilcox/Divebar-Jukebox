"""Queue service for managing playback queue"""
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import logging

from app.models.queue import Queue, QueueStatus
from app.models.track import Track

logger = logging.getLogger(__name__)


class QueueService:
    """Service for queue-related operations"""
    
    def __init__(self, db: Session):
        """
        Initialize queue service
        
        Args:
            db: Database session
        """
        self.db = db
    
    def add_to_queue(self, collection_id: str, track_id: str) -> Optional[Queue]:
        """
        Add a track to the queue. Does not add if the track is already in the queue (pending or playing).

        Args:
            collection_id: Collection UUID
            track_id: Track UUID

        Returns:
            Queue instance, or None if track already in queue or on error
        """
        existing = self.db.query(Queue).filter(
            Queue.collection_id == collection_id,
            Queue.track_id == track_id,
            Queue.status.in_([QueueStatus.PENDING, QueueStatus.PLAYING])
        ).first()
        if existing:
            logger.debug(f"Track {track_id} already in queue for collection {collection_id}, skipping duplicate")
            return None

        # Get the maximum position value from pending/playing tracks
        from sqlalchemy import func
        max_position_result = self.db.query(func.max(Queue.position)).filter(
            Queue.collection_id == collection_id,
            Queue.status.in_([QueueStatus.PENDING, QueueStatus.PLAYING])
        ).scalar()

        # If queue is empty, start at position 1, otherwise increment max position
        max_position = max_position_result if max_position_result is not None else 0

        queue_item = Queue(
            collection_id=collection_id,
            track_id=track_id,
            position=max_position + 1,
            status=QueueStatus.PENDING
        )

        self.db.add(queue_item)
        self.db.commit()

        logger.info(f"Added track {track_id} to queue at position {queue_item.position}")
        return queue_item
    
    def add_album_to_queue(self, collection_id: str, track_ids: List[str]) -> int:
        """
        Add multiple tracks (album) to queue
        
        Args:
            collection_id: Collection UUID
            track_ids: List of track UUIDs
            
        Returns:
            Number of tracks added
        """
        count = 0
        for track_id in track_ids:
            if self.add_to_queue(collection_id, track_id):
                count += 1
        return count
    
    def get_queue(self, collection_id: str, include_played: bool = False) -> List[Queue]:
        """
        Get queue for a collection
        
        Args:
            collection_id: Collection UUID
            include_played: Whether to include played items
            
        Returns:
            List of Queue instances ordered by position
        """
        query = self.db.query(Queue).filter(Queue.collection_id == collection_id)
        
        if not include_played:
            query = query.filter(Queue.status.in_([QueueStatus.PENDING, QueueStatus.PLAYING]))
        
        return query.order_by(Queue.position).all()
    
    def get_next_track(self, collection_id: str) -> Optional[Queue]:
        """
        Get next pending track in queue
        
        Args:
            collection_id: Collection UUID
            
        Returns:
            Next Queue item or None if queue is empty
        """
        return self.db.query(Queue).filter(
            Queue.collection_id == collection_id,
            Queue.status == QueueStatus.PENDING
        ).order_by(Queue.position).first()
    
    def mark_playing(self, queue_id: str) -> Optional[Queue]:
        """
        Mark a queue item as playing
        
        Args:
            queue_id: Queue UUID
            
        Returns:
            Updated Queue instance or None
        """
        queue_item = self.db.query(Queue).filter(Queue.id == queue_id).first()
        if queue_item:
            queue_item.status = QueueStatus.PLAYING
            self.db.commit()
            return queue_item
        return None
    
    def mark_played(self, queue_id: str) -> Optional[Queue]:
        """
        Mark a queue item as played
        
        Args:
            queue_id: Queue UUID
            
        Returns:
            Updated Queue instance or None
        """
        queue_item = self.db.query(Queue).filter(Queue.id == queue_id).first()
        if queue_item:
            queue_item.status = QueueStatus.PLAYED
            queue_item.played_at = datetime.utcnow()
            self.db.commit()
            return queue_item
        return None
    
    def remove_from_queue(self, queue_id: str) -> bool:
        """
        Remove a track from queue
        
        Args:
            queue_id: Queue UUID
            
        Returns:
            True if removed, False if not found
        """
        queue_item = self.db.query(Queue).filter(Queue.id == queue_id).first()
        if queue_item:
            collection_id = queue_item.collection_id
            self.db.delete(queue_item)
            
            # Reorder remaining items
            self._reorder_queue(collection_id)
            self.db.commit()
            return True
        return False
    
    def clear_queue(self, collection_id: str, clear_played: bool = True) -> int:
        """
        Clear queue for a collection
        
        Args:
            collection_id: Collection UUID
            clear_played: Whether to also clear played items
            
        Returns:
            Number of items removed
        """
        query = self.db.query(Queue).filter(Queue.collection_id == collection_id)
        
        if not clear_played:
            query = query.filter(Queue.status.in_([QueueStatus.PENDING, QueueStatus.PLAYING]))
        
        count = query.count()
        query.delete()
        self.db.commit()
        
        logger.info(f"Cleared {count} items from queue for collection {collection_id}")
        return count
    
    def _reorder_queue(self, collection_id: str):
        """
        Reorder queue positions after removal

        Args:
            collection_id: Collection UUID
        """
        queue_items = self.db.query(Queue).filter(
            Queue.collection_id == collection_id,
            Queue.status.in_([QueueStatus.PENDING, QueueStatus.PLAYING])
        ).order_by(Queue.position).all()

        for index, item in enumerate(queue_items, start=1):
            item.position = index

    def reorder_queue(self, collection_id: str, ordered_queue_ids: List[str]) -> bool:
        """
        Set queue order from a list of queue item IDs (playing + pending only).
        Each ID must belong to this collection. Positions are assigned 1-based by list index.

        Args:
            collection_id: Collection UUID
            ordered_queue_ids: Queue item IDs in desired order (including currently playing)

        Returns:
            True if reorder succeeded, False if any ID not found or wrong collection
        """
        if not ordered_queue_ids:
            return True
        items = (
            self.db.query(Queue)
            .filter(
                Queue.collection_id == collection_id,
                Queue.id.in_(ordered_queue_ids),
                Queue.status.in_([QueueStatus.PENDING, QueueStatus.PLAYING]),
            )
            .all()
        )
        if len(items) != len(ordered_queue_ids):
            return False
        id_to_item = {item.id: item for item in items}
        for position, qid in enumerate(ordered_queue_ids, start=1):
            id_to_item[qid].position = position
        self.db.commit()
        return True
