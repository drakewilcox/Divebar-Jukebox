import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collectionsApi, queueApi, playbackApi } from '../services/api';
import { Collection } from '../types';
import CardCarousel from './CardCarousel';
import QueueDisplay from './QueueDisplay';
import './JukeboxDisplay.css';

interface Props {
  collection: Collection;
  collections: Collection[];
  onCollectionChange: (collection: Collection) => void;
}

export default function JukeboxDisplay({ collection, collections, onCollectionChange }: Props) {
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const queryClient = useQueryClient();
  
  // Fetch albums for this collection
  const { data: albums, isLoading } = useQuery({
    queryKey: ['collection-albums', collection.slug],
    queryFn: async () => {
      const response = await collectionsApi.getAlbums(collection.slug);
      return response.data;
    },
    enabled: !!collection,
  });
  
  // Fetch queue to monitor for changes
  const { data: queue } = useQuery({
    queryKey: ['queue', collection.slug],
    queryFn: async () => {
      const response = await queueApi.get(collection.slug);
      return response.data;
    },
    refetchInterval: 2000,
  });
  
  // Fetch playback state to check if playing
  const { data: playbackState } = useQuery({
    queryKey: ['playback-state', collection.slug],
    queryFn: async () => {
      const response = await playbackApi.getState(collection.slug);
      return response.data;
    },
    refetchInterval: 1000,
  });
  
  // Auto-start playback when tracks are added to an empty queue
  useEffect(() => {
    const autoStartPlayback = async () => {
      if (queue && queue.length > 0 && playbackState && !playbackState.is_playing && !playbackState.current_track_id) {
        // Queue has tracks, but nothing is playing and no current track
        // Automatically start playback
        console.log('Auto-starting playback...');
        try {
          await playbackApi.play(collection.slug);
          queryClient.invalidateQueries({ queryKey: ['playback-state', collection.slug] });
        } catch (error) {
          console.error('Failed to auto-start playback:', error);
        }
      }
    };
    
    autoStartPlayback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue?.length, playbackState?.is_playing, playbackState?.current_track_id, collection.slug]);
  
  // Keyboard shortcut to toggle queue with "Q" key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only toggle if not typing in an input/textarea
      if (e.key.toLowerCase() === 'q' && 
          !(e.target instanceof HTMLInputElement) && 
          !(e.target instanceof HTMLTextAreaElement)) {
        setIsQueueOpen(prev => !prev);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  
  if (isLoading) {
    return <div className="jukebox-loading">Loading albums...</div>;
  }
  
  if (!albums || albums.length === 0) {
    return (
      <div className="jukebox-empty">
        <p>No albums in this collection yet.</p>
        <p>Use the admin panel to add albums.</p>
      </div>
    );
  }
  
  return (
    <div className="jukebox-display">
      <div className="jukebox-main">
        <CardCarousel 
          albums={albums} 
          collection={collection}
          collections={collections}
          onCollectionChange={onCollectionChange}
        />
      </div>
      
      <button
        className={`queue-toggle ${isQueueOpen ? 'open' : ''}`}
        onClick={() => setIsQueueOpen(!isQueueOpen)}
      >
        {isQueueOpen ? '▶ ' : '◀'}
      </button>
      
      <div className={`jukebox-sidebar ${isQueueOpen ? 'open' : ''}`}>
        <QueueDisplay collection={collection} />
      </div>
    </div>
  );
}
