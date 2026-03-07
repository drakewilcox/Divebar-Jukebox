import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { MdPlayArrow, MdStop, MdVisibility, MdVisibilityOff, MdArchive, MdUnarchive, MdStar, MdStarBorder, MdCircle, MdEdit } from 'react-icons/md';
import { adminApi, configApi, getMediaUrl, playbackApi } from '../../services/api';
import { audioService } from '../../services/audio';
import { spotifyPlayTrack, spotifyPause, spotifySeek, getSpotifyPlayer } from '../../services/spotifyPlayer';
import styles from './AlbumEditModal.module.css'
import clsx from 'clsx';

interface Props {
  albumId: string;
  onClose: () => void;
}

export default function AlbumEditModal({ albumId, onClose }: Props) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [year, setYear] = useState<number | ''>('');
  const [variousArtists, setVariousArtists] = useState(false);
  const [description, setDescription] = useState('');
  const [tracks, setTracks] = useState<any[]>([]);
  const [selectedCollections, setSelectedCollections] = useState<Set<string>>(new Set());
  
  // Preview playback state
  const [previewTrackId, setPreviewTrackId] = useState<string | null>(null);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const progressIntervalRef = useRef<number | null>(null);
  const initialLoadDoneRef = useRef(false);

  const [showCoverEditModal, setShowCoverEditModal] = useState(false);
  const coverFileInputRef = useRef<HTMLInputElement | null>(null);

  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: async () => {
      const res = await configApi.getConfig();
      return res.data;
    },
  });
  const enableLocalLibrary = config?.enable_local_library ?? (import.meta.env.VITE_ENABLE_LOCAL_FILES === 'false' ? false : true);

  const { data: albumData, isLoading } = useQuery({
    queryKey: ['album-details', albumId],
    queryFn: async () => {
      const response = await adminApi.getAlbumDetails(albumId);
      return response.data;
    },
  });

  const { data: collections } = useQuery({
    queryKey: ['admin-collections'],
    queryFn: async () => {
      const response = await adminApi.listCollections();
      return response.data;
    },
  });

  // Sync from server: full sync on first load only; on refetch (e.g. after track update) only sync tracks/collections so title/artist/year edits aren't lost
  useEffect(() => {
    if (!albumData) return;
    if (!initialLoadDoneRef.current) {
      setTitle(albumData.title);
      setArtist(albumData.artist);
      setYear(albumData.year || '');
      setVariousArtists(!!(albumData as { various_artists?: boolean }).various_artists);
      setDescription((albumData as { description?: string | null }).description ?? '');
      setTracks(albumData.tracks);
      setSelectedCollections(new Set(albumData.collection_ids));
      initialLoadDoneRef.current = true;
    } else {
      setTracks(albumData.tracks);
      setSelectedCollections(new Set(albumData.collection_ids));
    }
  }, [albumData]);

  useEffect(() => {
    initialLoadDoneRef.current = false;
  }, [albumId]);

  // Lock body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Cleanup preview audio on unmount or when modal closes
  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };
  }, []);

  // Poll Spotify player for progress when preview is playing via Spotify
  const previewTrack = previewTrackId ? tracks.find((t) => t.id === previewTrackId) : null;
  const previewViaSpotify = !enableLocalLibrary && previewTrack?.spotify_id;
  useEffect(() => {
    if (!previewViaSpotify || !previewTrackId) return;
    const player = getSpotifyPlayer();
    const interval = window.setInterval(async () => {
      const state = await player?.getCurrentState();
      if (!state) return;
      const uri = state.track_window?.current_track?.uri ?? '';
      const expectedUri = previewTrack ? `spotify:track:${previewTrack.spotify_id}` : '';
      if (uri === expectedUri && state.duration > 0) {
        setPreviewProgress((state.position / state.duration) * 100);
        setPreviewDuration(state.duration / 1000);
      }
    }, 200);
    return () => clearInterval(interval);
  }, [previewViaSpotify, previewTrackId, previewTrack?.spotify_id]);

  const updateAlbumMutation = useMutation({
    mutationFn: () =>
      adminApi.updateAlbum(albumId, {
        title,
        artist,
        year: year || undefined,
        various_artists: variousArtists,
        description: variousArtists ? (description || null) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-albums'] });
      // Invalidate all album-details queries for this album (across all collections)
      queryClient.invalidateQueries({ 
        predicate: (query) => 
          query.queryKey[0] === 'album-details' && query.queryKey[1] === albumId
      });
      queryClient.invalidateQueries({ queryKey: ['collection-albums'] });
    },
  });

  const updateTrackMutation = useMutation({
    mutationFn: ({ trackId, data }: { trackId: string; data: any }) =>
      adminApi.updateTrack(trackId, data),
    onSuccess: () => {
      // Invalidate all album-details queries for this album (across all collections)
      queryClient.invalidateQueries({ 
        predicate: (query) => 
          query.queryKey[0] === 'album-details' && query.queryKey[1] === albumId
      });
      queryClient.invalidateQueries({ queryKey: ['collection-albums'] });
    },
  });

  const addOrRemoveCollectionMutation = useMutation({
    mutationFn: ({ slug, action }: { slug: string; action: 'add' | 'remove' }) =>
      adminApi.updateCollectionAlbums(slug, albumId, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection-albums'] });
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'album-details' && query.queryKey[1] === albumId,
      });
    },
  });

  const uploadCoverMutation = useMutation({
    mutationFn: (file: File) => adminApi.uploadAlbumCover(albumId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['album-details', albumId] });
      queryClient.invalidateQueries({ queryKey: ['collection-albums'] });
      queryClient.invalidateQueries({ queryKey: ['admin-albums'] });
      setShowCoverEditModal(false);
    },
  });

  const restoreCoverMutation = useMutation({
    mutationFn: () => adminApi.restoreAlbumCover(albumId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['album-details', albumId] });
      queryClient.invalidateQueries({ queryKey: ['collection-albums'] });
      queryClient.invalidateQueries({ queryKey: ['admin-albums'] });
      setShowCoverEditModal(false);
    },
  });

  const handleTrackTitleChange = (trackId: string, newTitle: string) => {
    setTracks(tracks.map(t => t.id === trackId ? { ...t, title: newTitle } : t));
  };

  const handleTrackArtistChange = (trackId: string, newArtist: string) => {
    setTracks(tracks.map(t => t.id === trackId ? { ...t, artist: newArtist } : t));
  };

  const handleTrackEnabledToggle = (trackId: string, enabled: boolean) => {
    // Update local state immediately for UI feedback
    setTracks(tracks.map(t => t.id === trackId ? { ...t, enabled } : t));
    updateTrackMutation.mutate({ trackId, data: { enabled } });
  };

  const handleTrackFavoriteToggle = (trackId: string, is_favorite: boolean) => {
    // Update local state immediately for UI feedback
    setTracks(tracks.map(t => t.id === trackId ? { ...t, is_favorite } : t));
    updateTrackMutation.mutate({ trackId, data: { is_favorite } });
  };

  const handleTrackRecommendedToggle = (trackId: string, is_recommended: boolean) => {
    // Update local state immediately for UI feedback
    setTracks(tracks.map(t => t.id === trackId ? { ...t, is_recommended } : t));
    updateTrackMutation.mutate({ trackId, data: { is_recommended } });
  };

  const handleTrackArchivedToggle = (trackId: string, archived: boolean) => {
    setTracks(tracks.map(t => t.id === trackId ? { ...t, archived } : t));
    updateTrackMutation.mutate({ trackId, data: { archived } });
  };

  const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      uploadCoverMutation.mutate(file);
    }
    e.target.value = '';
  };

  const handleCoverPaste = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            const file = new File([blob], 'pasted-cover.jpg', { type: blob.type });
            uploadCoverMutation.mutate(file);
            return;
          }
        }
      }
      alert('No image found in clipboard.');
    } catch (err) {
      console.error('Clipboard read failed:', err);
      alert('Could not read clipboard. Ensure clipboard permission is granted.');
    }
  };

  const handleRestoreDefault = () => {
    restoreCoverMutation.mutate();
  };

  const toggleCollection = (collection: { id: string; slug: string }) => {
    const newSet = new Set(selectedCollections);
    const isAdding = !newSet.has(collection.id);
    if (newSet.has(collection.id)) {
      newSet.delete(collection.id);
    } else {
      newSet.add(collection.id);
    }
    setSelectedCollections(newSet);
    addOrRemoveCollectionMutation.mutate({
      slug: collection.slug,
      action: isAdding ? 'add' : 'remove',
    });
  };

  const handlePreviewPlay = async (track: { id: string; spotify_id?: string | null }) => {
    setPreviewError(null);
    const trackId = track.id;
    const useSpotify = !enableLocalLibrary && track.spotify_id;

    // If this track is already playing, stop it
    if (previewTrackId === trackId) {
      if (useSpotify) {
        await spotifyPause();
      } else if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
      setPreviewTrackId(null);
      setPreviewProgress(0);
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      return;
    }

    // Stop any currently playing preview
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    const wasPlayingSpotifyPreview = !!(previewTrackId && !enableLocalLibrary);
    if (wasPlayingSpotifyPreview) {
      await spotifyPause();
    }

    if (useSpotify && track.spotify_id) {
      setPreviewTrackId(trackId);
      setPreviewProgress(0);
      setPreviewDuration((tracks.find((t) => t.id === trackId)?.duration_ms ?? 0) / 1000);
      // Skip transfer when switching from another track — we're already on this device; transfer(play:false) can stop the new track
      const ok = await spotifyPlayTrack(track.spotify_id, { skipTransfer: wasPlayingSpotifyPreview });
      if (!ok) {
        setPreviewTrackId(null);
        setPreviewError('Could not start Spotify playback. Make sure you’re signed in and the Spotify app or player is active, then try again.');
      }
      return;
    }

    // Local: pause queue playback if something is playing
    if (audioService.isPlaying()) {
      audioService.pause();
    }

    // Create new audio element and play using the stream endpoint
    const streamUrl = playbackApi.getStreamUrl(trackId);
    const audio = new Audio(streamUrl);
    previewAudioRef.current = audio;
    setPreviewTrackId(trackId);
    setPreviewProgress(0);

    audio.addEventListener('loadedmetadata', () => {
      setPreviewDuration(audio.duration);
    });

    audio.addEventListener('error', () => {
      setPreviewTrackId(null);
      setPreviewError('Could not load preview. This track may not be available to stream.');
    });

    audio.addEventListener('ended', () => {
      setPreviewTrackId(null);
      setPreviewProgress(0);
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    });

    try {
      await audio.play();
      progressIntervalRef.current = window.setInterval(() => {
        if (audio.currentTime && audio.duration) {
          setPreviewProgress((audio.currentTime / audio.duration) * 100);
        }
      }, 100);
    } catch (error) {
      console.error('Failed to play preview:', error);
      setPreviewTrackId(null);
      setPreviewError('Could not start preview.');
    }
  };

  const handleProgressSeek = async (trackId: string, percent: number) => {
    if (previewTrackId !== trackId) return;
    const track = tracks.find((t) => t.id === trackId);
    if (!enableLocalLibrary && track?.spotify_id) {
      const positionMs = (percent / 100) * (track.duration_ms ?? 0);
      await spotifySeek(positionMs);
      setPreviewProgress(percent);
      return;
    }
    if (previewAudioRef.current) {
      const newTime = (percent / 100) * previewAudioRef.current.duration;
      previewAudioRef.current.currentTime = newTime;
      setPreviewProgress(percent);
    }
  };

  const formatDuration = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatPreviewTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <div className={styles['modal-overlay']}>
        <div className={styles['modal-content']}>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Filter out "All Albums" collection from the list
  const editableCollections = collections?.filter(c => c.slug !== 'all') || [];

  const hasAlbumInfoChanges =
    albumData &&
    (title !== (albumData.title ?? '') ||
      artist !== (albumData.artist ?? '') ||
      (year ?? '') !== (albumData.year ?? '') ||
      variousArtists !== !!((albumData as { various_artists?: boolean }).various_artists) ||
      (variousArtists && description !== ((albumData as { description?: string | null }).description ?? '')));

  const handleAlbumInfoBlur = () => {
    if (hasAlbumInfoChanges && !updateAlbumMutation.isPending) {
      updateAlbumMutation.mutate(undefined, {
        onError: (error) => console.error('Failed to save album:', error),
      });
    }
  };

  return (
    <div className={styles['modal-overlay']} onClick={onClose}>
      <div className={clsx(styles['modal-content'], styles['album-edit-modal'])} onClick={(e) => e.stopPropagation()}>
        <div className={styles['modal-header']}>
          <h2>Edit Album</h2>
          <button className={styles['close-button']} onClick={onClose}>✕</button>
        </div>

        <div className={styles['modal-body']}>
          <div className={styles['edit-section']}>
            <h3>Album Information</h3>
            <div className={styles['album-edit-cover-row']}>
              <div className={styles['album-edit-cover-wrap']}>
                {(() => {
                  const coverPath = (albumData as { cover_art_path?: string | null; custom_cover_art_path?: string | null })?.custom_cover_art_path ||
                    (albumData as { cover_art_path?: string | null })?.cover_art_path;
                  const isPlaylist = !!(albumData as { is_playlist?: boolean }).is_playlist;
                  const spotifyImageUrl = (albumData as { spotify_image_url?: string | null })?.spotify_image_url ?? null;
                  const src = getMediaUrl(coverPath ?? null, isPlaylist) ?? spotifyImageUrl;
                  return src ? (
                    <img src={src} alt={`${title} cover`} className={styles['album-edit-cover-img']} />
                  ) : (
                    <div className={styles['album-edit-cover-placeholder']}>🎵</div>
                  );
                })()}
                {enableLocalLibrary && (
                  <button
                    type="button"
                    className={styles['album-edit-cover-edit-btn']}
                    onClick={() => setShowCoverEditModal(true)}
                    title="Change cover art"
                    aria-label="Change cover art"
                  >
                    <MdEdit size={24} />
                  </button>
                )}
              </div>
              <input
                ref={coverFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className={styles['cover-file-input-hidden']}
                onChange={handleCoverUpload}
                aria-hidden
              />
              <div className={styles['album-edit-form-fields']}>
            <div className={styles['form-group']}>
              <label>Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleAlbumInfoBlur}
                className={styles['form-input']}
              />
            </div>
            <div className={styles['form-row']}>
              <div className={styles['form-group']}>
                <label>Artist</label>
                <input
                  type="text"
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  onBlur={handleAlbumInfoBlur}
                  className={styles['form-input']}
                />
              </div>
              <div className={styles['form-group']}>
                <label>Year</label>
                <input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={year}
                  onChange={(e) => setYear(e.target.value ? parseInt(e.target.value) : '')}
                  onBlur={handleAlbumInfoBlur}
                  className={styles['form-input']}
                />
              </div>
            </div>
            <div className={styles['form-group']}>
              <label className={styles['checkbox-label']}>
                <input
                  type="checkbox"
                  checked={variousArtists}
                  onChange={(e) => {
                    setVariousArtists(e.target.checked);
                  }}
                  onBlur={handleAlbumInfoBlur}
                />
                Various artists (show per-track artist in jukebox and allow editing here)
              </label>
            </div>
            {variousArtists && (
              <div className={styles['form-group']}>
                <label>Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={handleAlbumInfoBlur}
                  className={styles['form-input']}
                  rows={3}
                  placeholder="Optional description for this album or playlist"
                />
              </div>
            )}
              </div>
            </div>
          </div>

          <div className={styles['edit-section']}>
            <h3>Collections</h3>
            <div className={styles['collections-checkboxes']}>
              {editableCollections.map((collection) => (
                <label key={collection.id} className={styles['checkbox-label']}>
                  <input
                    type="checkbox"
                    checked={selectedCollections.has(collection.id)}
                    onChange={() => toggleCollection(collection)}
                    disabled={addOrRemoveCollectionMutation.isPending}
                  />
                  {collection.name}
                </label>
              ))}
            </div>
          </div>

          <div className={styles['edit-section']}>
            <h3>Tracks</h3>
            {previewError && (
              <div className={styles['preview-error']} role="alert">
                {previewError}
              </div>
            )}
            <div className={styles['tracks-list']}>
              {tracks.map((track) => (
                <div key={track.id}>
                  <div className={clsx(styles['track-edit-item'], (!track.enabled || track.archived) && styles['disabled'])}>  
                    <div className={styles['track-edit-number']}>{track.disc_number > 1 ? `${track.disc_number}-` : ''}{track.track_number}</div>
                    <button
                      className={styles['track-preview-button']}
                      onClick={() => handlePreviewPlay(track)}
                      disabled={!enableLocalLibrary && !track.spotify_id}
                      title={
                        !enableLocalLibrary && !track.spotify_id
                          ? 'Preview not available for this track'
                          : previewTrackId === track.id
                            ? 'Stop preview'
                            : 'Play preview'
                      }
                    >
                      {previewTrackId === track.id ? <MdStop size={18} /> : <MdPlayArrow size={18} />}
                    </button>
                    <div className={styles['track-title-artist-wrap']}>
                      <input
                        type="text"
                        value={track.title}
                        onChange={(e) => handleTrackTitleChange(track.id, e.target.value)}
                        onBlur={() => updateTrackMutation.mutate({ trackId: track.id, data: { title: track.title } })}
                        className={styles['track-title-input']}
                      />
                      {variousArtists && (
                        <input
                          type="text"
                          value={track.artist ?? ''}
                          onChange={(e) => handleTrackArtistChange(track.id, e.target.value)}
                          onBlur={() => updateTrackMutation.mutate({ trackId: track.id, data: { artist: track.artist } })}
                          className={styles['track-artist-input']}
                          placeholder="Track artist"
                        />
                      )}
                    </div>
                    <span className={styles['track-edit-duration']} title="Track duration">
                      {formatDuration(track.duration_ms ?? 0)}
                    </span>
                    <button
                      className={clsx(styles['track-icon-button'], track.enabled ? styles['enabled'] : styles['disabled'])}
                      onClick={() => handleTrackEnabledToggle(track.id, !track.enabled)}
                      title={track.enabled ? 'Hide track' : 'Show track'}
                    >
                      {track.enabled ? <MdVisibility size={18} /> : <MdVisibilityOff size={18} />}
                    </button>
                    <button
                      className={clsx(styles['track-icon-button'], track.archived && styles['active'])}
                      onClick={() => handleTrackArchivedToggle(track.id, !track.archived)}
                      title={track.archived ? 'Unarchive (include when adding whole album)' : 'Archive (exclude when adding whole album)'}
                    >
                      {track.archived ? <MdUnarchive size={18} /> : <MdArchive size={18} />}
                    </button>
                    <button
                      className={clsx(styles['track-icon-button'], track.is_favorite && styles['active'])}
                      onClick={() => handleTrackFavoriteToggle(track.id, !track.is_favorite)}
                      title="Favorite"
                    >
                      {track.is_favorite ? <MdStar size={18} /> : <MdStarBorder size={18} />}
                    </button>
                    <button
                      className={clsx(styles['track-icon-button'], track.is_recommended && styles['active'])}
                      onClick={() => handleTrackRecommendedToggle(track.id, !track.is_recommended)}
                      title="Recommended"
                    >
                      <MdCircle size={18} />
                    </button>
                  </div>
                  {previewTrackId === track.id && (
                    <div className={styles['track-preview-progress']}>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={previewProgress}
                        onChange={(e) => handleProgressSeek(track.id, parseFloat(e.target.value))}
                        className={styles['progress-slider']}
                        style={{
                          background: `linear-gradient(to right, var(--primary-color) 0%, var(--primary-color) ${previewProgress}%, #000000 ${previewProgress}%, #000000 100%)`
                        }}
                      />
                      <div className={styles['track-preview-time']}>
                        {formatPreviewTime((previewProgress / 100) * previewDuration)} / {formatPreviewTime(previewDuration)}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {showCoverEditModal && (
          <div className={styles['cover-edit-modal-overlay']} onClick={() => setShowCoverEditModal(false)}>
            <div className={styles['cover-edit-modal']} onClick={(e) => e.stopPropagation()}>
              <div className={styles['cover-edit-modal-header']}>
                <h3>Change cover art</h3>
                <button type="button" className={styles['close-button']} onClick={() => setShowCoverEditModal(false)}>✕</button>
              </div>
              <div className={styles['cover-edit-modal-body']}>
                <button
                  type="button"
                  className={styles['cover-edit-option']}
                  onClick={() => coverFileInputRef.current?.click()}
                  disabled={uploadCoverMutation.isPending}
                >
                  Upload from computer
                </button>
                <button
                  type="button"
                  className={styles['cover-edit-option']}
                  onClick={handleCoverPaste}
                  disabled={uploadCoverMutation.isPending}
                >
                  Paste from clipboard
                </button>
                <button
                  type="button"
                  className={styles['cover-edit-option']}
                  onClick={handleRestoreDefault}
                  disabled={restoreCoverMutation.isPending || !(albumData as { custom_cover_art_path?: string | null })?.custom_cover_art_path}
                  title={!(albumData as { custom_cover_art_path?: string | null })?.custom_cover_art_path ? 'No custom cover to restore' : undefined}
                >
                  Restore default image
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
