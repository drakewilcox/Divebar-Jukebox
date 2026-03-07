import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { collectionsApi, queueApi, playbackApi, configApi } from '../services/api';
import { Collection } from '../types';
import { useSpotifyStore } from '../stores/spotifyStore';
import { initSpotifyPlayer } from '../services/spotifyPlayer';
import CardCarousel from './CardCarousel';
import SpotifyPlaybackSync from './SpotifyPlaybackSync';
import styles from './JukeboxDisplay.module.css';

const JUST_STOPPED_MS = 2000;
const SCREEN_WARNING_STORAGE_KEY = 'divebar-jukebox-screen-warning-dismissed';

interface Props {
  collection: Collection;
  collections: Collection[];
  onCollectionChange: (collection: Collection) => void;
  /** When viewing by route /:user_slug/:collection_slug */
  userSlug?: string;
}

export default function JukeboxDisplay({ collection, collections, onCollectionChange, userSlug }: Props) {
  const queryClient = useQueryClient();
  const spotifyInitialized = useRef(false);
  const spotifyToken = useSpotifyStore((s) => s.getAccessToken());
  const [lastStoppedAt, setLastStoppedAt] = useState<number | null>(null);
  const [showScreenWarning, setShowScreenWarning] = useState(false);

  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: async () => {
      const res = await configApi.getConfig();
      return res.data;
    },
    retry: false,
  });
  const enableLocalLibrary =
    config?.enable_local_library ?? (import.meta.env.VITE_ENABLE_LOCAL_FILES === 'false' ? false : true);

  // One-time warning when viewport is non-ideal (narrow or portrait)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(SCREEN_WARNING_STORAGE_KEY)) return;
    const isNarrow = window.innerWidth < 1285;
    const isPortrait = window.matchMedia('(orientation: portrait)').matches;
    if (isNarrow || isPortrait) setShowScreenWarning(true);
  }, []);

  const dismissScreenWarning = () => {
    try {
      localStorage.setItem(SCREEN_WARNING_STORAGE_KEY, 'true');
    } catch {
      // ignore storage errors
    }
    setShowScreenWarning(false);
  };

  // In Spotify mode only: restore access token and init Spotify Web Playback SDK
  useEffect(() => {
    if (enableLocalLibrary) return;
    if (!useSpotifyStore.getState().getAccessToken()) {
      useSpotifyStore.getState().refreshAccessToken();
    }
  }, [enableLocalLibrary]);

  useEffect(() => {
    if (enableLocalLibrary || !spotifyToken || spotifyInitialized.current) return;
    const getToken = async () => {
      const s = useSpotifyStore.getState();
      let t = s.getAccessToken();
      if (!t) t = await s.refreshAccessToken();
      return t;
    };
    initSpotifyPlayer(getToken).then((ok) => {
      if (ok) spotifyInitialized.current = true;
    });
  }, [enableLocalLibrary, spotifyToken]);

  // Fetch current collection by slug so we always have latest default_* from server (e.g. default_jump_button_type)
  const { data: collectionFromApi } = useQuery({
    queryKey: ['collection', collection.slug, userSlug],
    queryFn: async () => {
      const res = await collectionsApi.getBySlug(collection.slug, userSlug);
      return res.data;
    },
    enabled: !!collection?.slug,
  });
  const effectiveCollection = collectionFromApi ?? collection;

  // Fetch albums for this collection. keepPreviousData so switching collection in the
  // settings modal doesn’t briefly show empty and the modal stays open.
  const { data: albums, isLoading } = useQuery({
    queryKey: ['collection-albums', collection.slug, userSlug],
    queryFn: async () => {
      const response = await collectionsApi.getAlbums(collection.slug, userSlug);
      const data = response.data;
      return Array.isArray(data) ? data : [];
    },
    enabled: !!collection,
    placeholderData: keepPreviousData,
  });

  // Fetch queue to monitor for changes
  const { data: queue } = useQuery({
    queryKey: ['queue', collection.slug, userSlug],
    queryFn: async () => {
      const response = await queueApi.get(collection.slug, userSlug);
      const data = response.data;
      return Array.isArray(data) ? data : [];
    },
    refetchInterval: 2000,
  });
  
  // Fetch playback state to check if playing
  const { data: playbackState } = useQuery({
    queryKey: ['playback-state', collection.slug, userSlug],
    queryFn: async () => {
      const response = await playbackApi.getState(collection.slug, userSlug);
      return response.data;
    },
    refetchInterval: 1000,
  });
  
  // Auto-start playback when tracks are added to an empty queue (skip if user just clicked Stop)
  useEffect(() => {
    const inJustStoppedWindow = lastStoppedAt != null && Date.now() - lastStoppedAt < JUST_STOPPED_MS;
    const autoStartPlayback = async () => {
      if (inJustStoppedWindow) return;
      if (queue && queue.length > 0 && playbackState && !playbackState.is_playing && !playbackState.current_track_id) {
        console.log('Auto-starting playback...');
        try {
          await playbackApi.play(collection.slug, userSlug);
          queryClient.invalidateQueries({ queryKey: ['playback-state', collection.slug, userSlug] });
        } catch (error) {
          console.error('Failed to auto-start playback:', error);
        }
      }
    };
    autoStartPlayback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue?.length, playbackState?.is_playing, playbackState?.current_track_id, collection.slug, userSlug, lastStoppedAt]);
  
  // Always render CardCarousel when we have a collection so the settings modal stays
  // mounted when switching collections (otherwise the loading div would unmount it).
  const albumsToShow = Array.isArray(albums) ? albums : [];
  const base = import.meta.env.BASE_URL;
  const wrapperStyle = {
    ['--metal-texture-url' as string]: `url("${base}images/MetalTexture.png")`,
  };

  return (
    <>
      {showScreenWarning && (
        <div
          className={styles['screen-warning-overlay']}
          onClick={dismissScreenWarning}
          role="dialog"
          aria-modal="true"
          aria-labelledby="screen-warning-message"
        >
          <div
            className={styles['screen-warning-modal']}
            onClick={(e) => e.stopPropagation()}
          >
            <p id="screen-warning-message" className={styles['screen-warning-message']}>
              Please note that Divebar Jukebox is optimized for desktop, and horizontal tablet devices.
            </p>
            <div className={styles['screen-warning-actions']}>
              <button
                type="button"
                className={styles['screen-warning-continue']}
                onClick={dismissScreenWarning}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    <div className={styles['jukebox-display-wrapper']} style={wrapperStyle}>
      {!enableLocalLibrary && (
        <SpotifyPlaybackSync
          playbackState={playbackState ?? undefined}
          spotifyToken={spotifyToken}
          lastStoppedAt={lastStoppedAt}
          onTrackEnd={async () => {
            await playbackApi.skip(collection.slug, userSlug);
            queryClient.invalidateQueries({ queryKey: ['playback-state', collection.slug, userSlug] });
            queryClient.invalidateQueries({ queryKey: ['queue', collection.slug, userSlug] });
          }}
        />
      )}
      <div className={styles['jukebox-display']}>
        {isLoading && albumsToShow.length === 0 && (
        <div className={styles['jukebox-loading']}>Loading albums...</div>
      )}
      <div className={styles['jukebox-main']}>
        <div className={styles['jukebox-carousel-row']}>
          <div className={styles['jukebox-carousel-wrap']}>
            <div className={styles['jukebox-carousel-inner']}>
              <CardCarousel 
                albums={albumsToShow} 
                collection={effectiveCollection}
                collections={collections}
                onCollectionChange={onCollectionChange}
                userSlug={userSlug}
                enableLocalLibrary={enableLocalLibrary}
                onStopped={() => setLastStoppedAt(Date.now())}
                isEmpty={!isLoading && albumsToShow.length === 0}
              />
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
    </>
  );
}
