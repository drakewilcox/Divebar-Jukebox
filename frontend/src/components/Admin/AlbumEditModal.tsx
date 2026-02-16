import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { adminApi, collectionsApi } from '../../services/api';
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
    updateTrackMutation.mutate({ trackId, data: { enabled } });
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
                <div key={track.id} className={`track-edit-item ${!track.enabled ? 'disabled' : ''}`}>
                  <div className="track-edit-number">{track.disc_number > 1 ? `${track.disc_number}-` : ''}{track.track_number}</div>
                  <input
                    type="text"
                    value={track.title}
                    onChange={(e) => handleTrackTitleChange(track.id, e.target.value)}
                    onBlur={() => updateTrackMutation.mutate({ trackId: track.id, data: { title: track.title } })}
                    className="track-title-input"
                  />
                  <button
                    className={`track-toggle ${track.enabled ? 'enabled' : 'disabled'}`}
                    onClick={() => handleTrackEnabledToggle(track.id, !track.enabled)}
                  >
                    {track.enabled ? '👁️ Visible' : '👁️‍🗨️ Hidden'}
                  </button>
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
