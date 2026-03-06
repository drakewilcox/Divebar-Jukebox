import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MdMusicNote, MdLink } from 'react-icons/md';
import { adminApi } from '../../services/api';
import styles from './SpotifySync.module.css';
import clsx from 'clsx';

export default function SpotifySync() {
  const queryClient = useQueryClient();
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [addUrl, setAddUrl] = useState('');
  const [addUrlCollectionId, setAddUrlCollectionId] = useState<string>('');
  const [addUrlError, setAddUrlError] = useState<string | null>(null);
  const [addUrlSuccess, setAddUrlSuccess] = useState<string | null>(null);

  const { data: spotifyStatus } = useQuery({
    queryKey: ['admin-spotify-status'],
    queryFn: async () => {
      const res = await adminApi.getSpotifyStatus();
      return res.data;
    },
  });

  const connected = spotifyStatus?.connected ?? false;

  const connectUrl = adminApi.getSpotifyAdminAuthorizeUrl();

  return (
    <div className={styles['spotify-section']}>
      <h2>Spotify</h2>
      <p>Connect your Spotify account to sync saved albums or add albums/playlists by URL.</p>
      <div className={styles['spotify-actions']}>
        {!connected ? (
          <a href={connectUrl} className={styles['connect-button']} rel="noopener noreferrer">
            <MdMusicNote size={20} /> Connect Spotify
          </a>
        ) : (
          <>
            <span className={styles['connected-badge']}>Spotify connected</span>
            <button
              type="button"
              className={styles['sync-button']}
              onClick={() => setSyncModalOpen(true)}
            >
              Sync saved albums
            </button>
          </>
        )}
      </div>
      {connected && (
        <div className={styles['add-by-url']}>
          <label className={styles['add-by-url-label']}>
            <MdLink size={18} /> Add by URL
          </label>
          <div className={styles['add-by-url-row']}>
            <input
              type="url"
              placeholder="Album or Playlist URL"
              value={addUrl}
              onChange={(e) => {
                setAddUrl(e.target.value);
                setAddUrlError(null);
              }}
              className={styles['add-by-url-input']}
            />
            <AddByUrlCollectionSelect
              value={addUrlCollectionId}
              onChange={setAddUrlCollectionId}
            />
            <button
              type="button"
              className={styles['add-by-url-submit']}
              onClick={async () => {
                if (!addUrl.trim()) return;
                setAddUrlError(null);
                setAddUrlSuccess(null);
                try {
                  const res = await adminApi.addSpotifyByUrl(
                    addUrl.trim(),
                    addUrlCollectionId || undefined
                  );
                  setAddUrl('');
                  const label = res.data.title
                    ? `${res.data.title} — ${res.data.artist}`
                    : 'Album';
                  setAddUrlSuccess(`✓ Added: ${label}`);
                  setTimeout(() => setAddUrlSuccess(null), 5000);
                  queryClient.invalidateQueries({ queryKey: ['admin-albums'] });
                  queryClient.invalidateQueries({ queryKey: ['admin-collections'] });
                } catch (err: unknown) {
                  const msg =
                    err && typeof err === 'object' && 'response' in err
                      ? (err as { response?: { data?: { detail?: string } } }).response?.data
                          ?.detail
                      : 'Failed to add';
                  setAddUrlError(Array.isArray(msg) ? msg.join(' ') : String(msg));
                }
              }}
            >
              Add
            </button>
          </div>
          {addUrlError && <p className={styles['add-by-url-error']}>{addUrlError}</p>}
          {addUrlSuccess && <p className={styles['add-by-url-success']}>{addUrlSuccess}</p>}
        </div>
      )}
      {syncModalOpen && (
        <SyncSavedAlbumsModal
          onClose={() => setSyncModalOpen(false)}
          onAdded={() => {
            queryClient.invalidateQueries({ queryKey: ['admin-albums'] });
          }}
        />
      )}
    </div>
  );
}

function AddByUrlCollectionSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { data: collections } = useQuery({
    queryKey: ['admin-collections'],
    queryFn: async () => {
      const res = await adminApi.listCollections();
      return res.data;
    },
  });
  return (
    <select
      className={styles['add-by-url-collection']}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      title="Optionally add to collection"
    >
      <option value="">No collection</option>
      {(collections ?? []).map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

const IMPORT_BATCH_SIZE = 20;
const PAGE_SIZE = 50;

function SyncSavedAlbumsModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => void;
}) {
  const queryClient = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectingAll, setSelectingAll] = useState(false);

  // Batched import state
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0, added: 0, errors: 0, skipped: 0 });
  const [importDone, setImportDone] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [failedIds, setFailedIds] = useState<string[]>([]);
  const [errorDetails, setErrorDetails] = useState<string[]>([]);
  const [errorsExpanded, setErrorsExpanded] = useState(false);
  const cancelRef = useRef(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-spotify-saved-albums', offset],
    queryFn: async () => {
      const res = await adminApi.getSpotifySavedAlbums(PAGE_SIZE, offset);
      return res.data;
    },
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const toggle = (id: string, alreadyImported: boolean) => {
    if (alreadyImported) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectPageAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      items.forEach((item) => {
        if (!item.already_imported) next.add(item.spotify_id);
      });
      return next;
    });
  };

  const selectEverything = async () => {
    setSelectingAll(true);
    try {
      const res = await adminApi.getAllSpotifySavedAlbumIds();
      const importedSet = new Set(res.data.already_imported_ids ?? []);
      const selectable = (res.data.ids ?? []).filter((id) => !importedSet.has(id));
      setSelected(new Set(selectable));
    } finally {
      setSelectingAll(false);
    }
  };

  const clearAll = () => setSelected(new Set());

  const cancelImport = () => { cancelRef.current = true; };

  const runImport = async (ids: string[]) => {
    if (ids.length === 0) return;

    cancelRef.current = false;
    setImporting(true);
    setImportDone(false);
    setImportError(null);
    setFailedIds([]);
    setErrorDetails([]);
    setErrorsExpanded(false);
    setImportProgress({ done: 0, total: ids.length, added: 0, errors: 0, skipped: 0 });

    let totalAdded = 0;
    let totalErrors = 0;
    let totalSkipped = 0;
    const allFailedIds: string[] = [];
    const allErrorDetails: string[] = [];

    for (let i = 0; i < ids.length; i += IMPORT_BATCH_SIZE) {
      if (cancelRef.current) break;

      const chunk = ids.slice(i, i + IMPORT_BATCH_SIZE);
      try {
        const res = await adminApi.addSpotifyAlbums(chunk);
        totalAdded += res.data.added ?? 0;
        totalErrors += res.data.errors?.length ?? 0;
        totalSkipped += res.data.skipped_unavailable?.length ?? 0;
        if (res.data.failed_ids?.length) {
          allFailedIds.push(...res.data.failed_ids);
        }
        if (res.data.errors?.length) {
          allErrorDetails.push(...res.data.errors);
        }
      } catch (err: unknown) {
        const detail =
          err && typeof err === 'object' && 'response' in err
            ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
            : null;
        setImportError(detail ?? 'Spotify rate limit reached. Wait a few minutes and try again.');
        allFailedIds.push(...ids.slice(i));
        break;
      }

      setImportProgress({ done: Math.min(i + chunk.length, ids.length), total: ids.length, added: totalAdded, errors: totalErrors, skipped: totalSkipped });
    }

    setFailedIds(allFailedIds);
    setErrorDetails(allErrorDetails);
    setImporting(false);
    setImportDone(true);
    queryClient.invalidateQueries({ queryKey: ['admin-albums'] });
    queryClient.invalidateQueries({ queryKey: ['admin-spotify-saved-albums'] });
    onAdded();
    if (totalAdded > 0) setSelected(new Set());
  };

  const addSelected = () => runImport(Array.from(selected));
  const retryFailed = () => runImport([...failedIds]);

  const progressPct = importProgress.total > 0
    ? Math.round((importProgress.done / importProgress.total) * 100)
    : 0;

  return (
    <div className={styles['modal-overlay']} onClick={importing ? undefined : onClose}>
      <div
        className={styles['modal-content']}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles['modal-header']}>
          <h2>Sync saved albums from Spotify</h2>
          <button type="button" className={styles['modal-close']} onClick={importing ? undefined : onClose} disabled={importing}>
            ✕
          </button>
        </div>
        <p className={styles['modal-description']}>
          Select albums to add to your library. Albums already in your library are shown but cannot be selected.
        </p>
        <div className={styles['modal-actions']}>
          <button type="button" className={styles['select-all-btn']} onClick={selectPageAll} disabled={importing}>
            Select page
          </button>
          <button
            type="button"
            className={styles['select-all-btn']}
            onClick={selectEverything}
            disabled={selectingAll || importing}
          >
            {selectingAll ? 'Loading…' : (total > 0 ? `Select all (${total})` : 'Select all')}
          </button>
          {selected.size > 0 && !importing && (
            <button type="button" className={styles['clear-btn']} onClick={clearAll}>
              Clear ({selected.size})
            </button>
          )}
          {!importing ? (
            <button
              type="button"
              className={styles['add-selected-btn']}
              onClick={addSelected}
              disabled={selected.size === 0}
            >
              Add selected ({selected.size})
            </button>
          ) : (
            <button type="button" className={styles['clear-btn']} onClick={cancelImport}>
              Cancel
            </button>
          )}
        </div>

        {importing && (
          <div className={styles['import-progress']}>
            <div className={styles['import-progress-bar-track']}>
              <div className={styles['import-progress-bar']} style={{ width: `${progressPct}%` }} />
            </div>
            <p className={styles['import-progress-label']}>
              {importProgress.done} / {importProgress.total} — {importProgress.added} added
              {importProgress.skipped > 0 ? ` · ${importProgress.skipped} unavailable` : ''}
              {importProgress.errors > 0 ? ` · ${importProgress.errors} errors` : ''}
            </p>
          </div>
        )}
        {importDone && !importing && (
          <div className={styles['import-result']}>
            {importError ? (
              <p className={styles['add-by-url-error']}>{importError}</p>
            ) : (
              <p className={styles['add-success']}>
                ✓ {importProgress.added} added
                {importProgress.skipped > 0 ? ` · ${importProgress.skipped} unavailable on Spotify` : ''}
                {importProgress.errors > 0 ? ` · ${importProgress.errors} failed` : ''}
              </p>
            )}
            {failedIds.length > 0 && (
              <button
                type="button"
                className={styles['retry-btn']}
                onClick={retryFailed}
              >
                Retry {failedIds.length} failed
              </button>
            )}
            {errorDetails.length > 0 && (
              <div className={styles['error-details']}>
                <button
                  type="button"
                  className={styles['error-details-toggle']}
                  onClick={() => setErrorsExpanded((v) => !v)}
                >
                  {errorsExpanded ? '▲ Hide' : '▼ Show'} failed albums ({errorDetails.length})
                </button>
                {errorsExpanded && (
                  <ul className={styles['error-details-list']}>
                    {errorDetails.map((msg, i) => (
                      <li key={i}>{msg}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
        <div className={styles['modal-list']}>
          {isLoading ? (
            <p>Loading...</p>
          ) : (
            items.map((item) => {
              const imported = item.already_imported === true;
              return (
                <label
                  key={item.spotify_id}
                  className={clsx(
                    styles['album-row'],
                    selected.has(item.spotify_id) && styles['selected'],
                    imported && styles['album-row-imported']
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(item.spotify_id)}
                    disabled={imported}
                    onChange={() => toggle(item.spotify_id, imported)}
                  />
                  {item.cover_url && (
                    <img src={item.cover_url} alt="" className={styles['album-cover']} />
                  )}
                  <span className={styles['album-info']}>
                    <strong>{item.name}</strong>
                    {item.artists?.length ? ` — ${item.artists.join(', ')}` : ''}
                    {imported && <span className={styles['album-row-badge']}> In library</span>}
                  </span>
                </label>
              );
            })
          )}
        </div>
        <div className={styles['modal-pagination']}>
          <button
            type="button"
            disabled={offset === 0}
            onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
          >
            Previous
          </button>
          <span>
            {total > 0 ? `${offset + 1}–${Math.min(offset + PAGE_SIZE, total)} of ${total}` : '—'}
          </span>
          <button
            type="button"
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => setOffset((o) => o + PAGE_SIZE)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
