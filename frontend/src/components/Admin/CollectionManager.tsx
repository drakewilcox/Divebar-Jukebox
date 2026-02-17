import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MdEdit, MdAdd, MdClose, MdDelete } from 'react-icons/md';
import { collectionsApi, adminApi } from '../../services/api';
import AlbumEditModal from './AlbumEditModal';
import './CollectionManager.css';

const INFINITE_SCROLL_PAGE_SIZE = 50;

export default function CollectionManager() {
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCollection, setNewCollection] = useState({ name: '', slug: '', description: '' });
  const [selectedCollectionSlug, setSelectedCollectionSlug] = useState<string | null>(null);
  const [displayLimit, setDisplayLimit] = useState(INFINITE_SCROLL_PAGE_SIZE);
  const [editingAlbumId, setEditingAlbumId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  
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

  // Infinite scroll: when sentinel is visible, load more albums
  useEffect(() => {
    const list = listRef.current;
    const sentinel = sentinelRef.current;
    const total = albums?.length ?? 0;
    if (!list || !sentinel || total === 0 || displayLimit >= total) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        setDisplayLimit((prev) => Math.min(prev + INFINITE_SCROLL_PAGE_SIZE, total));
      },
      { root: list, rootMargin: '80px', threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [displayLimit, albums?.length]);

  return (
    <div className="collection-manager">
      <div className="manager-section">
        <div className="section-header">
          <h2>Collections</h2>
          <span className="admin-tooltip-wrap" data-tooltip={showCreateForm ? 'Cancel' : 'Create Collection'}>
            <button
              className="create-button create-button-icon"
              onClick={() => setShowCreateForm(!showCreateForm)}
              aria-label={showCreateForm ? 'Cancel' : 'Create Collection'}
            >
              {showCreateForm ? <MdClose size={22} /> : <MdAdd size={22} />}
            </button>
          </span>
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
              <div
                key={collection.id}
                className={`collection-card ${selectedCollectionSlug === collection.slug ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedCollectionSlug(collection.slug);
                  setDisplayLimit(INFINITE_SCROLL_PAGE_SIZE);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedCollectionSlug(collection.slug);
                    setDisplayLimit(INFINITE_SCROLL_PAGE_SIZE);
                  }
                }}
                aria-label={`Select ${collection.name} to manage albums`}
              >
                <div className="collection-header">
                  <h3>{collection.name}</h3>
                  <div className="collection-actions">
                    <span className="admin-tooltip-wrap" data-tooltip="Delete collection">
                      <button
                        type="button"
                        className="collection-delete-icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete collection "${collection.name}"?`)) {
                            deleteMutation.mutate(collection.id);
                          }
                        }}
                        disabled={deleteMutation.isPending}
                        aria-label="Delete collection"
                      >
                        <MdDelete size={22} />
                      </button>
                    </span>
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
        <p>Click a collection above to manage its albums. Check/uncheck albums to add or remove them.</p>
        
        {collections && collections.length > 0 ? (
          <>
            {selectedCollectionSlug && albums && albums.length > 0 && (
              <>
                <div ref={listRef} className="albums-list">
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
                          <span className="admin-tooltip-wrap" data-tooltip="Edit album">
                            <button
                              className="edit-button"
                              onClick={() => setEditingAlbumId(album.id)}
                              aria-label="Edit album"
                            >
                              <MdEdit size={20} />
                            </button>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {displayLimit < albums.length && (
                    <div ref={sentinelRef} className="infinite-scroll-sentinel" aria-hidden="true" />
                  )}
                </div>
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
