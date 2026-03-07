import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MdAdminPanelSettings } from 'react-icons/md';
import { Collection } from '../types';
import type { HitButtonMode } from '../types';
import { settingsApi, queueApi, playbackApi, authApi, collectionsApi } from '../services/api';
import { audioService } from '../services/audio';
import { spotifyPause } from '../services/spotifyPlayer';
import { useAuthStore } from '../stores/authStore';
import styles from './SettingsModal.module.css';
import clsx from 'clsx';
import JukeboxSettingsPanel from './JukeboxSettingsPanel';

type Tab = 'settings' | 'guide' | 'collections' | 'login';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  collections: Collection[];
  currentCollection: Collection;
  onCollectionChange: (collection: Collection) => void;
  userSlug?: string;
  enableLocalLibrary?: boolean;
  initialTab?: Tab;
}

export default function SettingsModal({
  isOpen,
  onClose,
  collections,
  currentCollection,
  onCollectionChange,
  userSlug,
  enableLocalLibrary = true,
  initialTab,
}: Props) {
  const navigate = useNavigate();
  const collectionsList = Array.isArray(collections) ? collections : [];
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuthStore();
  const [activeTab, setActiveTab] = useState<Tab>(initialTab ?? 'settings');

  // Reset tab when modal opens with an initialTab
  useEffect(() => {
    if (isOpen && initialTab) setActiveTab(initialTab);
  }, [isOpen, initialTab]);

  // ── Settings tab state ──────────────────────────────────────────────────────
  const [defaultCollectionSlug, setDefaultCollectionSlug] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'alphabetical' | 'curated'>('curated');
  const [showJumpToBar, setShowJumpToBar] = useState<boolean>(true);
  const [jumpButtonType, setJumpButtonType] = useState<'letter-ranges' | 'number-ranges' | 'sections'>('number-ranges');
  const [showColorCoding, setShowColorCoding] = useState<boolean>(true);
  const [showCardBackground, setShowCardBackground] = useState<boolean>(true);
  const [crossfadeSeconds, setCrossfadeSeconds] = useState<number>(0);
  const [hitButtonMode, setHitButtonMode] = useState<HitButtonMode>('favorites');
  const [normalizeVolume, setNormalizeVolume] = useState<boolean>(() =>
    typeof localStorage !== 'undefined' ? localStorage.getItem('normalizeVolume') !== 'false' : true
  );
  const [lightAndGlassEffect, setLightAndGlassEffect] = useState<boolean>(() =>
    typeof localStorage !== 'undefined' ? localStorage.getItem('lightAndGlassEffect') !== 'false' : true
  );
  const [collectionSelectOpen, setCollectionSelectOpen] = useState(false);
  const collectionSelectRef = useRef<HTMLDivElement>(null);

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await settingsApi.get()).data,
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

  const syncNavSettings = (c: Collection) => {
    const sSort = localStorage.getItem('sortOrder');
    const sortOrder: 'alphabetical' | 'curated' =
      sSort === 'alphabetical' || sSort === 'curated' ? sSort : (c.default_sort_order === 'alphabetical' || c.default_sort_order === 'curated' ? c.default_sort_order : 'curated');
    const sJump = localStorage.getItem('showJumpToBar');
    const showJumpToBar = sJump !== null ? sJump === 'true' : (c.default_show_jump_to_bar != null ? c.default_show_jump_to_bar : true);
    const j = localStorage.getItem('jumpButtonType');
    const leg = localStorage.getItem('navBarMode');
    const jumpButtonType: 'letter-ranges' | 'number-ranges' | 'sections' =
      j === 'letter-ranges' || j === 'number-ranges' || j === 'sections' ? j
      : (c.default_jump_button_type === 'letter-ranges' || c.default_jump_button_type === 'number-ranges' || c.default_jump_button_type === 'sections' ? c.default_jump_button_type
      : leg === 'sections' ? 'sections' : 'number-ranges');
    const fromStorageColor = localStorage.getItem('showColorCoding');
    const showColorCoding = fromStorageColor !== null ? fromStorageColor === 'true' : (c.default_show_color_coding != null ? c.default_show_color_coding : true);
    const fromStorageCardBg = localStorage.getItem('showCardBackground');
    const showCardBackground = fromStorageCardBg !== null ? fromStorageCardBg === 'true' : (c.default_show_card_background != null ? c.default_show_card_background : true);
    const x = localStorage.getItem('crossfadeSeconds');
    const n = x != null ? parseInt(x, 10) : NaN;
    const crossfade = !Number.isNaN(n) && n >= 0 && n <= 12 ? n : (c.default_crossfade_seconds != null && c.default_crossfade_seconds >= 0 && c.default_crossfade_seconds <= 12 ? c.default_crossfade_seconds : 0);
    const shb = localStorage.getItem('hitButtonMode');
    const validHit: HitButtonMode[] = ['prioritize-section', 'favorites', 'favorites-and-recommended', 'any'];
    const hitButtonMode: HitButtonMode = validHit.includes(shb as HitButtonMode) ? (shb as HitButtonMode) : (c.default_hit_button_mode && validHit.includes(c.default_hit_button_mode as HitButtonMode) ? c.default_hit_button_mode : 'favorites');
    setSortOrder(sortOrder);
    setShowJumpToBar(showJumpToBar);
    setJumpButtonType(jumpButtonType);
    setShowColorCoding(showColorCoding);
    setShowCardBackground(showCardBackground);
    setCrossfadeSeconds(crossfade);
    setHitButtonMode(hitButtonMode);
  };

  useEffect(() => { syncNavSettings(currentCollection); }, [currentCollection, currentCollection.id]);
  useEffect(() => { if (isOpen) syncNavSettings(currentCollection); }, [isOpen]);

  useEffect(() => {
    const slug = settings?.default_collection_slug ?? localStorage.getItem('defaultCollection') ?? 'all';
    setDefaultCollectionSlug(slug);
  }, [settings?.default_collection_slug]);

  useEffect(() => { localStorage.setItem('defaultCollection', defaultCollectionSlug); }, [defaultCollectionSlug]);

  const sectionsEnabledForCollection = !!currentCollection.sections_enabled && Array.isArray(currentCollection.sections) && currentCollection.sections.length > 0;

  useEffect(() => { if (sortOrder === 'alphabetical' && jumpButtonType === 'sections') setJumpButtonType('number-ranges'); }, [sortOrder]);
  useEffect(() => { if (sortOrder === 'curated' && !sectionsEnabledForCollection && jumpButtonType === 'sections') setJumpButtonType('number-ranges'); }, [sortOrder, sectionsEnabledForCollection, jumpButtonType]);
  useEffect(() => { if (hitButtonMode === 'prioritize-section' && !(jumpButtonType === 'sections' && sectionsEnabledForCollection)) setHitButtonMode('favorites'); }, [jumpButtonType, sectionsEnabledForCollection, hitButtonMode]);

  useEffect(() => {
    localStorage.setItem('sortOrder', sortOrder);
    localStorage.setItem('showJumpToBar', String(showJumpToBar));
    localStorage.setItem('jumpButtonType', jumpButtonType);
    localStorage.setItem('showColorCoding', String(showColorCoding));
    localStorage.setItem('showCardBackground', String(showCardBackground));
    localStorage.setItem('crossfadeSeconds', String(crossfadeSeconds));
    localStorage.setItem('hitButtonMode', hitButtonMode);
    window.dispatchEvent(new CustomEvent('navigation-settings-changed', { detail: { sortOrder, showJumpToBar, jumpButtonType, showColorCoding, showCardBackground, hitButtonMode } }));
    window.dispatchEvent(new CustomEvent('crossfade-changed', { detail: crossfadeSeconds }));
  }, [sortOrder, showJumpToBar, jumpButtonType, showColorCoding, showCardBackground, crossfadeSeconds, hitButtonMode]);

  useEffect(() => { localStorage.setItem('normalizeVolume', String(normalizeVolume)); window.dispatchEvent(new CustomEvent('normalize-volume-changed')); }, [normalizeVolume]);
  useEffect(() => { localStorage.setItem('lightAndGlassEffect', String(lightAndGlassEffect)); window.dispatchEvent(new CustomEvent('light-and-glass-effect-changed')); }, [lightAndGlassEffect]);

  const handleSetAsDefault = async () => {
    try {
      await settingsApi.update({ default_collection_slug: currentCollection.slug });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    } catch { /* ignore */ }
    setDefaultCollectionSlug(currentCollection.slug);
    localStorage.setItem('defaultCollection', currentCollection.slug);
  };

  const handleCollectionSelect = async (collectionSlug: string) => {
    const collection = collectionsList.find(c => c.slug === collectionSlug);
    if (!collection) return;
    try {
      audioService.stop();
      spotifyPause();
      await playbackApi.stop(currentCollection.slug, userSlug);
      await queueApi.clear(currentCollection.slug, userSlug);
      queryClient.invalidateQueries({ queryKey: ['playback-state', currentCollection.slug, userSlug] });
      queryClient.invalidateQueries({ queryKey: ['queue', currentCollection.slug, userSlug] });
    } catch { /* still switch */ }
    onCollectionChange(collection);
    if (userSlug) navigate(`/${userSlug}/${collection.slug}`, { replace: true });
  };

  const handleAdminButton = () => {
    if (isAuthenticated()) {
      sessionStorage.setItem('adminReturnPath', window.location.pathname + window.location.search);
      onClose();
      navigate('/admin');
    } else {
      setActiveTab('login');
    }
  };

  if (!isOpen) return null;

  const isCurrentDefault = currentCollection.slug === defaultCollectionSlug;
  const TABS: { id: Tab; label: string }[] = [
    { id: 'settings', label: 'Settings' },
    { id: 'guide', label: 'User Guide' },
    { id: 'collections', label: 'Collections' },
    { id: 'login', label: isAuthenticated() ? 'Account' : 'Admin Login' },
  ];

  return (
    <div className={styles['modal-overlay']} onClick={onClose}>
      <div className={clsx(styles['modal-content'], styles['settings-modal'])} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles['modal-header']}>
          <h2>Dive Bar Jukebox</h2>
          <div className={styles['modal-header-actions']}>
            <button
              type="button"
              className={styles['modal-header-admin-button']}
              onClick={handleAdminButton}
              aria-label={isAuthenticated() ? 'Go to Admin panel' : 'Admin Login'}
              title={isAuthenticated() ? 'Admin Panel' : 'Admin Login'}
            >
              <MdAdminPanelSettings size={24} />
            </button>
            <button className={styles['close-button']} onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Tabs */}
        <div className={styles['tab-bar']}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              className={clsx(styles['tab-btn'], activeTab === tab.id && styles['tab-btn-active'])}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className={styles['modal-body']}>
          {activeTab === 'settings' && (
            <>
              {/* Collection */}
              <div className={styles['settings-section']}>
                <div className={styles['settings-row']}>
                  <div className={styles['settings-row-left']}>
                    <h3 className={styles['settings-row-title']}>Collection</h3>
                  </div>
                  <div className={clsx(styles['settings-row-right'], styles['collection-controls'])}>
                    <div className={clsx(styles['form-select-wrap'], styles['narrow'])} ref={collectionSelectRef}>
                      <button
                        type="button"
                        className={clsx(styles['form-select'], styles['form-select-trigger'])}
                        onClick={() => setCollectionSelectOpen(open => !open)}
                        aria-expanded={collectionSelectOpen}
                        aria-haspopup="listbox"
                      >
                        {currentCollection.slug === defaultCollectionSlug ? `${currentCollection.name} (Default)` : currentCollection.name}
                      </button>
                      {collectionSelectOpen && (
                        <ul className={styles['form-select-dropdown']} role="listbox" onMouseDown={(e) => e.stopPropagation()}>
                          {collectionsList.filter(c => c.slug !== 'all').map((collection) => (
                            <li
                              key={collection.id}
                              role="option"
                              aria-selected={currentCollection.slug === collection.slug}
                              className={styles['form-select-option']}
                              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCollectionSelect(collection.slug); setCollectionSelectOpen(false); }}
                            >
                              {collection.slug === defaultCollectionSlug ? `${collection.name} (Default)` : collection.name}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <button type="button" className={styles['set-default-button']} onClick={handleSetAsDefault} disabled={isCurrentDefault}>
                      Set as Default
                    </button>
                  </div>
                </div>
              </div>

              {enableLocalLibrary && (
                <div className={styles['settings-section']}>
                  <div className={styles['settings-row']}>
                    <div className={styles['settings-row-left']}>
                      <h3 className={styles['settings-row-title']}>Normalize Volume</h3>
                      <p className={styles['settings-row-help']}>When on, ReplayGain is applied so tracks play at a consistent loudness</p>
                    </div>
                    <div className={styles['settings-row-right']}>
                      <label className={styles['toggle-row']}>
                        <input type="checkbox" checked={normalizeVolume} onChange={(e) => setNormalizeVolume(e.target.checked)} className={styles['toggle-checkbox']} />
                      </label>
                    </div>
                  </div>
                </div>
              )}

              <div className={styles['settings-section']}>
                <div className={styles['settings-row']}>
                  <div className={styles['settings-row-left']}>
                    <h3 className={styles['settings-row-title']}>Jukebox Lights</h3>
                    <p className={styles['settings-row-help']}>Enable gradient lights and glass effect on the carousel</p>
                  </div>
                  <div className={styles['settings-row-right']}>
                    <label className={styles['toggle-row']}>
                      <input type="checkbox" checked={lightAndGlassEffect} onChange={(e) => setLightAndGlassEffect(e.target.checked)} className={styles['toggle-checkbox']} />
                    </label>
                  </div>
                </div>
              </div>

              <JukeboxSettingsPanel
                sortOrder={sortOrder} onSortOrderChange={setSortOrder}
                showJumpToBar={showJumpToBar} onShowJumpToBarChange={setShowJumpToBar}
                jumpButtonType={jumpButtonType} onJumpButtonTypeChange={setJumpButtonType}
                showColorCoding={showColorCoding} onShowColorCodingChange={setShowColorCoding}
                showCardBackground={showCardBackground} onShowCardBackgroundChange={setShowCardBackground}
                crossfadeSeconds={crossfadeSeconds} onCrossfadeSecondsChange={setCrossfadeSeconds}
                hitButtonMode={hitButtonMode} onHitButtonModeChange={setHitButtonMode}
                sectionsEnabledForCollection={sectionsEnabledForCollection}
                enableLocalLibrary={enableLocalLibrary}
                namePrefix="settings-"
              />
            </>
          )}

          {activeTab === 'guide' && <UserGuideTab />}

          {activeTab === 'collections' && (
            <CollectionsTab userSlug={userSlug} onClose={onClose} />
          )}

          {activeTab === 'login' && (
            <AdminLoginTab
              onSuccess={() => { onClose(); navigate('/admin'); }}
              isAuthenticated={isAuthenticated()}
              onLogout={() => useAuthStore.getState().logout()}
            />
          )}
        </div>

        <div className={styles['modal-footer']}>
          <button className={styles['close-modal-button']} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── User Guide Tab ────────────────────────────────────────────────────────────

function UserGuideTab() {
  return (
    <div className={styles['tab-content-placeholder']}>
      <h3 className={styles['tab-placeholder-title']}>User Guide</h3>
      <p className={styles['tab-placeholder-body']}>Tips and instructions for using the jukebox will appear here.</p>
    </div>
  );
}

// ── Collections Tab ───────────────────────────────────────────────────────────

function CollectionsTab({ userSlug, onClose }: { userSlug?: string; onClose: () => void }) {
  const navigate = useNavigate();
  const { data: allCollectionsRaw, isLoading } = useQuery({
    queryKey: ['all-collections'],
    queryFn: async () => (await collectionsApi.getAll()).data,
  });
  const allCollections = Array.isArray(allCollectionsRaw) ? allCollectionsRaw : [];

  const published = allCollections.filter(c => c.published !== false);
  const fromThisUser = published.filter(c => c.user_slug === userSlug);
  const otherCollections = published.filter(c => c.user_slug !== userSlug);

  const handleView = (c: Collection) => {
    if (c.user_slug) {
      navigate(`/${c.user_slug}/${c.slug}`);
      onClose();
    }
  };

  if (isLoading) return <p className={styles['collections-loading']}>Loading collections…</p>;

  return (
    <div className={styles['collections-tab']}>
      {fromThisUser.length > 0 && (
        <section className={styles['collections-group']}>
          <h3 className={styles['collections-group-title']}>More from @{userSlug}</h3>
          {fromThisUser.map(c => (
            <CollectionRow key={c.id} collection={c} onView={() => handleView(c)} />
          ))}
        </section>
      )}

      {otherCollections.length > 0 && (
        <section className={styles['collections-group']}>
          <h3 className={styles['collections-group-title']}>More Collections</h3>
          {otherCollections.map(c => (
            <CollectionRow key={c.id} collection={c} onView={() => handleView(c)} />
          ))}
        </section>
      )}

      {published.length === 0 && (
        <p className={styles['collections-empty']}>No other collections found.</p>
      )}
    </div>
  );
}

function CollectionRow({ collection, onView }: { collection: Collection; onView: () => void }) {
  return (
    <div className={styles['collection-row']}>
      <div className={styles['collection-row-info']}>
        <span className={styles['collection-row-name']}>{collection.name}</span>
        {collection.description && (
          <span className={styles['collection-row-desc']}>{collection.description}</span>
        )}
        <span className={styles['collection-row-owner']}>@{collection.user_slug}</span>
      </div>
      <button type="button" className={styles['collection-row-view-btn']} onClick={onView}>
        View
      </button>
    </div>
  );
}

// ── Admin Login Tab ───────────────────────────────────────────────────────────

function AdminLoginTab({
  onSuccess,
  isAuthenticated,
  onLogout,
}: {
  onSuccess: () => void;
  isAuthenticated: boolean;
  onLogout: () => void;
}) {
  const { setAuth, user } = useAuthStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) {
    return (
      <div className={styles['login-tab']}>
        <p className={styles['login-logged-in']}>Signed in as <strong>{user?.email}</strong></p>
        <div className={styles['login-actions']}>
          <button type="button" className={styles['login-submit-btn']} onClick={onSuccess}>
            Go to Admin Panel
          </button>
          <button type="button" className={styles['login-secondary-btn']} onClick={onLogout}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      let data;
      if (mode === 'login') {
        const res = await authApi.login(email, password);
        data = res.data;
      } else {
        const res = await authApi.register(email, password, slug || undefined);
        data = res.data;
      }
      setAuth(data.access_token, data.user);
      onSuccess();
    } catch (err: unknown) {
      const detail = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
        : null;
      setError(detail ?? (mode === 'login' ? 'Invalid email or password.' : 'Registration failed.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles['login-tab']}>
      <div className={styles['login-mode-toggle']}>
        <button type="button" className={clsx(styles['login-mode-btn'], mode === 'login' && styles['login-mode-btn-active'])} onClick={() => { setMode('login'); setError(null); }}>
          Sign In
        </button>
        <button type="button" className={clsx(styles['login-mode-btn'], mode === 'register' && styles['login-mode-btn-active'])} onClick={() => { setMode('register'); setError(null); }}>
          Register
        </button>
      </div>

      <form className={styles['login-form']} onSubmit={handleSubmit}>
        <div className={styles['login-field']}>
          <label className={styles['login-label']}>Email</label>
          <input
            type="email"
            className={styles['login-input']}
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div className={styles['login-field']}>
          <label className={styles['login-label']}>Password</label>
          <input
            type="password"
            className={styles['login-input']}
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </div>
        {mode === 'register' && (
          <div className={styles['login-field']}>
            <label className={styles['login-label']}>Username (optional)</label>
            <input
              type="text"
              className={styles['login-input']}
              value={slug}
              onChange={e => setSlug(e.target.value)}
              placeholder="e.g. drakewilcox"
            />
          </div>
        )}
        {error && <p className={styles['login-error']}>{error}</p>}
        <button type="submit" className={styles['login-submit-btn']} disabled={loading}>
          {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
        </button>
      </form>
    </div>
  );
}
