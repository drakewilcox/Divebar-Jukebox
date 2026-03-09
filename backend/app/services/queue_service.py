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
    
    def add_to_queue(self, collection_id: str, session_id: str, track_id: str) -> Optional[Queue]:
        """
        Add a track to the queue for this collection+session. Does not add if already in queue (pending or playing).

        Args:
            collection_id: Collection UUID
            session_id: Session/device scope (client-provided)
            track_id: Track UUID

        Returns:
            Queue instance, or None if track already in queue or on error
        """
        existing = self.db.query(Queue).filter(
            Queue.collection_id == collection_id,
            Queue.session_id == session_id,
            Queue.track_id == track_id,
            Queue.status.in_([QueueStatus.PENDING, QueueStatus.PLAYING])
        ).first()
        if existing:
            logger.debug(f"Track {track_id} already in queue for collection {collection_id}, skipping duplicate")
            return None

        # Get the maximum position value from pending/playing tracks for this session
        from sqlalchemy import func
        max_position_result = self.db.query(func.max(Queue.position)).filter(
            Queue.collection_id == collection_id,
            Queue.session_id == session_id,
            Queue.status.in_([QueueStatus.PENDING, QueueStatus.PLAYING])
        ).scalar()

        # If queue is empty, start at position 1, otherwise increment max position
        max_position = max_position_result if max_position_result is not None else 0

        queue_item = Queue(
            collection_id=collection_id,
            session_id=session_id,
            track_id=track_id,
            position=max_position + 1,
            status=QueueStatus.PENDING
        )

        self.db.add(queue_item)
        self.db.commit()

        logger.info(f"Added track {track_id} to queue at position {queue_item.position}")
        return queue_item
    
    def add_album_to_queue(self, collection_id: str, session_id: str, track_ids: List[str]) -> int:
        """
        Add multiple tracks (album) to queue for this collection+session.
        """
        count = 0
        for track_id in track_ids:
            if self.add_to_queue(collection_id, session_id, track_id):
                count += 1
        return count

    def get_queue(self, collection_id: str, session_id: str, include_played: bool = False) -> List[Queue]:
        """
        Get queue for a collection + session.
        """
        query = self.db.query(Queue).filter(
            Queue.collection_id == collection_id,
            Queue.session_id == session_id,
        )
        if not include_played:
            query = query.filter(Queue.status.in_([QueueStatus.PENDING, QueueStatus.PLAYING]))
        return query.order_by(Queue.position).all()

    def get_next_track(self, collection_id: str, session_id: str) -> Optional[Queue]:
        """
        Get next pending track in queue for this collection+session.
        """
        return self.db.query(Queue).filter(
            Queue.collection_id == collection_id,
            Queue.session_id == session_id,
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
    
    def remove_from_queue(self, queue_id: str, session_id: str) -> bool:
        """Remove a track from queue. Queue item must belong to this session."""
        queue_item = self.db.query(Queue).filter(Queue.id == queue_id, Queue.session_id == session_id).first()
        if queue_item:
            collection_id = queue_item.collection_id
            self.db.delete(queue_item)
            self._reorder_queue(collection_id, session_id)
            self.db.commit()
            return True
        return False

    def clear_queue(self, collection_id: str, session_id: str, clear_played: bool = True) -> int:
        """Clear queue for a collection + session."""
        query = self.db.query(Queue).filter(
            Queue.collection_id == collection_id,
            Queue.session_id == session_id,
        )
        if not clear_played:
            query = query.filter(Queue.status.in_([QueueStatus.PENDING, QueueStatus.PLAYING]))
        count = query.count()
        query.delete()
        self.db.commit()
        logger.info(f"Cleared {count} items from queue for collection {collection_id} session {session_id}")
        return count

    def _reorder_queue(self, collection_id: str, session_id: str) -> None:
        """Reorder queue positions after removal for this collection+session."""
        queue_items = self.db.query(Queue).filter(
            Queue.collection_id == collection_id,
            Queue.session_id == session_id,
            Queue.status.in_([QueueStatus.PENDING, QueueStatus.PLAYING])
        ).order_by(Queue.position).all()
        for index, item in enumerate(queue_items, start=1):
            item.position = index

    def reorder_queue(self, collection_id: str, session_id: str, ordered_queue_ids: List[str]) -> bool:
        """Set queue order from a list of queue item IDs. All IDs must belong to this collection+session."""
        if not ordered_queue_ids:
            return True
        items = (
            self.db.query(Queue)
            .filter(
                Queue.collection_id == collection_id,
                Queue.session_id == session_id,
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
