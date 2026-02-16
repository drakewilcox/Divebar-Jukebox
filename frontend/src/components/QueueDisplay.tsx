import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Collection } from '../types';
import { queueApi, playbackApi } from '../services/api';
import audioService from '../services/audio';
import './QueueDisplay.css';

interface Props {
  collection: Collection;
}

export default function QueueDisplay({ collection }: Props) {
  const queryClient = useQueryClient();
  const [currentPositionMs, setCurrentPositionMs] = useState(0);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  
  const { data: queue } = useQuery({
    queryKey: ['queue', collection.slug],
    queryFn: async () => {
      const response = await queueApi.get(collection.slug);
      return response.data;
    },
    refetchInterval: 2000,
  });
  
  const { data: playbackState } = useQuery({
    queryKey: ['playback-state', collection.slug],
    queryFn: async () => {
      const response = await playbackApi.getState(collection.slug);
      return response.data;
    },
    refetchInterval: 1000,
  });
  
  // Update progress from audio service
  useEffect(() => {
    const interval = setInterval(() => {
      if (audioService.isPlaying()) {
        const positionMs = audioService.getCurrentTime() * 1000;
        setCurrentPositionMs(positionMs);
      }
    }, 100);
    
    return () => clearInterval(interval);
  }, []);
  
  // Reset position when track changes
  useEffect(() => {
    if (playbackState?.current_track_id) {
      setCurrentPositionMs(0);
      audioService.loadTrack(playbackState.current_track_id);
      if (playbackState.is_playing) {
        audioService.play();
      }
    }
  }, [playbackState?.current_track_id]);
  
  // Sync play/pause state
  useEffect(() => {
    if (playbackState) {
      if (playbackState.is_playing && !audioService.isPlaying()) {
        audioService.play();
      } else if (!playbackState.is_playing && audioService.isPlaying()) {
        audioService.pause();
      }
    }
  }, [playbackState?.is_playing]);
  
  // Listen for track ended event to auto-skip
  useEffect(() => {
    const handleTrackEnded = async () => {
      console.log('Track ended, skipping to next...');
      try {
        await playbackApi.skip(collection.slug);
        queryClient.invalidateQueries({ queryKey: ['playback-state', collection.slug] });
        queryClient.invalidateQueries({ queryKey: ['queue', collection.slug] });
      } catch (error) {
        console.error('Failed to skip to next track:', error);
      }
    };
    
    window.addEventListener('track-ended', handleTrackEnded);
    return () => window.removeEventListener('track-ended', handleTrackEnded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection.slug]);
  
  const removeFromQueueMutation = useMutation({
    mutationFn: (queueId: string) => queueApi.remove(queueId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue', collection.slug] });
    },
  });
  
  const clearQueueMutation = useMutation({
    mutationFn: () => queueApi.clear(collection.slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue', collection.slug] });
    },
  });
  
  const stopMutation = useMutation({
    mutationFn: async () => {
      // Stop playback and clear queue
      await playbackApi.stop(collection.slug);
      await queueApi.clear(collection.slug);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playback-state', collection.slug] });
      queryClient.invalidateQueries({ queryKey: ['queue', collection.slug] });
    },
  });
  
  const playMutation = useMutation({
    mutationFn: () => playbackApi.play(collection.slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playback-state', collection.slug] });
    },
  });
  
  const pauseMutation = useMutation({
    mutationFn: () => playbackApi.pause(collection.slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playback-state', collection.slug] });
    },
  });
  
  const skipMutation = useMutation({
    mutationFn: () => playbackApi.skip(collection.slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playback-state', collection.slug] });
      queryClient.invalidateQueries({ queryKey: ['queue', collection.slug] });
    },
  });
  
  const handlePlayPause = () => {
    if (playbackState?.is_playing) {
      pauseMutation.mutate();
    } else {
      playMutation.mutate();
    }
  };
  
  const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };
  
  const formatCountdown = (totalMs: number, currentMs: number) => {
    const remainingMs = Math.max(0, totalMs - currentMs);
    return formatDuration(remainingMs);
  };
  
  const handleDragStart = (index: number) => {
    // Don't allow dragging the currently playing item
    if (queue && queue[index]?.status !== 'playing') {
      setDraggedIndex(index);
    }
  };
  
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    // Can't drop on or before the playing item
    if (queue && queue[index]?.status === 'playing') {
      return;
    }
  };
  
  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || !queue) return;
    
    // Can't drop on the playing item
    if (queue[dropIndex]?.status === 'playing') {
      setDraggedIndex(null);
      return;
    }
    
    // Don't allow moving if source is playing
    if (queue[draggedIndex]?.status === 'playing') {
      setDraggedIndex(null);
      return;
    }
    
    // Reorder logic would go here (we'd need a backend endpoint for this)
    // For now, just reset the drag state
    setDraggedIndex(null);
  };
  
  const nowPlaying = queue?.find(item => item.status === 'playing');
  const upcomingQueue = queue?.filter(item => item.status === 'pending') || [];
  const hasQueue = queue && queue.length > 0;
  
  return (
    <div className="queue-display">
      <div className="queue-header">
        <h2>Queue</h2>
        <div className="queue-header-controls">
          <button
            className="queue-control-button"
            onClick={handlePlayPause}
            disabled={!hasQueue || playMutation.isPending || pauseMutation.isPending}
            title={playbackState?.is_playing ? 'Pause' : 'Play'}
          >
            {playbackState?.is_playing ? '⏸' : '▶'}
          </button>
          <button
            className="queue-control-button"
            onClick={() => skipMutation.mutate()}
            disabled={!nowPlaying || skipMutation.isPending}
            title="Skip"
          >
            ⏭
          </button>
          <button
            className="queue-control-button stop"
            onClick={() => stopMutation.mutate()}
            disabled={!hasQueue || stopMutation.isPending}
            title="Stop & Clear"
          >
            ⏹
          </button>
        </div>
      </div>
      
      <div className="queue-list">
        {!queue || queue.length === 0 ? (
          <div className="queue-empty">
            <p>Queue is empty</p>
            <p>Use the input to add songs</p>
          </div>
        ) : (
          <>
            {/* Now Playing Section */}
            {nowPlaying && (
              <>
                <div className="now-playing-label">Now Playing</div>
                <div className="queue-item now-playing-item">
                  {nowPlaying.track.cover_art_path && (
                    <div className="queue-item-cover">
                      <img
                        src={`/api/media/${nowPlaying.track.cover_art_path}`}
                        alt={`${nowPlaying.track.album_title} cover`}
                      />
                    </div>
                  )}
                  
                  <div className="queue-item-info">
                    <div className="queue-item-title">{nowPlaying.track.title}</div>
                    <div className="queue-item-artist">{nowPlaying.track.artist}</div>
                    <div className="queue-item-album">{nowPlaying.track.album_title}</div>
                  </div>
                  
                  <div className="queue-item-duration now-playing-countdown">
                    {formatCountdown(nowPlaying.track.duration_ms, currentPositionMs)}
                  </div>
                </div>
              </>
            )}
            
            {/* Upcoming Queue Items */}
            {upcomingQueue.length > 0 && (
              <>
                <div className="queue-upcoming-label">Up Next ({upcomingQueue.length})</div>
                {upcomingQueue.map((item, index) => (
                  <div
                    key={item.id}
                    className={`queue-item ${draggedIndex === index + 1 ? 'dragging' : ''}`}
                    draggable
                    onDragStart={() => handleDragStart(index + 1)}
                    onDragOver={(e) => handleDragOver(e, index + 1)}
                    onDrop={(e) => handleDrop(e, index + 1)}
                  >
                    {item.track.cover_art_path && (
                      <div className="queue-item-cover">
                        <img
                          src={`/api/media/${item.track.cover_art_path}`}
                          alt={`${item.track.album_title} cover`}
                        />
                      </div>
                    )}
                    
                    <div className="queue-item-info">
                      <div className="queue-item-title">{item.track.title}</div>
                      <div className="queue-item-artist">{item.track.artist}</div>
                      <div className="queue-item-album">{item.track.album_title}</div>
                    </div>
                    
                    <div className="queue-item-duration">
                      {formatDuration(item.track.duration_ms)}
                    </div>
                    
                    <button
                      className="queue-item-remove"
                      onClick={() => removeFromQueueMutation.mutate(item.id)}
                      disabled={removeFromQueueMutation.isPending}
                      aria-label="Remove from queue"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
