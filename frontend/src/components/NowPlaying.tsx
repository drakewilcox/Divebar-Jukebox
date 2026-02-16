import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Collection } from '../types';
import { playbackApi } from '../services/api';
import audioService from '../services/audio';
import './NowPlaying.css';

interface Props {
  collection: Collection;
}

export default function NowPlaying({ collection }: Props) {
  const queryClient = useQueryClient();
  const [currentPositionMs, setCurrentPositionMs] = useState(0);
  
  const { data: playbackState } = useQuery({
    queryKey: ['playback-state', collection.slug],
    queryFn: async () => {
      const response = await playbackApi.getState(collection.slug);
      return response.data;
    },
    refetchInterval: 1000, // Poll every second
  });
  
  // Update progress from audio service
  useEffect(() => {
    const interval = setInterval(() => {
      if (audioService.isPlaying()) {
        const positionMs = audioService.getCurrentTime() * 1000;
        setCurrentPositionMs(positionMs);
      }
    }, 100); // Update every 100ms for smooth progress
    
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
      audioService.loadTrack(playbackState.current_track_id);
      setCurrentPositionMs(0); // Reset position for new track
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
  
  if (!playbackState?.current_track) {
    return (
      <div className="now-playing">
        <div className="now-playing-empty">
          <p>No track playing</p>
          <p>Add songs to the queue to start</p>
        </div>
      </div>
    );
  }
  
  const { current_track } = playbackState;
  const progress = (currentPositionMs / current_track.duration_ms) * 100;
  
  return (
    <div className="now-playing">
      <div className="now-playing-info">
        {current_track.cover_art_path && (
          <div className="now-playing-cover">
            <img
              src={`/api/media/${current_track.cover_art_path}`}
              alt={`${current_track.album_title} cover`}
            />
          </div>
        )}
        
        <div className="now-playing-details">
          <div className="now-playing-title">{current_track.title}</div>
          <div className="now-playing-artist">{current_track.artist}</div>
          <div className="now-playing-album">{current_track.album_title}</div>
        </div>
      </div>
      
      <div className="now-playing-progress">
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="progress-time">
          <span>{formatDuration(currentPositionMs)}</span>
          <span>{formatDuration(current_track.duration_ms)}</span>
        </div>
      </div>
      
      <div className="now-playing-controls">
        <button
          className="control-button"
          onClick={handlePlayPause}
          disabled={playMutation.isPending || pauseMutation.isPending}
        >
          {playbackState.is_playing ? '⏸' : '▶'}
        </button>
        
        <button
          className="control-button"
          onClick={() => skipMutation.mutate()}
          disabled={skipMutation.isPending}
        >
          ⏭
        </button>
      </div>
    </div>
  );
}
