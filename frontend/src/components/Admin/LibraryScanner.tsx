import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MdOutlineSync, MdOutlineCleaningServices, MdEdit, MdArchive, MdUnarchive } from 'react-icons/md';
import { adminApi } from '../../services/api';
import { useState, useRef, useEffect, useMemo } from 'react';
import { filterAndSortAlbums, type AlbumSortOption } from '../../utils/albumListFilter';
import AlbumEditModal from './AlbumEditModal';
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
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

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
  
  const sanitizeMutation = useMutation({
    mutationFn: () => adminApi.sanitizeTracks(),
    onSuccess: (response) => {
      alert(`Sanitized ${response.data.updated_count} of ${response.data.total_tracks} track titles`);
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

  const filteredSortedAlbums = useMemo(
    () => (albums ? filterAndSortAlbums(albums, searchQuery, sortBy) : []),
    [albums, searchQuery, sortBy]
  );

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
      <div className={styles['scanner-section']}>
        <h2>Library Scanner</h2>
        <p>Scan your music library to import new albums. Albums already in the database (matched by folder path) are skipped so your edits and custom track settings are not overwritten.</p>
        
        <div className={styles['scanner-buttons']}>
          <span className={styles['admin-tooltip-wrap']} data-tooltip="Scan Library">
            <button
              className={styles['scan-button']}
              onClick={() => scanMutation.mutate()}
              disabled={scanMutation.isPending}
              aria-label="Scan Library"
            >
              <MdOutlineSync size={22} />
            </button>
          </span>
          <span className={styles['admin-tooltip-wrap']} data-tooltip="Clean Track Titles">
            <button
              className={styles['sanitize-button']}
              onClick={() => {
                if (confirm('This will remove remaster annotations like "(2014 Remaster)" from all track titles. Continue?')) {
                  sanitizeMutation.mutate();
                }
              }}
              disabled={sanitizeMutation.isPending}
              aria-label="Clean Track Titles"
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
      
      <div className={styles['scanner-section']}>
        <h2>Albums in Database</h2>
        <p>Total albums: {albums?.length || 0} {albums && albums.filter((a: any) => !a.archived).length !== albums.length && `(${albums.filter((a: any) => !a.archived).length} active)`}</p>

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
                  {album.cover_art_path && (
                    <div className={styles['album-item-cover']}>
                      <img
                        src={`/api/media/${album.cover_art_path}`}
                        alt={`${album.title} cover`}
                      />
                    </div>
                  )}
                  <div className={styles['album-item-info']}>
                    <div className={styles['album-item-title']}>
                      {album.title}
                      {album.archived && <span className={styles['archived-badge']}>Archived</span>}
                    </div>
                    <div className={styles['album-item-artist']}>{album.artist}</div>
                    <div className={styles['album-item-path']}>{album.file_path}</div>
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
      </div>
    </div>
  );
}
