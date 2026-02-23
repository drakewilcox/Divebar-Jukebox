import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MdAdminPanelSettings } from 'react-icons/md';
import { Collection } from '../types';
import type { HitButtonMode } from '../types';
import { settingsApi, queueApi, playbackApi } from '../services/api';
import { audioService } from '../services/audio';
import { useJukeboxStore } from '../stores/jukeboxStore';
import styles from './SettingsModal.module.css';
import clsx from 'clsx';
import JukeboxSettingsPanel from './JukeboxSettingsPanel';

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
  const [crossfadeSeconds, setCrossfadeSeconds] = useState<number>(0);
  const [hitButtonMode, setHitButtonMode] = useState<HitButtonMode>('favorites');
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
    const crossfade =
      c.default_crossfade_seconds != null && c.default_crossfade_seconds >= 0 && c.default_crossfade_seconds <= 12
        ? c.default_crossfade_seconds
        : (() => {
            const x = localStorage.getItem('crossfadeSeconds');
            const n = x != null ? parseInt(x, 10) : NaN;
            return Number.isNaN(n) || n < 0 || n > 12 ? 0 : n;
          })();
    const hbm = c.default_hit_button_mode;
    const hitButtonMode: HitButtonMode =
      hbm === 'prioritize-section' || hbm === 'favorites' || hbm === 'favorites-and-recommended' || hbm === 'any'
        ? hbm
        : (() => {
            const s = localStorage.getItem('hitButtonMode');
            return s === 'prioritize-section' || s === 'favorites-and-recommended' || s === 'any'
              ? (s as HitButtonMode)
              : 'favorites';
          })();
    setSortOrder(sortOrder);
    setShowJumpToBar(showJumpToBar);
    setJumpButtonType(jumpButtonType);
    setShowColorCoding(showColorCoding);
    setCrossfadeSeconds(crossfade);
    setHitButtonMode(hitButtonMode);
  }, [currentCollection.id, currentCollection.default_sort_order, currentCollection.default_show_jump_to_bar, currentCollection.default_jump_button_type, currentCollection.default_show_color_coding, currentCollection.default_crossfade_seconds, currentCollection.default_hit_button_mode]);

  useEffect(() => {
    const slug = settings?.default_collection_slug ?? localStorage.getItem('defaultCollection') ?? 'all';
    setDefaultCollectionSlug(slug);
  }, [settings?.default_collection_slug]);

  // Keep localStorage in sync when default changes (fallback if backend unavailable)
  useEffect(() => {
    localStorage.setItem('defaultCollection', defaultCollectionSlug);
  }, [defaultCollectionSlug]);

  const sectionsEnabledForCollection =
    !!currentCollection.sections_enabled &&
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

  // Reset "Prioritize Current Section" when sections mode is no longer active
  useEffect(() => {
    if (
      hitButtonMode === 'prioritize-section' &&
      !(jumpButtonType === 'sections' && sectionsEnabledForCollection)
    ) {
      setHitButtonMode('favorites');
    }
  }, [jumpButtonType, sectionsEnabledForCollection, hitButtonMode]);

  useEffect(() => {
    localStorage.setItem('sortOrder', sortOrder);
    localStorage.setItem('showJumpToBar', String(showJumpToBar));
    localStorage.setItem('jumpButtonType', jumpButtonType);
    localStorage.setItem('showColorCoding', String(showColorCoding));
    localStorage.setItem('crossfadeSeconds', String(crossfadeSeconds));
    localStorage.setItem('hitButtonMode', hitButtonMode);
    window.dispatchEvent(
      new CustomEvent('navigation-settings-changed', {
        detail: { sortOrder, showJumpToBar, jumpButtonType, showColorCoding, hitButtonMode },
      })
    );
    window.dispatchEvent(new CustomEvent('crossfade-changed', { detail: crossfadeSeconds }));
  }, [sortOrder, showJumpToBar, jumpButtonType, showColorCoding, crossfadeSeconds, hitButtonMode]);

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
    <div className={styles['modal-overlay']} onClick={onClose}>
      <div className={clsx(styles['modal-content'], styles['settings-modal'])} onClick={(e) => e.stopPropagation()}>
        <div className={styles['modal-header']}>
          <h2>Settings</h2>
          <div className={styles['modal-header-actions']}>
            <button
              type="button"
              className={styles['modal-header-admin-button']}
              onClick={handleGoToAdmin}
              aria-label="Go to Admin panel"
              title="Admin"
            >
              <MdAdminPanelSettings size={24} />
            </button>
            <button className={styles['close-button']} onClick={onClose}>✕</button>
          </div>
        </div>

        <div className={styles['modal-body']}>
          <div className={styles['settings-section']}>
            <h3>Collection</h3>
            <div className={clsx(styles['form-group'], styles['collection-row'])}>
              <div className={styles['form-select-wrap']} ref={collectionSelectRef}>
                <button
                  type="button"
                  className={clsx(styles['form-select'], styles['form-select-trigger'])}
                  onClick={() => setCollectionSelectOpen((open) => !open)}
                  aria-expanded={collectionSelectOpen}
                  aria-haspopup="listbox"
                  aria-label="Current collection"
                >
                  {currentCollection.slug === defaultCollectionSlug
                    ? `${currentCollection.name} (Default)`
                    : currentCollection.name}
                </button>
                {collectionSelectOpen && (
                  <ul
                    className={styles['form-select-dropdown']}
                    role="listbox"
                    aria-label="Current collection"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    {collections.map((collection) => (
                      <li
                        key={collection.id}
                        role="option"
                        aria-selected={currentCollection.slug === collection.slug}
                        className={styles['form-select-option']}
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
                        {collection.slug === defaultCollectionSlug
                          ? `${collection.name} (Default)`
                          : collection.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                type="button"
                className={styles['set-default-button']}
                onClick={handleSetAsDefault}
                disabled={isCurrentDefault}
              >
                Set as Default
              </button>
            </div>
          </div>

          <JukeboxSettingsPanel
            sortOrder={sortOrder}
            onSortOrderChange={setSortOrder}
            showJumpToBar={showJumpToBar}
            onShowJumpToBarChange={setShowJumpToBar}
            jumpButtonType={jumpButtonType}
            onJumpButtonTypeChange={setJumpButtonType}
            showColorCoding={showColorCoding}
            onShowColorCodingChange={setShowColorCoding}
            crossfadeSeconds={crossfadeSeconds}
            onCrossfadeSecondsChange={setCrossfadeSeconds}
            hitButtonMode={hitButtonMode}
            onHitButtonModeChange={setHitButtonMode}
            sectionsEnabledForCollection={sectionsEnabledForCollection}
            namePrefix="settings-"
          />
        </div>

        <div className={styles['modal-footer']}>
          <button className={styles['close-modal-button']} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
