import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { MdPlayArrow, MdStop, MdVisibility, MdVisibilityOff, MdStar, MdStarBorder, MdCircle } from 'react-icons/md';
import { adminApi, collectionsApi } from '../../services/api';
import { audioService } from '../../services/audio';
import './AlbumEditModal.css';

interface Props {
  albumId: string;
  onClose: () => void;
}

export default function AlbumEditModal({ albumId, onClose }: Props) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [year, setYear] = useState<number | ''>('');
  const [tracks, setTracks] = useState<any[]>([]);
  const [selectedCollections, setSelectedCollections] = useState<Set<string>>(new Set());
  
  // Preview playback state
  const [previewTrackId, setPreviewTrackId] = useState<string | null>(null);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const progressIntervalRef = useRef<number | null>(null);

  const { data: albumData, isLoading } = useQuery({
    queryKey: ['album-details', albumId],
    queryFn: async () => {
      const response = await adminApi.getAlbumDetails(albumId);
      return response.data;
    },
  });

  const { data: collections } = useQuery({
    queryKey: ['collections'],
    queryFn: async () => {
      const response = await collectionsApi.getAll();
      return response.data;
    },
  });

  useEffect(() => {
    if (albumData) {
      setTitle(albumData.title);
      setArtist(albumData.artist);
      setYear(albumData.year || '');
      setTracks(albumData.tracks);
      setSelectedCollections(new Set(albumData.collection_ids));
    }
  }, [albumData]);

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

  const updateAlbumMutation = useMutation({
    mutationFn: () =>
      adminApi.updateAlbum(albumId, {
        title,
        artist,
        year: year || null,
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

  const updateCollectionsMutation = useMutation({
    mutationFn: async () => {
      // Get current collections
      const currentCollections = new Set(albumData.collection_ids);
      
      // Find added and removed collections
      const added = Array.from(selectedCollections).filter(id => !currentCollections.has(id));
      const removed = Array.from(currentCollections).filter(id => !selectedCollections.has(id));
      
      // Update collection memberships
      const promises = [];
      for (const collectionId of added) {
        const collection = collections?.find(c => c.id === collectionId);
        if (collection) {
          promises.push(
            adminApi.updateCollectionAlbums(collection.slug, albumId, 'add')
          );
        }
      }
      for (const collectionId of removed) {
        const collection = collections?.find(c => c.id === collectionId);
        if (collection) {
          promises.push(
            adminApi.updateCollectionAlbums(collection.slug, albumId, 'remove')
          );
        }
      }
      
      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection-albums'] });
    },
  });

  const handleSave = async () => {
    try {
      await updateAlbumMutation.mutateAsync();
      await updateCollectionsMutation.mutateAsync();
      onClose();
    } catch (error) {
      console.error('Failed to save album:', error);
    }
  };

  const handleTrackTitleChange = (trackId: string, newTitle: string) => {
    setTracks(tracks.map(t => t.id === trackId ? { ...t, title: newTitle } : t));
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

  const toggleCollection = (collectionId: string) => {
    const newSet = new Set(selectedCollections);
    if (newSet.has(collectionId)) {
      newSet.delete(collectionId);
    } else {
      newSet.add(collectionId);
    }
    setSelectedCollections(newSet);
  };

  const handlePreviewPlay = async (trackId: string) => {
    // If this track is already playing, stop it
    if (previewTrackId === trackId && previewAudioRef.current) {
      previewAudioRef.current.pause();
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
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    }

    // Pause queue playback if something is playing
    if (audioService.isPlaying()) {
      audioService.pause();
    }

    // Create new audio element and play using the stream endpoint
    const audio = new Audio(`http://localhost:8000/api/playback/stream/${trackId}`);
    previewAudioRef.current = audio;
    setPreviewTrackId(trackId);
    setPreviewProgress(0);

    audio.addEventListener('loadedmetadata', () => {
      setPreviewDuration(audio.duration);
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
      
      // Update progress every 100ms
      progressIntervalRef.current = window.setInterval(() => {
        if (audio.currentTime && audio.duration) {
          setPreviewProgress((audio.currentTime / audio.duration) * 100);
        }
      }, 100);
    } catch (error) {
      console.error('Failed to play preview:', error);
      setPreviewTrackId(null);
    }
  };

  const handleProgressSeek = (trackId: string, percent: number) => {
    if (previewAudioRef.current && previewTrackId === trackId) {
      const newTime = (percent / 100) * previewAudioRef.current.duration;
      previewAudioRef.current.currentTime = newTime;
      setPreviewProgress(percent);
    }
  };

  if (isLoading) {
    return (
      <div className="modal-overlay">
        <div className="modal-content">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Filter out "All Albums" collection from the list
  const editableCollections = collections?.filter(c => c.slug !== 'all') || [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content album-edit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Edit Album</h2>
          <button className="close-button" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="edit-section">
            <h3>Album Information</h3>
            <div className="form-group">
              <label>Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label>Artist</label>
              <input
                type="text"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label>Year</label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value ? parseInt(e.target.value) : '')}
                className="form-input"
              />
            </div>
          </div>

          <div className="edit-section">
            <h3>Collections</h3>
            <div className="collections-checkboxes">
              {editableCollections.map((collection) => (
                <label key={collection.id} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={selectedCollections.has(collection.id)}
                    onChange={() => toggleCollection(collection.id)}
                  />
                  {collection.name}
                </label>
              ))}
            </div>
          </div>

          <div className="edit-section">
            <h3>Tracks</h3>
            <div className="tracks-list">
              {tracks.map((track) => (
                <div key={track.id}>
                  <div className={`track-edit-item ${!track.enabled ? 'disabled' : ''}`}>
                    <div className="track-edit-number">{track.disc_number > 1 ? `${track.disc_number}-` : ''}{track.track_number}</div>
                    <button
                      className="track-preview-button"
                      onClick={() => handlePreviewPlay(track.id)}
                      title={previewTrackId === track.id ? 'Stop preview' : 'Play preview'}
                    >
                      {previewTrackId === track.id ? <MdStop size={18} /> : <MdPlayArrow size={18} />}
                    </button>
                    <input
                      type="text"
                      value={track.title}
                      onChange={(e) => handleTrackTitleChange(track.id, e.target.value)}
                      onBlur={() => updateTrackMutation.mutate({ trackId: track.id, data: { title: track.title } })}
                      className="track-title-input"
                    />
                    <button
                      className={`track-icon-button ${track.enabled ? 'enabled' : 'disabled'}`}
                      onClick={() => handleTrackEnabledToggle(track.id, !track.enabled)}
                      title={track.enabled ? 'Hide track' : 'Show track'}
                    >
                      {track.enabled ? <MdVisibility size={18} /> : <MdVisibilityOff size={18} />}
                    </button>
                    <button
                      className={`track-icon-button ${track.is_favorite ? 'active' : ''}`}
                      onClick={() => handleTrackFavoriteToggle(track.id, !track.is_favorite)}
                      title="Favorite"
                    >
                      {track.is_favorite ? <MdStar size={18} /> : <MdStarBorder size={18} />}
                    </button>
                    <button
                      className={`track-icon-button ${track.is_recommended ? 'active' : ''}`}
                      onClick={() => handleTrackRecommendedToggle(track.id, !track.is_recommended)}
                      title="Recommended"
                    >
                      <MdCircle size={18} />
                    </button>
                  </div>
                  {previewTrackId === track.id && (
                    <div className="track-preview-progress">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={previewProgress}
                        onChange={(e) => handleProgressSeek(track.id, parseFloat(e.target.value))}
                        className="progress-slider"
                        style={{
                          background: `linear-gradient(to right, var(--lcd-green) 0%, var(--lcd-green) ${previewProgress}%, #000000 ${previewProgress}%, #000000 100%)`
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="cancel-button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="save-button"
            onClick={handleSave}
            disabled={updateAlbumMutation.isPending || updateCollectionsMutation.isPending}
          >
            {updateAlbumMutation.isPending || updateCollectionsMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
