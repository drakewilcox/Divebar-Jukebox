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
  const [sortOrder, setSortOrder] = useState<'alphabetical' | 'curated'>('curated');
  const [showJumpToBar, setShowJumpToBar] = useState<boolean>(true);
  const [jumpButtonType, setJumpButtonType] = useState<'letter-ranges' | 'number-ranges' | 'sections'>('number-ranges');
  const [showColorCoding, setShowColorCoding] = useState<boolean>(true);
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

  // Sync nav settings when currentCollection changes (collection defaults or localStorage)
  // This runs on mount and when user switches collection in the modal
  useEffect(() => {
    const c = currentCollection;
    const sortOrder =
      c.default_sort_order === 'alphabetical' || c.default_sort_order === 'curated'
        ? c.default_sort_order
        : (() => {
            const s = localStorage.getItem('sortOrder');
            return s === 'alphabetical' || s === 'curated' ? s : 'curated';
          })();
    const showJumpToBar =
      c.default_show_jump_to_bar != null
        ? c.default_show_jump_to_bar
        : (() => {
            const s = localStorage.getItem('showJumpToBar');
            return s != null ? s === 'true' : true;
          })();
    const jumpButtonType =
      c.default_jump_button_type === 'letter-ranges' ||
      c.default_jump_button_type === 'number-ranges' ||
      c.default_jump_button_type === 'sections'
        ? c.default_jump_button_type
        : (() => {
            const j = localStorage.getItem('jumpButtonType');
            const leg = localStorage.getItem('navBarMode');
            return j === 'letter-ranges' || j === 'number-ranges' || j === 'sections'
              ? j
              : leg === 'sections'
                ? 'sections'
                : 'number-ranges';
          })();
    const showColorCoding =
      c.default_show_color_coding != null
        ? c.default_show_color_coding
        : (() => {
            const s = localStorage.getItem('showColorCoding');
            return s != null ? s === 'true' : true;
          })();
    setSortOrder(sortOrder);
    setShowJumpToBar(showJumpToBar);
    setJumpButtonType(jumpButtonType);
    setShowColorCoding(showColorCoding);
  }, [currentCollection.id, currentCollection.default_sort_order, currentCollection.default_show_jump_to_bar, currentCollection.default_jump_button_type, currentCollection.default_show_color_coding]);

  useEffect(() => {
    const slug = settings?.default_collection_slug ?? localStorage.getItem('defaultCollection') ?? 'all';
    setDefaultCollectionSlug(slug);
  }, [settings?.default_collection_slug]);

  // Keep localStorage in sync when default changes (fallback if backend unavailable)
  useEffect(() => {
    localStorage.setItem('defaultCollection', defaultCollectionSlug);
  }, [defaultCollectionSlug]);

  const sectionsEnabledForCollection =
    currentCollection.sections_enabled &&
    Array.isArray(currentCollection.sections) &&
    currentCollection.sections.length > 0;

  useEffect(() => {
    if (sortOrder === 'alphabetical' && jumpButtonType === 'sections') {
      setJumpButtonType('number-ranges');
    }
  }, [sortOrder]);

  useEffect(() => {
    if (sortOrder === 'curated' && !sectionsEnabledForCollection && jumpButtonType === 'sections') {
      setJumpButtonType('number-ranges');
    }
  }, [sortOrder, sectionsEnabledForCollection, jumpButtonType]);

  useEffect(() => {
    localStorage.setItem('sortOrder', sortOrder);
    localStorage.setItem('showJumpToBar', String(showJumpToBar));
    localStorage.setItem('jumpButtonType', jumpButtonType);
    localStorage.setItem('showColorCoding', String(showColorCoding));
    window.dispatchEvent(
      new CustomEvent('navigation-settings-changed', {
        detail: { sortOrder, showJumpToBar, jumpButtonType, showColorCoding },
      })
    );
  }, [sortOrder, showJumpToBar, jumpButtonType, showColorCoding]);

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
            <h3>Sort Order</h3>
            <div className="form-group">
              <div className="radio-group" role="radiogroup" aria-label="Sort order">
                <label className="radio-option">
                  <input
                    type="radio"
                    name="sortOrder"
                    value="alphabetical"
                    checked={sortOrder === 'alphabetical'}
                    onChange={() => setSortOrder('alphabetical')}
                  />
                  <span>Alphabetical</span>
                </label>
                <label className="radio-option">
                  <input
                    type="radio"
                    name="sortOrder"
                    value="curated"
                    checked={sortOrder === 'curated'}
                    onChange={() => setSortOrder('curated')}
                  />
                  <span>Curated</span>
                </label>
              </div>
              <p className="help-text">
                Curated uses the collection&apos;s custom order. Alphabetical sorts by artist name.
              </p>
            </div>
          </div>

          <div className="settings-section">
            <h3>Jump-To Buttons</h3>
            <div className="form-group">
              <label className="toggle-label">
                <div className="toggle-label-content">
                  <input
                    type="checkbox"
                    checked={showJumpToBar}
                    onChange={(e) => setShowJumpToBar(e.target.checked)}
                    className="toggle-checkbox"
                  />
                  <span className="toggle-text">{showJumpToBar ? 'Show' : 'Hide'}</span>
                </div>
              </label>
              <p className="help-text">
                When enabled, a bar above the carousel lets you jump to ranges or sections.
              </p>
            </div>

            {showJumpToBar && (
              <div className="form-group">
                <label className="radio-group-label jump-type"><h3>Jump button type</h3></label>
                <div className="radio-group" role="radiogroup" aria-label="Jump button type">
                  {sortOrder === 'alphabetical' && (
                    <>
                      <label className="radio-option">
                        <input
                          type="radio"
                          name="jumpButtonType"
                          value="letter-ranges"
                          checked={jumpButtonType === 'letter-ranges'}
                          onChange={() => setJumpButtonType('letter-ranges')}
                        />
                        <span>Letter ranges</span>
                      </label>
                      <label className="radio-option">
                        <input
                          type="radio"
                          name="jumpButtonType"
                          value="number-ranges"
                          checked={jumpButtonType === 'number-ranges'}
                          onChange={() => setJumpButtonType('number-ranges')}
                        />
                        <span>Number ranges</span>
                      </label>
                    </>
                  )}
                  {sortOrder === 'curated' && (
                    <>
                      <label className="radio-option">
                        <input
                          type="radio"
                          name="jumpButtonType"
                          value="number-ranges"
                          checked={jumpButtonType === 'number-ranges'}
                          onChange={() => setJumpButtonType('number-ranges')}
                        />
                        <span>Number ranges</span>
                      </label>
                      {sectionsEnabledForCollection && (
                          <label className="radio-option">
                            <input
                              type="radio"
                              name="jumpButtonType"
                              value="sections"
                              checked={jumpButtonType === 'sections'}
                              onChange={() => setJumpButtonType('sections')}
                            />
                            <span>Sections</span>
                          </label>
                        )}
                    </>
                  )}
                </div>
                <p className="help-text">
                  {sortOrder === 'curated' && sectionsEnabledForCollection
                    ? 'Sections shows one button per collection section and jumps to the start of each section.'
                    : 'Number ranges split the list into 8 ranges (e.g. 1–10, 11–20).'}
                </p>
              </div>
            )}

            {showJumpToBar &&
              sortOrder === 'curated' &&
              sectionsEnabledForCollection &&
              jumpButtonType === 'sections' && (
                <>
                  <h3>Color Coding</h3>
                  <div className="form-group">
                    <label className="toggle-label">
                      <div className="toggle-label-content">
                        <input
                          type="checkbox"
                          checked={showColorCoding}
                          onChange={(e) => setShowColorCoding(e.target.checked)}
                          className="toggle-checkbox"
                        />
                        <span className="toggle-text">{showColorCoding ? 'Show' : 'Hide'}</span>
                      </div>
                    </label>
                    <p className="help-text">
                      When enabled, section buttons and album cards use each section&apos;s color.
                    </p>
                  </div>
                </>
              )}
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
