import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Collection } from '../types';
import { playbackApi } from '../services/api';
import audioService from '../services/audio';
import styles from './NowPlaying.module.css'
import clsx from 'clsx';

interface Props {
  collection: Collection;
}

export default function NowPlaying({ collection }: Props) {
  const queryClient = useQueryClient();
  const [currentPositionMs, setCurrentPositionMs] = useState(0);
  const progressBarRef = useRef<HTMLDivElement>(null);
  
  const { data: playbackState } = useQuery({
    queryKey: ['playback-state', collection.slug],
    queryFn: async () => {
      const response = await playbackApi.getState(collection.slug);
      return response.data;
    },
    refetchInterval: 1000, // Poll every second
  });
  
  // Update progress from audio service (playing + when paused so seek is reflected)
  useEffect(() => {
    const interval = setInterval(() => {
      const positionMs = audioService.getCurrentTime() * 1000;
      setCurrentPositionMs(positionMs);
    }, 100);

    return () => clearInterval(interval);
  }, []);
  
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
  
  // Load track when current track changes
  useEffect(() => {
    if (playbackState?.current_track_id) {
      const replaygain =
        playbackState.current_track?.replaygain_track_gain ?? undefined;
      const durationMs = playbackState.current_track?.duration_ms ?? undefined;
      audioService.loadTrack(playbackState.current_track_id, replaygain, collection.slug, durationMs);
      setCurrentPositionMs(0); // Reset position for new track
      if (playbackState.is_playing) {
        audioService.play();
      }
    }
  }, [playbackState?.current_track_id, collection.slug]);
  
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
  
  // Listen for track ended event to auto-skip (no crossfade path)
  useEffect(() => {
    const handleTrackEnded = async () => {
      try {
        await playbackApi.skip(collection.slug);
        queryClient.invalidateQueries({ queryKey: ['playback-state', collection.slug] });
        queryClient.invalidateQueries({ queryKey: ['queue', collection.slug] });
      } catch (error) {
        console.error('Failed to skip to next track:', error);
      }
    };
    const handleCrossfadeComplete = () => {
      queryClient.invalidateQueries({ queryKey: ['playback-state', collection.slug] });
      queryClient.invalidateQueries({ queryKey: ['queue', collection.slug] });
    };
    window.addEventListener('track-ended', handleTrackEnded);
    window.addEventListener('crossfade-complete', handleCrossfadeComplete);
    return () => {
      window.removeEventListener('track-ended', handleTrackEnded);
      window.removeEventListener('crossfade-complete', handleCrossfadeComplete);
    };
  }, [collection.slug, queryClient]);
  
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

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const bar = progressBarRef.current;
    const durationMs = playbackState?.current_track?.duration_ms;
    if (!bar || durationMs == null || durationMs <= 0) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const seekMs = ratio * durationMs;
    audioService.seek(seekMs / 1000);
    setCurrentPositionMs(seekMs);
  };

  if (!playbackState?.current_track) {
    return (
      <div className={styles['now-playing']}>
        <div className={styles['now-playing-empty']}>
          <p>No track playing</p>
          <p>Add songs to the queue to start</p>
        </div>
      </div>
    );
  }
  
  const { current_track } = playbackState;
  const progress = Math.min(100, (currentPositionMs / current_track.duration_ms) * 100) || 0;
  
  return (
    <div className={styles['now-playing']}>
      <div className={styles['now-playing-info']}>
        {current_track.cover_art_path && (
          <div className={styles['now-playing-cover']}>
            <img
              src={`/api/media/${current_track.cover_art_path}`}
              alt={`${current_track.album_title} cover`}
            />
          </div>
        )}
        
        <div className={styles['now-playing-details']}>
          <div className={styles['now-playing-title']}>{current_track.title}</div>
          <div className={styles['now-playing-artist']}>{current_track.artist}</div>
          <div className={styles['now-playing-album']}>{current_track.album_title}</div>
        </div>
      </div>
      
      <div className={styles['now-playing-progress']}>
        <div
          ref={progressBarRef}
          className={clsx(styles['progress-bar'], styles['progress-bar-seekable'])}
          onClick={handleProgressClick}
          role="slider"
          aria-label="Track position"
          aria-valuemin={0}
          aria-valuemax={current_track.duration_ms}
          aria-valuenow={currentPositionMs}
        >
          <div className={styles['progress-fill']} style={{ width: `${progress}%` }} />
        </div>
        <div className={styles['progress-time']}>
          <span>{formatDuration(currentPositionMs)}</span>
          <span>{formatDuration(current_track.duration_ms)}</span>
        </div>
      </div>
      
      <div className={styles['now-playing-controls']}>
        <button
          className={styles['control-button']}
          onClick={handlePlayPause}
          disabled={playMutation.isPending || pauseMutation.isPending}
        >
          {playbackState.is_playing ? '⏸' : '▶'}
        </button>
        
        <button
          className={styles['control-button']}
          onClick={() => skipMutation.mutate()}
          disabled={skipMutation.isPending}
        >
          ⏭
        </button>
      </div>
    </div>
  );
}
