import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MdEdit } from 'react-icons/md';
import { collectionsApi, adminApi } from '../../services/api';
import { filterAndSortAlbums, type AlbumSortOption } from '../../utils/albumListFilter';
import type { Collection } from '../../types';
import CollectionSections from './CollectionSections';
import CollectionSettings from './CollectionSettings';
import SlotManagement from './SlotManagement';
import CollectionEditModal, { type CollectionToEdit } from './CollectionEditModal';
import AlbumEditModal from './AlbumEditModal';
import './CollectionManager.css';

type CollectionManagerSubTab = 'selections' | 'slots' | 'sections' | 'settings';

export default function CollectionManager() {
  const queryClient = useQueryClient();
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [subTab, setSubTab] = useState<CollectionManagerSubTab>('selections');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<AlbumSortOption>('artist_asc');
  const [showOnlyInCollection, setShowOnlyInCollection] = useState(false);
  const [editingCollection, setEditingCollection] = useState<CollectionToEdit | null>(null);
  const [editingAlbumId, setEditingAlbumId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data: collections } = useQuery({
    queryKey: ['collections'],
    queryFn: async () => {
      const response = await collectionsApi.getAll();
      return response.data;
    },
  });

  const editableCollections = useMemo(
    () => (collections ?? []).filter((c: Collection) => c.slug !== 'all'),
    [collections]
  );

  const { data: allAlbums } = useQuery({
    queryKey: ['admin-albums'],
    queryFn: async () => {
      const response = await adminApi.listAllAlbums(10000);
      return response.data;
    },
  });

  const { data: collectionAlbums } = useQuery({
    queryKey: ['collection-albums', selectedCollection?.slug],
    queryFn: async () => {
      if (!selectedCollection) return [];
      const response = await collectionsApi.getAlbums(selectedCollection.slug);
      return response.data;
    },
    enabled: !!selectedCollection,
  });

  const collectionAlbumIds = useMemo(
    () => new Set((collectionAlbums ?? []).map((a: { id: string }) => a.id)),
    [collectionAlbums]
  );

  const addRemoveMutation = useMutation({
    mutationFn: ({ albumId, action }: { albumId: string; action: 'add' | 'remove' }) =>
      adminApi.updateCollectionAlbums(selectedCollection!.slug, albumId, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection-albums', selectedCollection?.slug] });
      queryClient.invalidateQueries({ queryKey: ['admin-albums'] });
    },
  });

  const activeAlbums = useMemo(
    () => (allAlbums ?? []).filter((a: { archived?: boolean }) => !a.archived),
    [allAlbums]
  );

  const filteredForDisplay = useMemo(() => {
    let list = filterAndSortAlbums(activeAlbums, searchQuery, sortBy);
    if (showOnlyInCollection && selectedCollection) {
      list = list.filter((a: { id: string }) => collectionAlbumIds.has(a.id));
    }
    return list;
  }, [activeAlbums, searchQuery, sortBy, showOnlyInCollection, selectedCollection, collectionAlbumIds]);

  const handleToggleCollectionMembership = (albumId: string) => {
    if (!selectedCollection) return;
    const inCollection = collectionAlbumIds.has(albumId);
    addRemoveMutation.mutate({ albumId, action: inCollection ? 'remove' : 'add' });
  };

  useEffect(() => {
    if (editableCollections.length > 0 && !selectedCollection) {
      setSelectedCollection(editableCollections[0]);
    }
  }, [editableCollections, selectedCollection]);

  if (!collections) return <p>Loading collections…</p>;

  return (
    <div className="collection-manager">
      <div className="manager-section">
        <h2>Collections</h2>
        <p>Select a collection to manage its albums, sections, and display settings.</p>

        <div className="collections-list">
          {editableCollections.length === 0 ? (
            <p className="no-collections">No editable collections. The &quot;All Albums&quot; collection cannot be edited.</p>
          ) : (
            editableCollections.map((c: Collection) => (
              <div
                key={c.id}
                className={`collection-card ${selectedCollection?.id === c.id ? 'selected' : ''}`}
                onClick={() => setSelectedCollection(c)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedCollection(c);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="collection-header">
                  <h3>{c.name}</h3>
                  <div className="collection-actions">
                    <button
                      type="button"
                      className="collection-edit-icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingCollection({ id: c.id, name: c.name, slug: c.slug, description: c.description });
                      }}
                      aria-label="Edit collection"
                    >
                      <MdEdit size={20} />
                    </button>
                  </div>
                </div>
                <div className="collection-slug">{c.slug}</div>
                {c.description && <div className="collection-description">{c.description}</div>}
              </div>
            ))
          )}
        </div>
      </div>

      {selectedCollection && (
        <div className="manager-section manager-section-tabs">
          <div className="collection-manager-sub-tabs">
            <button
              type="button"
              className={`collection-manager-sub-tab ${subTab === 'selections' ? 'collection-manager-sub-tab-active' : ''}`}
              onClick={() => setSubTab('selections')}
            >
              Selections
            </button>
            <button
              type="button"
              className={`collection-manager-sub-tab ${subTab === 'slots' ? 'collection-manager-sub-tab-active' : ''}`}
              onClick={() => setSubTab('slots')}
            >
              Slots
            </button>
            <button
              type="button"
              className={`collection-manager-sub-tab ${subTab === 'sections' ? 'collection-manager-sub-tab-active' : ''}`}
              onClick={() => setSubTab('sections')}
            >
              Sections
            </button>
            <button
              type="button"
              className={`collection-manager-sub-tab ${subTab === 'settings' ? 'collection-manager-sub-tab-active' : ''}`}
              onClick={() => setSubTab('settings')}
            >
              Settings
            </button>
          </div>

          <div className={`collection-manager-tab-content ${selectedCollection ? 'collection-manager-tab-content-has-selection' : ''}`}>
            {subTab === 'selections' && (
              <div className="collection-manager-tab-pane">
                <p className="collection-manager-select-hint">
                  Add or remove albums from <strong>{selectedCollection.name}</strong>. Check an album to include it.
                </p>
                <div className="albums-list-toolbar">
                  <input
                    type="search"
                    placeholder="Search by album or artist…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="albums-list-search"
                    aria-label="Search albums"
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
                  <label className="albums-list-only-active">
                    <input
                      type="checkbox"
                      checked={showOnlyInCollection}
                      onChange={(e) => setShowOnlyInCollection(e.target.checked)}
                    />
                    <span>Only show albums in collection</span>
                  </label>
                </div>
                <div ref={listRef} className="albums-list">
                  {filteredForDisplay.length === 0 ? (
                    <p className="albums-list-empty">No albums match.</p>
                  ) : (
                    filteredForDisplay.map((album: { id: string; title: string; artist: string; cover_art_path?: string | null; file_path?: string; total_tracks?: number; year?: number }) => (
                      <div
                        key={album.id}
                        className={`album-item ${collectionAlbumIds.has(album.id) ? '' : 'not-in-collection'}`}
                      >
                        <label className="album-checkbox-wrap">
                          <input
                            type="checkbox"
                            className="album-checkbox"
                            checked={collectionAlbumIds.has(album.id)}
                            onChange={() => handleToggleCollectionMembership(album.id)}
                            disabled={addRemoveMutation.isPending}
                          />
                        </label>
                        {album.cover_art_path && (
                          <div className="album-item-cover">
                            <img src={`/api/media/${album.cover_art_path}`} alt="" />
                          </div>
                        )}
                        <div className="album-item-info">
                          <div className="album-item-title">{album.title}</div>
                          <div className="album-item-artist">{album.artist}</div>
                          {album.file_path && <div className="album-item-path">{album.file_path}</div>}
                        </div>
                        <div className="album-item-stats">
                          {album.total_tracks != null && <span>{album.total_tracks} tracks</span>}
                          {album.year != null && <span>{album.year}</span>}
                        </div>
                        <div className="album-item-actions">
                          <button
                            type="button"
                            className="edit-button"
                            onClick={() => setEditingAlbumId(album.id)}
                            aria-label="Edit album"
                          >
                            <MdEdit size={20} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {subTab === 'slots' && (
              <div className="collection-manager-tab-pane">
                <SlotManagement collectionSlug={selectedCollection.slug} />
              </div>
            )}

            {subTab === 'sections' && (
              <div className="collection-manager-tab-pane">
                <CollectionSections collection={selectedCollection} albums={collectionAlbums ?? []} />
              </div>
            )}

            {subTab === 'settings' && (
              <div className="collection-manager-tab-pane">
                <CollectionSettings
                  collection={
                    collections?.find((c: Collection) => c.id === selectedCollection?.id) ??
                    selectedCollection
                  }
                />
              </div>
            )}
          </div>
        </div>
      )}

      {editingCollection && (
        <CollectionEditModal
          collection={editingCollection}
          onClose={() => {
            setEditingCollection(null);
            queryClient.invalidateQueries({ queryKey: ['collections'] });
            const updated = editableCollections.find((c: Collection) => c.id === editingCollection.id);
            if (updated && selectedCollection?.id === editingCollection.id) {
              setSelectedCollection(updated);
            }
          }}
        />
      )}

      {editingAlbumId && (
        <AlbumEditModal
          albumId={editingAlbumId}
          onClose={() => {
            setEditingAlbumId(null);
            queryClient.invalidateQueries({ queryKey: ['collection-albums', selectedCollection?.slug] });
          }}
        />
      )}
    </div>
  );
}
