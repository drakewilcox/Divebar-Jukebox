import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import React, { useState, useEffect, useRef } from 'react';
import { MdPlayArrow, MdPause, MdSkipNext, MdStop } from 'react-icons/md';
import { Collection } from '../types';
import { queueApi, playbackApi, getMediaUrl } from '../services/api';
import audioService from '../services/audio';
import { useSpotifyStore } from '../stores/spotifyStore';
import { spotifyPause, getSpotifyPlayer } from '../services/spotifyPlayer';
import styles from './QueueDisplay.module.css'
import clsx from 'clsx';

type GetSelectionDisplay = (albumId: string | null | undefined, trackNumber1Based: number | null | undefined) => string | null;

interface Props {
  collection: Collection;
  onQueueCleared?: () => void;
  /** When provided, selection number is shown in current sort order (e.g. alphabetical) instead of curated. */
  getSelectionDisplay?: GetSelectionDisplay;
  userSlug?: string;
  /** When false, playback uses Spotify only; local stream is not used */
  enableLocalLibrary?: boolean;
  /** Called when user clicks Stop (so parent can suppress auto-start / sync for a short window) */
  onStopped?: () => void;
}

export default function QueueDisplay({ collection, onQueueCleared, getSelectionDisplay, userSlug, enableLocalLibrary = true, onStopped }: Props) {
  const queryClient = useQueryClient();
  const spotifyToken = useSpotifyStore((s) => s.getAccessToken());
  const [currentPositionMs, setCurrentPositionMs] = useState(0);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropIndicatorIndex, setDropIndicatorIndex] = useState<number | null>(null);
  const queueListRef = useRef<HTMLDivElement>(null);
  const lastDragYRef = useRef<number>(0);
  const lastSkipAtRef = useRef<number>(0);

  const { data: queueRaw } = useQuery({
    queryKey: ['queue', collection.slug, userSlug],
    queryFn: async () => {
      const response = await queueApi.get(collection.slug, userSlug);
      return response.data;
    },
    refetchInterval: (query) => (Array.isArray(query.state.data) && query.state.data.length > 0 ? 2000 : false),
  });
  const queue = Array.isArray(queueRaw) ? queueRaw : [];

  const { data: playbackState } = useQuery({
    queryKey: ['playback-state', collection.slug, userSlug],
    queryFn: async () => {
      const response = await playbackApi.getState(collection.slug, userSlug);
      return response.data;
    },
    refetchInterval: (query) => (query.state.data?.is_playing ? 1000 : false),
  });

  const useSpotifyForTrack =
    !!spotifyToken && !!(playbackState?.current_track as { spotify_id?: string } | undefined)?.spotify_id;
  
  // Update progress from audio service or Spotify player (SDK position is in ms; update when paused too)
  useEffect(() => {
    const interval = setInterval(async () => {
      if (useSpotifyForTrack) {
        const player = getSpotifyPlayer();
        const state = player ? await player.getCurrentState() : null;
        if (state != null) {
          setCurrentPositionMs(state.position);
        }
      } else if (enableLocalLibrary) {
        setCurrentPositionMs(audioService.getCurrentTime() * 1000);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [useSpotifyForTrack, enableLocalLibrary]);

  // Sync playback state to local audio only (Spotify is driven by SpotifyPlaybackSync)
  useEffect(() => {
    if (!playbackState?.current_track_id) {
      setCurrentPositionMs(0);
      return;
    }
    const spotifyId = (playbackState.current_track as { spotify_id?: string } | undefined)?.spotify_id;
    if (spotifyId && spotifyToken) {
      setCurrentPositionMs(0);
      return;
    }
    if (!enableLocalLibrary) return;
    if (audioService.getCurrentTrackId() === playbackState.current_track_id) {
      if (playbackState.is_playing && !audioService.isPlaying()) {
        audioService.play();
      } else if (!playbackState.is_playing && audioService.isPlaying()) {
        audioService.pause();
      }
      return;
    }
    setCurrentPositionMs(0);
    const replaygain =
      playbackState.current_track?.replaygain_track_gain ?? undefined;
    const durationMs = playbackState.current_track?.duration_ms ?? undefined;
    audioService.loadTrack(playbackState.current_track_id, replaygain, collection.slug, durationMs, userSlug);
    if (playbackState.is_playing) {
      audioService.play();
    }
  }, [playbackState?.current_track_id, playbackState?.is_playing, collection.slug, userSlug, spotifyToken, enableLocalLibrary]);
  
  // Sync play/pause state for local audio only
  useEffect(() => {
    if (!playbackState || useSpotifyForTrack) return;
    if (enableLocalLibrary) {
      if (playbackState.is_playing && !audioService.isPlaying()) {
        audioService.play();
      } else if (!playbackState.is_playing && audioService.isPlaying()) {
        audioService.pause();
      }
    }
  }, [playbackState?.is_playing, useSpotifyForTrack, enableLocalLibrary]);
  
  // Auto-scroll queue list when dragging near top or bottom
  useEffect(() => {
    if (draggedIndex === null) return;
    const SCROLL_ZONE = 80;
    const SCROLL_SPEED = 10;
    const interval = setInterval(() => {
      const list = queueListRef.current;
      if (!list) return;
      const y = lastDragYRef.current;
      const rect = list.getBoundingClientRect();
      if (y <= rect.top + SCROLL_ZONE) {
        list.scrollTop = Math.max(0, list.scrollTop - SCROLL_SPEED);
      } else if (y >= rect.bottom - SCROLL_ZONE) {
        list.scrollTop = Math.min(list.scrollHeight - list.clientHeight, list.scrollTop + SCROLL_SPEED);
      }
    }, 50);
    return () => clearInterval(interval);
  }, [draggedIndex]);

  // Listen for track ended (no crossfade) and crossfade-complete
  useEffect(() => {
    const handleTrackEnded = async () => {
      if (Date.now() - lastSkipAtRef.current < 2500) return;
      lastSkipAtRef.current = Date.now();
      try {
        await playbackApi.skip(collection.slug, userSlug);
        queryClient.invalidateQueries({ queryKey: ['playback-state', collection.slug, userSlug] });
        queryClient.invalidateQueries({ queryKey: ['queue', collection.slug, userSlug] });
      } catch (error) {
        console.error('Failed to skip to next track:', error);
      }
    };
    const handleCrossfadeComplete = () => {
      queryClient.invalidateQueries({ queryKey: ['playback-state', collection.slug, userSlug] });
      queryClient.invalidateQueries({ queryKey: ['queue', collection.slug, userSlug] });
    };
    window.addEventListener('track-ended', handleTrackEnded);
    window.addEventListener('crossfade-complete', handleCrossfadeComplete);
    return () => {
      window.removeEventListener('track-ended', handleTrackEnded);
      window.removeEventListener('crossfade-complete', handleCrossfadeComplete);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection.slug, userSlug]);
  
  const removeFromQueueMutation = useMutation({
    mutationFn: (queueId: string) => queueApi.remove(queueId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue', collection.slug, userSlug] });
    },
  });
  
  const reorderQueueMutation = useMutation({
    mutationFn: (queueIds: string[]) => queueApi.reorder(collection.slug, queueIds, userSlug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue', collection.slug, userSlug] });
    },
  });

  const stopMutation = useMutation({
    mutationFn: async () => {
      onStopped?.();
      audioService.stop();
      spotifyPause();
      await playbackApi.stop(collection.slug, userSlug);
      await queueApi.clear(collection.slug, userSlug);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playback-state', collection.slug, userSlug] });
      queryClient.invalidateQueries({ queryKey: ['queue', collection.slug, userSlug] });
      onQueueCleared?.();
    },
  });
  
  const playMutation = useMutation({
    mutationFn: () => playbackApi.play(collection.slug, userSlug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playback-state', collection.slug, userSlug] });
    },
  });
  
  const pauseMutation = useMutation({
    mutationFn: () => playbackApi.pause(collection.slug, userSlug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playback-state', collection.slug, userSlug] });
    },
  });
  
  const skipMutation = useMutation({
    mutationFn: () => playbackApi.skip(collection.slug, userSlug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playback-state', collection.slug, userSlug] });
      queryClient.invalidateQueries({ queryKey: ['queue', collection.slug, userSlug] });
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
  
  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (queue && queue[index]?.status !== 'playing') {
      setDraggedIndex(index);
      setDropIndicatorIndex(null);
      lastDragYRef.current = e.clientY;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', '');
      if (e.dataTransfer.setDragImage) {
        const target = e.currentTarget as HTMLElement;
        const rect = target.getBoundingClientRect();
        e.dataTransfer.setDragImage(target, rect.width / 2, rect.height / 2);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent, fullIndex: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    lastDragYRef.current = e.clientY;
    if (!queue || queue[fullIndex]?.status === 'playing') return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const inBottomHalf = (e.clientY - rect.top) > rect.height / 2;
    const indicator = inBottomHalf ? Math.min(fullIndex + 1, queue.length) : fullIndex;
    setDropIndicatorIndex(indicator >= 1 ? indicator : 1);
  };

  const handleListDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    lastDragYRef.current = e.clientY;
  };

  const handleDrop = (e: React.DragEvent, fallbackDropIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (queue?.[fallbackDropIndex]?.status === 'playing') {
      setDraggedIndex(null);
      setDropIndicatorIndex(null);
      return;
    }
    const dropIndex = dropIndicatorIndex ?? fallbackDropIndex;
    performReorder(dropIndex);
  };

  const handleListDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedIndex === null || !queue) return;
    const dropIndex = dropIndicatorIndex ?? Math.min(draggedIndex + 1, queue.length);
    performReorder(dropIndex);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDropIndicatorIndex(null);
  };

  const performReorder = (dropIndex: number) => {
    if (draggedIndex === null || !queue) return;
    if (queue[draggedIndex]?.status === 'playing') return;
    if (dropIndex < 1 || dropIndex > queue.length) return;
    const ids = queue.map((item) => item.id);
    const [moved] = ids.splice(draggedIndex, 1);
    ids.splice(dropIndex, 0, moved);
    reorderQueueMutation.mutate(ids);
    setDraggedIndex(null);
    setDropIndicatorIndex(null);
  };
  
  const nowPlaying = queue?.find(item => item.status === 'playing');
  const upcomingQueue = queue?.filter(item => item.status === 'pending') || [];
  const hasQueue = queue && queue.length > 0;
  
  return (
    <div className={styles['queue-display']}>
      <div className={styles['queue-header']}>
        <h2>Queue</h2>
        <div className={styles['queue-header-controls']}>
          <button
            className={styles['queue-control-button']}
            onClick={handlePlayPause}
            disabled={!hasQueue || playMutation.isPending || pauseMutation.isPending}
            title={playbackState?.is_playing ? 'Pause' : 'Play'}
            aria-label={playbackState?.is_playing ? 'Pause' : 'Play'}
          >
            {playbackState?.is_playing ? <MdPause size={22} /> : <MdPlayArrow size={22} />}
          </button>
          <button
            className={styles['queue-control-button']}
            onClick={() => skipMutation.mutate()}
            disabled={!nowPlaying || skipMutation.isPending}
            title="Skip"
            aria-label="Skip"
          >
            <MdSkipNext size={22} />
          </button>
          <button
            className={clsx(styles['queue-control-button'], styles['stop'])}
            onClick={() => stopMutation.mutate()}
            disabled={!hasQueue || stopMutation.isPending}
            title="Stop & Clear"
            aria-label="Stop and clear queue"
          >
            <MdStop size={22} />
          </button>
        </div>
      </div>
      
      <div
        ref={queueListRef}
        className={styles['queue-list']}
        onDragOver={handleListDragOver}
        onDrop={handleListDrop}
      >
        {!queue || queue.length === 0 ? (
          <div className={styles['queue-empty']}>
            <p>Queue is empty</p>
            <p>Use the input to add songs</p>
          </div>
        ) : (
          <>
            {/* Now Playing Section */}
            {nowPlaying && (
              <>
                <div className={styles['now-playing-label']}>Now Playing</div>
                <div className={clsx(styles['queue-item'], styles['now-playing-item'])}>
                  {(getMediaUrl(nowPlaying.track.cover_art_path, nowPlaying.track.is_playlist) ?? nowPlaying.track.spotify_image_url) && (
                    <div className={styles['queue-item-cover']}>
                      <img
                        src={getMediaUrl(nowPlaying.track.cover_art_path, nowPlaying.track.is_playlist) ?? nowPlaying.track.spotify_image_url ?? ''}
                        alt={`${nowPlaying.track.album_title} cover`}
                      />
                    </div>
                  )}
                  
                  <div className={styles['queue-item-info']}>
                   
                    <div className={styles['queue-item-title']}>{nowPlaying.track.title}</div>
                    <div className={styles['queue-item-artist']}>{nowPlaying.track.artist}</div>
                    <div className={styles['queue-item-album']}>{nowPlaying.track.album_title}</div>
                    {(getSelectionDisplay?.(nowPlaying.track.album_id, nowPlaying.track.track_number) ?? nowPlaying.track.selection_display) && (
                      <div className={styles['queue-item-selection']}>
                        {getSelectionDisplay?.(nowPlaying.track.album_id, nowPlaying.track.track_number) ?? nowPlaying.track.selection_display}
                      </div>
                    )}
                  </div>
                  
                  <div className={clsx(styles['queue-item-duration'], styles['now-playing-countdown'])}>
                    {formatCountdown(nowPlaying.track.duration_ms, currentPositionMs)}
                  </div>
                </div>
              </>
            )}
            
            {/* Upcoming Queue Items */}
            {upcomingQueue.length > 0 && (
              <>
                <div className={styles['queue-upcoming-label']}>Up Next ({upcomingQueue.length})</div>
                {upcomingQueue.map((item, index) => (
                  <React.Fragment key={item.id}>
                    {dropIndicatorIndex === index + 1 && <div className={styles['queue-drop-indicator']} aria-hidden />}
                    <div
                      className={clsx(styles['queue-item'], styles['queue-item-draggable'], draggedIndex === index + 1 && styles['dragging'])}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index + 1)}
                      onDragOver={(e) => handleDragOver(e, index + 1)}
                      onDrop={(e) => handleDrop(e, index + 1)}
                      onDragEnd={handleDragEnd}
                    >
                    {(getMediaUrl(item.track.cover_art_path, item.track.is_playlist) ?? item.track.spotify_image_url) && (
                      <div className={styles['queue-item-cover']}>
                        <img
                          src={getMediaUrl(item.track.cover_art_path, item.track.is_playlist) ?? item.track.spotify_image_url ?? ''}
                          alt={`${item.track.album_title} cover`}
                        />
                      </div>
                    )}
                    
                    <div className={styles['queue-item-info']}>
                     
                      <div className={styles['queue-item-title']}>{item.track.title}</div>
                      <div className={styles['queue-item-artist']}>{item.track.artist}</div>
                      <div className={styles['queue-item-album']}>{item.track.album_title}</div>
                      {(getSelectionDisplay?.(item.track.album_id, item.track.track_number) ?? item.track.selection_display) && (
                        <div className={styles['queue-item-selection']}>
                          {getSelectionDisplay?.(item.track.album_id, item.track.track_number) ?? item.track.selection_display}
                        </div>
                      )}
                    </div>
                    
                    <div className={styles['queue-item-duration']}>
                      {formatDuration(item.track.duration_ms)}
                    </div>
                    
                    <button
                      className={styles['queue-item-remove']}
                      onClick={() => removeFromQueueMutation.mutate(item.id)}
                      disabled={removeFromQueueMutation.isPending}
                      aria-label="Remove from queue"
                    >
                      ✕
                    </button>
                  </div>
                  </React.Fragment>
                ))}
                {dropIndicatorIndex === (queue?.length ?? 0) && <div className={styles['queue-drop-indicator']} aria-hidden />}
                {/* Extra drop zone below last item so you can scroll and drop to move item last */}
                {queue && queue.length > 0 && (
                  <div
                    className={styles['queue-list-spacer']}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      lastDragYRef.current = e.clientY;
                      setDropIndicatorIndex(queue.length);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      performReorder(queue.length);
                    }}
                  />
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
