import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MdAdminPanelSettings } from 'react-icons/md';
import { Collection } from '../types';
import { settingsApi, queueApi, playbackApi } from '../services/api';
import { audioService } from '../services/audio';
import { useJukeboxStore } from '../stores/jukeboxStore';
import './SettingsModal.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  collections: Collection[];
  currentCollection: Collection;
  onCollectionChange: (collection: Collection) => void;
}

export default function SettingsModal({
  isOpen,
  onClose,
  collections,
  currentCollection,
  onCollectionChange,
}: Props) {
  const queryClient = useQueryClient();
  const [defaultCollectionSlug, setDefaultCollectionSlug] = useState<string>('all');
  const [editMode, setEditMode] = useState<boolean>(false);
  const [collectionSelectOpen, setCollectionSelectOpen] = useState(false);
  const collectionSelectRef = useRef<HTMLDivElement>(null);

  // Load default collection from backend (and sync to local state)
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await settingsApi.get();
      return response.data;
    },
    retry: false,
  });

  useEffect(() => {
    if (!collectionSelectOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (collectionSelectRef.current && !collectionSelectRef.current.contains(e.target as Node)) {
        setCollectionSelectOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [collectionSelectOpen]);

  // Load settings from backend when available; fallback to localStorage on mount
  useEffect(() => {
    const savedEditMode = localStorage.getItem('editMode');
    if (savedEditMode) {
      setEditMode(savedEditMode === 'true');
    }
  }, []);

  useEffect(() => {
    const slug = settings?.default_collection_slug ?? localStorage.getItem('defaultCollection') ?? 'all';
    setDefaultCollectionSlug(slug);
  }, [settings?.default_collection_slug]);

  // Keep localStorage in sync when default changes (fallback if backend unavailable)
  useEffect(() => {
    localStorage.setItem('defaultCollection', defaultCollectionSlug);
  }, [defaultCollectionSlug]);

  useEffect(() => {
    localStorage.setItem('editMode', editMode.toString());
    window.dispatchEvent(new CustomEvent('edit-mode-changed', { detail: editMode }));
  }, [editMode]);

  const handleSetAsDefault = async () => {
    try {
      await settingsApi.update({ default_collection_slug: currentCollection.slug });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setDefaultCollectionSlug(currentCollection.slug);
      localStorage.setItem('defaultCollection', currentCollection.slug);
    } catch {
      // Fallback: still update local state and localStorage
      setDefaultCollectionSlug(currentCollection.slug);
      localStorage.setItem('defaultCollection', currentCollection.slug);
    }
  };

  const handleCollectionSelect = async (collectionSlug: string) => {
    const collection = collections.find(c => c.slug === collectionSlug);
    if (!collection) return;
    // Clear queue and stop playback for the collection we're switching away from
    try {
      audioService.stop();
      await playbackApi.stop(currentCollection.slug);
      await queueApi.clear(currentCollection.slug);
      queryClient.invalidateQueries({ queryKey: ['playback-state', currentCollection.slug] });
      queryClient.invalidateQueries({ queryKey: ['queue', currentCollection.slug] });
    } catch {
      // Still switch collection if clear fails
    }
    onCollectionChange(collection);
  };

  const handleGoToAdmin = () => {
    useJukeboxStore.setState({ isAdminMode: true });
    onClose();
  };

  if (!isOpen) return null;

  const isCurrentDefault = currentCollection.slug === defaultCollectionSlug;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <div className="modal-header-actions">
            <button
              type="button"
              className="modal-header-admin-button"
              onClick={handleGoToAdmin}
              aria-label="Go to Admin panel"
              title="Admin"
            >
              <MdAdminPanelSettings size={24} />
            </button>
            <button className="close-button" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="modal-body">
          <div className="settings-section">
            <h3>Collection</h3>
            <div className="form-group">
              <label>Current Collection</label>
              <div className="form-select-wrap" ref={collectionSelectRef}>
                <button
                  type="button"
                  className="form-select form-select-trigger"
                  onClick={() => setCollectionSelectOpen((open) => !open)}
                  aria-expanded={collectionSelectOpen}
                  aria-haspopup="listbox"
                  aria-label="Current collection"
                >
                  {currentCollection.name}
                </button>
                {collectionSelectOpen && (
                  <ul
                    className="form-select-dropdown"
                    role="listbox"
                    aria-label="Current collection"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    {collections.map((collection) => (
                      <li
                        key={collection.id}
                        role="option"
                        aria-selected={currentCollection.slug === collection.slug}
                        className="form-select-option"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleCollectionSelect(collection.slug);
                          setCollectionSelectOpen(false);
                        }}
                      >
                        {collection.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="form-group">
              <label>Default Collection</label>
              <div className="default-collection-row">
                <span className="default-collection-name">
                  {collections.find(c => c.slug === defaultCollectionSlug)?.name || 'All Albums'}
                </span>
                <button
                  className="set-default-button"
                  onClick={handleSetAsDefault}
                  disabled={isCurrentDefault}
                >
                  {isCurrentDefault ? '✓ Default' : 'Set as Default'}
                </button>
              </div>
              <p className="help-text">
                The default collection will be loaded when you open the jukebox.
              </p>
            </div>
          </div>

          <div className="settings-section">
            <h3>Edit Mode</h3>
            <div className="form-group">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={editMode}
                  onChange={(e) => setEditMode(e.target.checked)}
                  className="toggle-checkbox"
                />
                <span className="toggle-text">
                  {/* {editMode ? 'Edit Mode: ON' : 'Edit Mode: OFF'} */}
                </span>
              </label>
              <p className="help-text">
                When enabled, hover over album covers to quickly edit albums from the jukebox view.
              </p>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="close-modal-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
