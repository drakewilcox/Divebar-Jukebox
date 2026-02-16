import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collectionsApi, adminApi } from '../../services/api';
import AlbumEditModal from './AlbumEditModal';
import './CollectionManager.css';

export default function CollectionManager() {
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCollection, setNewCollection] = useState({ name: '', slug: '', description: '' });
  const [selectedCollectionSlug, setSelectedCollectionSlug] = useState<string | null>(null);
  const [displayLimit, setDisplayLimit] = useState(50);
  const [editingAlbumId, setEditingAlbumId] = useState<string | null>(null);
  
  const { data: collections } = useQuery({
    queryKey: ['collections'],
    queryFn: async () => {
      const response = await collectionsApi.getAll();
      return response.data.filter((c) => c.slug !== 'all'); // Filter out virtual "All" collection
    },
  });
  
  const { data: albums } = useQuery({
    queryKey: ['admin-albums'],
    queryFn: async () => {
      const response = await adminApi.listAllAlbums(10000);
      return response.data;
    },
  });
  
  const { data: collectionAlbums } = useQuery({
    queryKey: ['collection-albums', selectedCollectionSlug],
    queryFn: async () => {
      if (!selectedCollectionSlug) return [];
      const response = await collectionsApi.getAlbums(selectedCollectionSlug);
      return response.data;
    },
    enabled: !!selectedCollectionSlug,
  });
  
  const createMutation = useMutation({
    mutationFn: (data: { name: string; slug: string; description?: string }) =>
      adminApi.createCollection(data.name, data.slug, data.description),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      setShowCreateForm(false);
      setNewCollection({ name: '', slug: '', description: '' });
    },
  });
  
  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteCollection(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
    },
  });
  
  const toggleAlbumMutation = useMutation({
    mutationFn: ({ collectionSlug, albumId, action }: { collectionSlug: string; albumId: string; action: 'add' | 'remove' }) =>
      adminApi.updateCollectionAlbums(collectionSlug, albumId, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection-albums', selectedCollectionSlug] });
    },
  });
  
  const handleCreate = () => {
    if (!newCollection.name || !newCollection.slug) return;
    createMutation.mutate(newCollection);
  };
  
  const generateSlug = (name: string) => {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  };
  
  const isAlbumInCollection = (albumId: string): boolean => {
    return collectionAlbums?.some((a: any) => a.id === albumId) || false;
  };
  
  const handleToggleAlbum = (albumId: string, checked: boolean) => {
    if (!selectedCollectionSlug) return;
    
    toggleAlbumMutation.mutate({
      collectionSlug: selectedCollectionSlug,
      albumId,
      action: checked ? 'add' : 'remove',
    });
  };
  
  return (
    <div className="collection-manager">
      <div className="manager-section">
        <div className="section-header">
          <h2>Collections</h2>
          <button
            className="create-button"
            onClick={() => setShowCreateForm(!showCreateForm)}
          >
            {showCreateForm ? 'Cancel' : '+ Create Collection'}
          </button>
        </div>
        <p>Manage your jukebox collections. Each collection can contain different albums.</p>
        
        {showCreateForm && (
          <div className="create-form">
            <h3>Create New Collection</h3>
            <div className="form-group">
              <label>Collection Name:</label>
              <input
                type="text"
                value={newCollection.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setNewCollection({
                    ...newCollection,
                    name,
                    slug: generateSlug(name),
                  });
                }}
                placeholder="e.g., Dad Rock Jukebox"
              />
            </div>
            <div className="form-group">
              <label>Slug (URL-safe identifier):</label>
              <input
                type="text"
                value={newCollection.slug}
                onChange={(e) => setNewCollection({ ...newCollection, slug: e.target.value })}
                placeholder="e.g., dad-rock"
              />
            </div>
            <div className="form-group">
              <label>Description (optional):</label>
              <input
                type="text"
                value={newCollection.description}
                onChange={(e) => setNewCollection({ ...newCollection, description: e.target.value })}
                placeholder="e.g., Classic rock for dads"
              />
            </div>
            <button
              className="submit-button"
              onClick={handleCreate}
              disabled={!newCollection.name || !newCollection.slug || createMutation.isPending}
            >
              {createMutation.isPending ? 'Creating...' : 'Create Collection'}
            </button>
          </div>
        )}
        
        {collections && collections.length > 0 ? (
          <div className="collections-list">
            {collections.map((collection) => (
              <div key={collection.id} className="collection-card">
                <div className="collection-header">
                  <h3>{collection.name}</h3>
                  <div className="collection-actions">
                    <span className={`collection-status ${collection.is_active ? 'active' : 'inactive'}`}>
                      {collection.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <button
                      className="delete-button"
                      onClick={() => {
                        if (confirm(`Delete collection "${collection.name}"?`)) {
                          deleteMutation.mutate(collection.id);
                        }
                      }}
                      disabled={deleteMutation.isPending}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="collection-slug">Slug: {collection.slug}</div>
                {collection.description && (
                  <div className="collection-description">{collection.description}</div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="no-collections">
            <p>No collections yet. Create your first collection above!</p>
          </div>
        )}
      </div>
      
      <div className="manager-section">
        <h2>Manage Albums in Collection</h2>
        <p>Select a collection to manage its albums. Check/uncheck albums to add or remove them.</p>
        
        {collections && collections.length > 0 ? (
          <>
            <div className="collection-selector-section">
              <label>Select Collection:</label>
              <select
                value={selectedCollectionSlug || ''}
                onChange={(e) => {
                  setSelectedCollectionSlug(e.target.value || null);
                  setDisplayLimit(50); // Reset display limit when changing collection
                }}
                className="collection-select"
              >
                <option value="">-- Select a collection --</option>
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.slug}>
                    {collection.name}
                  </option>
                ))}
              </select>
            </div>
            
            {selectedCollectionSlug && albums && albums.length > 0 && (
              <>
                <div className="albums-list">
                  {albums.slice(0, displayLimit).map((album: any) => {
                    const inCollection = isAlbumInCollection(album.id);
                    return (
                      <div
                        key={album.id}
                        className={`album-item ${!inCollection ? 'not-in-collection' : ''} ${album.archived ? 'archived' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={inCollection}
                          onChange={(e) => handleToggleAlbum(album.id, e.target.checked)}
                          disabled={toggleAlbumMutation.isPending || album.archived}
                          className="album-checkbox"
                        />
                        {album.cover_art_path && (
                          <div className="album-item-cover">
                            <img
                              src={`/api/media/${album.cover_art_path}`}
                              alt={`${album.title} cover`}
                            />
                          </div>
                        )}
                        <div className="album-item-info">
                          <div className="album-item-title">
                            {album.title}
                            {album.archived && <span className="archived-badge">Archived</span>}
                          </div>
                          <div className="album-item-artist">{album.artist}</div>
                          <div className="album-item-path">{album.file_path}</div>
                        </div>
                        <div className="album-item-stats">
                          <span>{album.total_tracks} tracks</span>
                          {album.year && <span>{album.year}</span>}
                        </div>
                        <div className="album-item-actions">
                          <button
                            className="edit-button"
                            onClick={() => setEditingAlbumId(album.id)}
                          >
                            ✏️ Edit
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {displayLimit < albums.length && (
                  <div className="load-more-section">
                    <p className="albums-more">Showing {displayLimit} of {albums.length} albums</p>
                    <button
                      className="load-more-button"
                      onClick={() => setDisplayLimit(prev => Math.min(prev + 50, albums.length))}
                    >
                      Load More (50)
                    </button>
                    <button
                      className="load-all-button"
                      onClick={() => setDisplayLimit(albums.length)}
                    >
                      Load All
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <div className="no-collections">
            <p>Create a collection first to manage albums.</p>
          </div>
        )}
        
        {editingAlbumId && (
          <AlbumEditModal
            albumId={editingAlbumId}
            onClose={() => setEditingAlbumId(null)}
          />
        )}
      </div>
    </div>
  );
}
