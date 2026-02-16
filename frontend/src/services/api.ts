// API client for backend communication
import axios from 'axios';
import type {
  Collection,
  Album,
  AlbumDetail,
  QueueItem,
  PlaybackState,
  ScanResult,
} from '../types';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Collections API
export const collectionsApi = {
  getAll: () => api.get<Collection[]>('/collections'),
  getBySlug: (slug: string) => api.get<Collection>(`/collections/${slug}`),
  getAlbums: (slug: string) => api.get<Album[]>(`/collections/${slug}/albums`),
};

// Albums API
export const albumsApi = {
  getById: (id: string, collection?: string) => {
    const params = collection ? { collection } : {};
    return api.get<AlbumDetail>(`/albums/${id}`, { params });
  },
  getTracks: (id: string) => api.get(`/albums/${id}/tracks`),
};

// Queue API
export const queueApi = {
  get: (collection: string) => 
    api.get<QueueItem[]>('/queue', { params: { collection } }),
  add: (collection: string, album_number: number, track_number: number = 0) =>
    api.post('/queue', { collection, album_number, track_number }),
  remove: (queueId: string) => api.delete(`/queue/${queueId}`),
  clear: (collection: string) => 
    api.delete('/queue', { params: { collection } }),
};

// Playback API
export const playbackApi = {
  getState: (collection: string) =>
    api.get<PlaybackState>('/playback/state', { params: { collection } }),
  play: (collection: string) => api.post('/playback/play', { collection }),
  pause: (collection: string) => api.post('/playback/pause', { collection }),
  stop: (collection: string) => api.post('/playback/stop', { collection }),
  skip: (collection: string) => api.post('/playback/skip', { collection }),
  updatePosition: (collection: string, position_ms: number) =>
    api.post('/playback/position', { collection, position_ms }),
  setVolume: (collection: string, volume: number) =>
    api.post('/playback/volume', { collection, volume }),
  getStreamUrl: (trackId: string) => `/api/playback/stream/${trackId}`,
};

// Admin API
export const adminApi = {
  scanLibrary: () => api.post<ScanResult>('/admin/library/scan'),
  listAllAlbums: (limit: number = 1000, offset: number = 0) =>
    api.get('/admin/library/albums', { params: { limit, offset } }),
  getAlbumDetails: (id: string) => api.get(`/admin/albums/${id}`),
  updateAlbum: (id: string, data: { title?: string; artist?: string; year?: number; archived?: boolean }) =>
    api.put(`/admin/albums/${id}`, data),
  deleteAlbum: (id: string) => api.delete(`/admin/albums/${id}`),
  updateTrack: (id: string, data: { title?: string; enabled?: boolean }) =>
    api.put(`/admin/tracks/${id}`, data),
  // Collection management
  createCollection: (name: string, slug: string, description?: string) =>
    api.post('/admin/collections', { name, slug, description }),
  updateCollection: (
    id: string,
    data: { name?: string; description?: string; is_active?: boolean }
  ) => api.put(`/admin/collections/${id}`, data),
  deleteCollection: (id: string) => api.delete(`/admin/collections/${id}`),
  updateCollectionAlbums: (
    slug: string,
    album_id: string,
    action: 'add' | 'remove',
    sort_order?: number
  ) =>
    api.put(`/admin/collections/${slug}/albums`, null, {
      params: { album_id, action, sort_order },
    }),
  reorderAlbum: (slug: string, album_id: string, new_sort_order: number) =>
    api.put(`/admin/collections/${slug}/albums/reorder`, null, {
      params: { album_id, new_sort_order },
    }),
  sanitizeTracks: () => api.post('/admin/sanitize-tracks'),
};

export default api;
