import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MdOutlineSync, MdOutlineCleaningServices, MdOutlineQueueMusic, MdEdit, MdArchive, MdUnarchive, MdDelete, MdMusicNote } from 'react-icons/md';
import { adminApi, configApi, getMediaUrl } from '../../services/api';
import { useState, useRef, useEffect, useMemo } from 'react';
import { filterAndSortAlbums, type AlbumSortOption } from '../../utils/albumListFilter';
import AlbumEditModal from './AlbumEditModal';
import ConfirmModal from '../ConfirmModal';
import SpotifySync from './SpotifySync';
import styles from './LibraryScanner.module.css'
import clsx from 'clsx';

const INFINITE_SCROLL_PAGE_SIZE = 50;

export default function LibraryScanner() {
  const queryClient = useQueryClient();
  const [scanResults, setScanResults] = useState<any>(null);
  const [editingAlbumId, setEditingAlbumId] = useState<string | null>(null);
  const [displayLimit, setDisplayLimit] = useState(INFINITE_SCROLL_PAGE_SIZE);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<AlbumSortOption>('artist_asc');
  const [sanitizeConfirmOpen, setSanitizeConfirmOpen] = useState(false);
  const [sanitizeSuccessOpen, setSanitizeSuccessOpen] = useState(false);
  const [sanitizeSuccessMessage, setSanitizeSuccessMessage] = useState('');
  const [deleteAlbumId, setDeleteAlbumId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: async () => {
      const res = await configApi.getConfig();
      return res.data;
    },
    retry: false,
  });
  const enableLocalLibrary =
    config?.enable_local_library ?? (import.meta.env.VITE_ENABLE_LOCAL_FILES === 'false' ? false : true);

  const { data: albums } = useQuery({
    queryKey: ['admin-albums'],
    queryFn: async () => {
      const response = await adminApi.listAllAlbums(10000); // Get all albums
      return response.data;
    },
  });
  
  const scanMutation = useMutation({
    mutationFn: () => adminApi.scanLibrary(),
    onSuccess: (response) => {
      setScanResults(response.data);
      queryClient.invalidateQueries({ queryKey: ['admin-albums'] });
    },
  });

  const scanPlaylistsMutation = useMutation({
    mutationFn: () => adminApi.scanPlaylists(),
    onSuccess: (response) => {
      setScanResults(response.data);
      queryClient.invalidateQueries({ queryKey: ['admin-albums'] });
    },
  });
  
  const sanitizeMutation = useMutation({
    mutationFn: () => adminApi.sanitizeTracks(),
    onSuccess: (response) => {
      const albumsMsg = response.data.updated_albums != null
        ? `${response.data.updated_albums} album(s) and `
        : '';
      setSanitizeSuccessMessage(
        `Sanitized ${albumsMsg}${response.data.updated_count} of ${response.data.total_tracks} track titles.`
      );
      setSanitizeSuccessOpen(true);
      queryClient.invalidateQueries({ queryKey: ['admin-albums'] });
    },
  });
  
  const archiveMutation = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      adminApi.updateAlbum(id, { archived }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-albums'] });
    },
  });

  const deleteAlbumMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteAlbum(id),
    onSuccess: () => {
      setDeleteAlbumId(null);
      queryClient.invalidateQueries({ queryKey: ['admin-albums'] });
      queryClient.invalidateQueries({ queryKey: ['admin-collections'] });
    },
  });

  const filteredSortedAlbums = useMemo(() => {
    const sourceFiltered = (albums ?? []).filter((a: any) => {
      const isSpotify = String(a.file_path ?? '').startsWith('spotify/');
      return enableLocalLibrary ? !isSpotify : isSpotify;
    });
    return filterAndSortAlbums(sourceFiltered, searchQuery, sortBy);
  }, [albums, searchQuery, sortBy, enableLocalLibrary]);

  useEffect(() => {
    setDisplayLimit(INFINITE_SCROLL_PAGE_SIZE);
  }, [searchQuery, sortBy]);

  // Infinite scroll: when sentinel is visible, load more albums
  useEffect(() => {
    const list = listRef.current;
    const sentinel = sentinelRef.current;
    const total = filteredSortedAlbums.length;
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
  }, [displayLimit, filteredSortedAlbums.length]);

  return (
    <div className={styles['library-scanner']}>
      {!enableLocalLibrary && <SpotifySync />}
      {enableLocalLibrary && (
      <div className={styles['scanner-section']}>
        <h2>Library Scanner</h2>
        <p>Scan your music library to import new albums. Albums already in the database (matched by folder path) are skipped so your edits and custom track settings are not overwritten.</p>
        
        <div className={styles['scanner-buttons']}>
          <span className={styles['admin-tooltip-wrap']} data-tooltip="Scan Albums Folder">
            <button
              className={styles['scan-button']}
              onClick={() => scanMutation.mutate()}
              disabled={scanMutation.isPending}
              aria-label="Scan Library"
            >
              <MdOutlineSync size={22} />
            </button>
          </span>
          <span className={styles['admin-tooltip-wrap']} data-tooltip="Scan Playlists Folder">
            <button
              className={styles['scan-button']}
              onClick={() => scanPlaylistsMutation.mutate()}
              disabled={scanPlaylistsMutation.isPending}
              aria-label="Scan Playlists"
              title="Scan Playlists"
            >
              <MdOutlineQueueMusic size={22} />
            </button>
          </span>
          <span className={styles['admin-tooltip-wrap']} data-tooltip="Clean album and track titles">
            <button
              className={styles['sanitize-button']}
              onClick={() => setSanitizeConfirmOpen(true)}
              disabled={sanitizeMutation.isPending}
              aria-label="Clean titles"
            >
              <MdOutlineCleaningServices size={22} />
            </button>
          </span>
        </div>
        
        {scanResults && (
          <div className={styles['scan-results']}>
            <h3>Scan Results</h3>
            <div className={styles['results-grid']}>
              <div className={styles['result-item']}>
                <div className={styles['result-label']}>Albums Found</div>
                <div className={styles['result-value']}>{scanResults.albums_found}</div>
              </div>
              <div className={styles['result-item']}>
                <div className={styles['result-label']}>Imported</div>
                <div className={clsx(styles['result-value'], styles['success'])}>{scanResults.albums_imported}</div>
              </div>
              <div className={styles['result-item']}>
                <div className={styles['result-label']}>Already in library</div>
                <div className={styles['result-value']}>{scanResults.albums_already_exist ?? 0}</div>
              </div>
              <div className={styles['result-item']}>
                <div className={styles['result-label']}>Skipped (errors)</div>
                <div className={clsx(styles['result-value'], styles['warning'])}>{scanResults.albums_skipped}</div>
              </div>
              <div className={styles['result-item']}>
                <div className={styles['result-label']}>Tracks Imported</div>
                <div className={styles['result-value']}>{scanResults.tracks_imported}</div>
              </div>
              <div className={styles['result-item']}>
                <div className={styles['result-label']}>Errors</div>
                <div className={clsx(styles['result-value'], styles['error'])}>{scanResults.errors.length}</div>
              </div>
            </div>
            
            {scanResults.errors.length > 0 && (
              <div className={styles['error-list']}>
                <h4>Errors:</h4>
                {scanResults.errors.map((error: string, index: number) => (
                  <div key={index} className={styles['error-message']}>{error}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      )}
      
      <div className={styles['scanner-section']}>
        <div className={styles['albums-section-header']}>
          <div className={styles['albums-section-title-block']}>
            <h2>Albums in Database</h2>
            <p className={styles['albums-section-total']}>Total albums: {albums?.length || 0} {albums && albums.filter((a: any) => !a.archived).length !== albums.length && `(${albums.filter((a: any) => !a.archived).length} active)`}</p>
          </div>
          {!enableLocalLibrary && (
            <span className={styles['albums-section-sanitize-wrap']}>
              <span className={styles['admin-tooltip-wrap']} data-tooltip="Clean album and track titles">
                <button
                  className={styles['sanitize-button']}
                  onClick={() => setSanitizeConfirmOpen(true)}
                  disabled={sanitizeMutation.isPending}
                  aria-label="Clean titles"
                >
                  <MdOutlineCleaningServices size={22} />
                </button>
              </span>
            </span>
          )}
        </div>

        {albums && albums.length > 0 && (
          <>
            <div className={styles['albums-list-toolbar']}>
              <input
                type="search"
                placeholder="Search by album or artist…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles['albums-list-search']}
                aria-label="Search albums by title or artist"
              />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as AlbumSortOption)}
                className={styles['albums-list-sort']}
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
            <div ref={listRef} className={styles['albums-list']}>
              {filteredSortedAlbums.length === 0 ? (
                <p className={styles['albums-list-empty']}>No albums match your search.</p>
              ) : (
              <>
              {filteredSortedAlbums.slice(0, displayLimit).map((album: any) => (
                <div key={album.id} className={clsx(styles['album-item'], album.archived && styles['archived'])}>
                  <div className={styles['album-item-cover']}>
                    {(() => {
                      const src = getMediaUrl(album.cover_art_path, album.is_playlist) ?? album.spotify_image_url ?? null;
                      return src ? (
                        <img src={src} alt={`${album.title} cover`} />
                      ) : (
                        <div className={styles['album-item-cover-placeholder']} aria-hidden>
                          <MdMusicNote size={28} />
                        </div>
                      );
                    })()}
                  </div>
                  <div className={styles['album-item-info']}>
                    <div className={styles['album-item-title']}>
                      {album.title}
                      {album.archived && <span className={styles['archived-badge']}>Archived</span>}
                    </div>
                    <div className={styles['album-item-artist']}>{album.artist}</div>
                    {!String(album.file_path ?? '').startsWith('spotify/') && (
                      <div className={styles['album-item-path']}>{album.file_path}</div>
                    )}
                  </div>
                  <div className={styles['album-item-stats']}>
                    <span>{album.total_tracks} tracks</span>
                    {album.year && <span>{album.year}</span>}
                  </div>
                  <div className={styles['album-item-actions']}>
                    <span className={styles['admin-tooltip-wrap']} data-tooltip="Edit album">
                      <button
                        className={styles['edit-button']}
                        onClick={() => setEditingAlbumId(album.id)}
                        aria-label="Edit album"
                      >
                        <MdEdit size={20} />
                      </button>
                    </span>
                    <span className={styles['admin-tooltip-wrap']} data-tooltip={album.archived ? 'Unarchive' : 'Archive'}>
                      <button
                        className={clsx(styles['archive-button'], album.archived && styles['unarchive'])}
                        onClick={() => archiveMutation.mutate({ id: album.id, archived: !album.archived })}
                        disabled={archiveMutation.isPending}
                        aria-label={album.archived ? 'Unarchive' : 'Archive'}
                      >
                        {album.archived ? <MdUnarchive size={20} /> : <MdArchive size={20} />}
                      </button>
                    </span>
                    <span className={styles['admin-tooltip-wrap']} data-tooltip="Delete">
                      <button
                        className={styles['delete-button']}
                        onClick={() => setDeleteAlbumId(album.id)}
                        disabled={deleteAlbumMutation.isPending}
                        aria-label="Delete album from database"
                      >
                        <MdDelete size={20} />
                      </button>
                    </span>
                  </div>
                </div>
              ))}
              {displayLimit < filteredSortedAlbums.length && (
                <div ref={sentinelRef} className={styles['infinite-scroll-sentinel']} aria-hidden="true" />
              )}
              </>
              )}
            </div>
          </>
        )}
        
        {editingAlbumId && (
          <AlbumEditModal
            albumId={editingAlbumId}
            onClose={() => setEditingAlbumId(null)}
          />
        )}

        <ConfirmModal
          isOpen={sanitizeConfirmOpen}
          message="This will remove remaster annotations (e.g. &quot;(2014 Remaster)&quot;) from all album and track titles. Continue?"
          cancelButtonText="Cancel"
          confirmButtonText="Continue"
          onCancel={() => setSanitizeConfirmOpen(false)}
          onConfirm={() => {
            setSanitizeConfirmOpen(false);
            sanitizeMutation.mutate();
          }}
        />

        {deleteAlbumId && (() => {
          const album = filteredSortedAlbums.find((a: { id: string }) => a.id === deleteAlbumId);
          const label = album ? `${album.artist} – ${album.title}` : 'this album';
          return (
            <ConfirmModal
              isOpen={true}
              message={`Permanently delete ${label} from the database? This will remove the album and all its tracks from every collection. This cannot be undone.`}
              cancelButtonText="Cancel"
              confirmButtonText="Delete"
              confirmVariant="danger"
              onCancel={() => setDeleteAlbumId(null)}
              onConfirm={() => {
                if (deleteAlbumMutation.isPending) return;
                deleteAlbumMutation.mutate(deleteAlbumId);
              }}
            />
          );
        })()}

        {sanitizeSuccessOpen && (
          <div
            className={styles['result-modal-overlay']}
            onClick={() => setSanitizeSuccessOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sanitize-result-message"
          >
            <div
              className={styles['result-modal']}
              onClick={(e) => e.stopPropagation()}
            >
              <p id="sanitize-result-message" className={styles['result-modal-message']}>
                {sanitizeSuccessMessage}
              </p>
              <div className={styles['result-modal-actions']}>
                <button
                  type="button"
                  className={styles['result-modal-ok']}
                  onClick={() => setSanitizeSuccessOpen(false)}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
