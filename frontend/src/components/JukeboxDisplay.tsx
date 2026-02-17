import { useEffect } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { collectionsApi, queueApi, playbackApi } from '../services/api';
import { Collection } from '../types';
import CardCarousel from './CardCarousel';
import './JukeboxDisplay.css';

interface Props {
  collection: Collection;
  collections: Collection[];
  onCollectionChange: (collection: Collection) => void;
}

export default function JukeboxDisplay({ collection, collections, onCollectionChange }: Props) {
  const queryClient = useQueryClient();
  
  // Fetch albums for this collection. keepPreviousData so switching collection in the
  // settings modal doesn’t briefly show empty and the modal stays open.
  const { data: albums, isLoading } = useQuery({
    queryKey: ['collection-albums', collection.slug],
    queryFn: async () => {
      const response = await collectionsApi.getAlbums(collection.slug);
      return response.data;
    },
    enabled: !!collection,
    placeholderData: keepPreviousData,
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
  
  // Always render CardCarousel when we have a collection so the settings modal stays
  // mounted when switching collections (otherwise the loading div would unmount it).
  const albumsToShow = albums ?? [];

  return (
    <div className="jukebox-display">
      {isLoading && albumsToShow.length === 0 && (
        <div className="jukebox-loading">Loading albums...</div>
      )}
      <div className="jukebox-main">
        <CardCarousel 
          albums={albumsToShow} 
          collection={collection}
          collections={collections}
          onCollectionChange={onCollectionChange}
        />
      </div>
      {!isLoading && albumsToShow.length === 0 && (
        <div className="jukebox-empty">
          <p>No albums in this collection yet.</p>
          <p>Use the admin panel to add albums.</p>
        </div>
      )}
    </div>
  );
}
