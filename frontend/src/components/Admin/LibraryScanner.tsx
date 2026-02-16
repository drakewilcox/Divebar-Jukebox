import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../services/api';
import { useState } from 'react';
import AlbumEditModal from './AlbumEditModal';
import './LibraryScanner.css';

export default function LibraryScanner() {
  const queryClient = useQueryClient();
  const [scanResults, setScanResults] = useState<any>(null);
  const [editingAlbumId, setEditingAlbumId] = useState<string | null>(null);
  const [displayLimit, setDisplayLimit] = useState(50);
  
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
  
  
  return (
    <div className="library-scanner">
      <div className="scanner-section">
        <h2>Library Scanner</h2>
        <p>Scan your music library to import new albums and update existing ones.</p>
        
        <div className="scanner-buttons">
          <button
            className="scan-button"
            onClick={() => scanMutation.mutate()}
            disabled={scanMutation.isPending}
          >
            {scanMutation.isPending ? 'Scanning...' : '🔍 Scan Library'}
          </button>
          
          <button
            className="sanitize-button"
            onClick={() => {
              if (confirm('This will remove remaster annotations like "(2014 Remaster)" from all track titles. Continue?')) {
                sanitizeMutation.mutate();
              }
            }}
            disabled={sanitizeMutation.isPending}
          >
            {sanitizeMutation.isPending ? 'Sanitizing...' : '🧹 Clean Track Titles'}
          </button>
        </div>
        
        {scanResults && (
          <div className="scan-results">
            <h3>Scan Results</h3>
            <div className="results-grid">
              <div className="result-item">
                <div className="result-label">Albums Found</div>
                <div className="result-value">{scanResults.albums_found}</div>
              </div>
              <div className="result-item">
                <div className="result-label">Imported</div>
                <div className="result-value success">{scanResults.albums_imported}</div>
              </div>
              <div className="result-item">
                <div className="result-label">Updated</div>
                <div className="result-value">{scanResults.albums_updated}</div>
              </div>
              <div className="result-item">
                <div className="result-label">Skipped</div>
                <div className="result-value warning">{scanResults.albums_skipped}</div>
              </div>
              <div className="result-item">
                <div className="result-label">Tracks Imported</div>
                <div className="result-value">{scanResults.tracks_imported}</div>
              </div>
              <div className="result-item">
                <div className="result-label">Errors</div>
                <div className="result-value error">{scanResults.errors.length}</div>
              </div>
            </div>
            
            {scanResults.errors.length > 0 && (
              <div className="error-list">
                <h4>Errors:</h4>
                {scanResults.errors.map((error: string, index: number) => (
                  <div key={index} className="error-message">{error}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      
      <div className="scanner-section">
        <h2>Albums in Database</h2>
        <p>Total albums: {albums?.length || 0} {albums && albums.filter((a: any) => !a.archived).length !== albums.length && `(${albums.filter((a: any) => !a.archived).length} active)`}</p>
        
        {albums && albums.length > 0 && (
          <>
            <div className="albums-list">
              {albums.slice(0, displayLimit).map((album: any) => (
                <div key={album.id} className={`album-item ${album.archived ? 'archived' : ''}`}>
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
                    <button
                      className="edit-button"
                      onClick={() => setEditingAlbumId(album.id)}
                    >
                      ✏️ Edit
                    </button>
                    <button
                      className={`archive-button ${album.archived ? 'unarchive' : ''}`}
                      onClick={() => archiveMutation.mutate({ id: album.id, archived: !album.archived })}
                      disabled={archiveMutation.isPending}
                    >
                      {album.archived ? '📂 Unarchive' : '📦 Archive'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {displayLimit < albums.length && (
              <div className="load-more-section">
                <p className="albums-more">Showing {displayLimit} of {albums.length} albums</p>
                <button
                  className="load-more-button"
                  onClick={() => setDisplayLimit(prev => Math.min(prev + 50, albums.length))}
                >
                  Load More (50)
                </button>
                <button
                  className="load-all-button"
                  onClick={() => setDisplayLimit(albums.length)}
                >
                  Load All
                </button>
              </div>
            )}
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
