import { useState, useRef, useMemo, useEffect, useLayoutEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MdEdit, MdAdd, MdClose, MdDelete } from 'react-icons/md';
import { collectionsApi, adminApi } from '../../services/api';
import { filterAndSortAlbums, type AlbumSortOption } from '../../utils/albumListFilter';
import AlbumEditModal from './AlbumEditModal';
import SlotManagement from './SlotManagement';
import './CollectionManager.css';

type CollectionManagerSubTab = 'selections' | 'slots' | 'sections';

const INFINITE_SCROLL_PAGE_SIZE = 50;

export default function CollectionManager() {
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCollection, setNewCollection] = useState({ name: '', slug: '', description: '' });
  const [selectedCollectionSlug, setSelectedCollectionSlug] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<CollectionManagerSubTab>('selections');
  const [displayLimit, setDisplayLimit] = useState(INFINITE_SCROLL_PAGE_SIZE);
  const [editingAlbumId, setEditingAlbumId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<AlbumSortOption>('artist_asc');
  const listRef = useRef<HTMLDivElement>(null);
  const savedScrollRef = useRef<{ el: HTMLElement; top: number } | null>(null);
  
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

  const filteredSortedAlbums = useMemo(
    () => (albums ? filterAndSortAlbums(albums, searchQuery, sortBy) : []),
    [albums, searchQuery, sortBy]
  );

  useEffect(() => {
    setDisplayLimit(INFINITE_SCROLL_PAGE_SIZE);
  }, [searchQuery, sortBy]);

  /** Find the scrollable ancestor that actually scrolls (has overflow-y scroll/auto and scrollable content) */
  const getScrollParent = (from: HTMLElement): HTMLElement | null => {
    let el: HTMLElement | null = from;
    while (el) {
      const style = getComputedStyle(el);
      const overflowY = style.overflowY;
      if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && el.scrollHeight > el.clientHeight) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  };

  // Restore scroll position after sub-tab change (only matters if admin-content was scrolled).
  useLayoutEffect(() => {
    const saved = savedScrollRef.current;
    savedScrollRef.current = null;
    if (!saved || !saved.el.isConnected) return;
    const maxScroll = saved.el.scrollHeight - saved.el.clientHeight;
    saved.el.scrollTop = Math.min(saved.top, Math.max(0, maxScroll));
  }, [subTab]);

  const handleSubTabChange = (tab: CollectionManagerSubTab) => (e: React.MouseEvent<HTMLButtonElement>) => {
    const scrollEl = getScrollParent(e.currentTarget);
    if (scrollEl) {
      savedScrollRef.current = { el: scrollEl, top: scrollEl.scrollTop };
    }
    setSubTab(tab);
    (e.currentTarget as HTMLButtonElement).blur();
  };

  // Infinite scroll: load more when user scrolls near the bottom of the list
  const handleAlbumsListScroll = () => {
    const list = listRef.current;
    const total = filteredSortedAlbums.length;
    if (!list || total === 0 || displayLimit >= total) return;
    const { scrollTop, clientHeight, scrollHeight } = list;
    const threshold = 150;
    if (scrollTop + clientHeight >= scrollHeight - threshold) {
      setDisplayLimit((prev) => Math.min(prev + INFINITE_SCROLL_PAGE_SIZE, total));
    }
  };

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
      
      <div className="manager-section manager-section-tabs">
        {/* <h2>Manage Collection</h2>
        <p>Click a collection above, then use the tabs below to manage its selections, slot order, or sections.</p> */}

        {collections && collections.length > 0 ? (
          <>
            <div className="collection-manager-sub-tabs">
              <button
                type="button"
                className={`collection-manager-sub-tab ${subTab === 'selections' ? 'collection-manager-sub-tab-active' : ''}`}
                onClick={handleSubTabChange('selections')}
              >
                Selections
              </button>
              <button
                type="button"
                className={`collection-manager-sub-tab ${subTab === 'slots' ? 'collection-manager-sub-tab-active' : ''}`}
                onClick={handleSubTabChange('slots')}
              >
                Slots
              </button>
              <button
                type="button"
                className={`collection-manager-sub-tab ${subTab === 'sections' ? 'collection-manager-sub-tab-active' : ''}`}
                onClick={handleSubTabChange('sections')}
              >
                Sections
              </button>
            </div>

            <div className="collection-manager-tab-content">
            {!selectedCollectionSlug ? (
              <p className="collection-manager-select-hint">Select a collection above to manage its {subTab}.</p>
            ) : subTab === 'selections' && albums && albums.length > 0 ? (
              <>
                <div className="albums-list-toolbar">
                  <input
                    type="search"
                    placeholder="Search by album or artist…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="albums-list-search"
                    aria-label="Search albums by title or artist"
                  />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as AlbumSortOption)}
                    className="albums-list-sort"
                    aria-label="Sort albums"
                  >
                    <option value="artist_asc">Artist A–Z</option>
                    <option value="artist_desc">Artist Z–A</option>
                    <option value="title_asc">Title A–Z</option>
                    <option value="title_desc">Title Z–A</option>
                    <option value="date_added_asc">Date added (oldest first)</option>
                    <option value="date_added_desc">Date added (newest first)</option>
                    <option value="year_asc">Year (ascending)</option>
                    <option value="year_desc">Year (descending)</option>
                  </select>
                </div>
                <div
                  ref={listRef}
                  className="albums-list"
                  onScroll={handleAlbumsListScroll}
                >
                  {filteredSortedAlbums.length === 0 ? (
                    <p className="albums-list-empty">No albums match your search.</p>
                  ) : (
                    filteredSortedAlbums.slice(0, displayLimit).map((album: any) => {
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
                    })
                  )}
                </div>
              </>
            ) : subTab === 'slots' ? (
              <div className="collection-manager-tab-pane">
                <SlotManagement collectionSlug={selectedCollectionSlug} />
              </div>
            ) : subTab === 'sections' ? (
              <div className="collection-manager-tab-pane">
                <p className="collection-manager-sections-placeholder">Sections content coming soon.</p>
              </div>
            ) : subTab === 'selections' ? (
              <p className="albums-list-empty">No albums in library. Scan your library first.</p>
            ) : null}
            </div>
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
