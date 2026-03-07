// API client for backend communication
import axios from 'axios';
import { useAuthStore } from '../stores/authStore';
import type {
  Collection,
  Album,
  AlbumDetail,
  QueueItem,
  PlaybackState,
  ScanResult,
} from '../types';

const apiBase =
  (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '') || '';
const api = axios.create({
  baseURL: apiBase ? `${apiBase}/api` : '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Public config (capabilities) - no auth
export const configApi = {
  getConfig: () => api.get<{ enable_local_library: boolean }>('/config'),
};

// Settings API (e.g. default collection)
export interface JukeboxSettings {
  default_collection_slug: string;
}

export const settingsApi = {
  get: () => api.get<JukeboxSettings>('/settings'),
  update: (data: { default_collection_slug: string }) =>
    api.patch<JukeboxSettings>('/settings', data),
};

// Spotify listener (OAuth + status)
export const spotifyListenerApi = {
  getStatus: () => api.get<{ configured: boolean }>('/auth/spotify/status'),
  getAuthorizeUrl: () => {
    const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
    return `${base}/api/auth/spotify`;
  },
};

// Auth API
export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ access_token: string; token_type: string; user: { id: string; slug: string; email: string } }>('/auth/login', { email, password }),
  register: (email: string, password: string, slug?: string) =>
    api.post<{ access_token: string; token_type: string; user: { id: string; slug: string; email: string } }>('/auth/register', { email, password, slug }),
  me: () => api.get<{ id: string; slug: string; email: string }>('/auth/me'),
  updateProfile: (data: { slug?: string; email?: string }) =>
    api.patch<{ id: string; slug: string; email: string }>('/auth/me', data),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<{ id: string; slug: string; email: string }>('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    }),
};

// User-scoped collections (for /:user_slug/:collection_slug)
export const usersApi = {
  getCollections: (userSlug: string) => api.get<Collection[]>(`/users/${userSlug}/collections`),
  getCollection: (userSlug: string, collectionSlug: string) =>
    api.get<Collection>(`/users/${userSlug}/collections/${collectionSlug}`),
};

// Collections API (legacy and with optional user_slug)
export const collectionsApi = {
  getAll: () => api.get<Collection[]>('/collections'),
  getBySlug: (slug: string, userSlug?: string) =>
    api.get<Collection>(`/collections/${slug}`, { params: userSlug ? { user_slug: userSlug } : {} }),
  getAlbums: (slug: string, userSlug?: string) =>
    api.get<Album[]>(`/collections/${slug}/albums`, { params: userSlug ? { user_slug: userSlug } : {} }),
};

// Albums API
export const albumsApi = {
  getById: (id: string, collection?: string) => {
    const params = collection ? { collection } : {};
    return api.get<AlbumDetail>(`/albums/${id}`, { params });
  },
  getTracks: (id: string) => api.get(`/albums/${id}/tracks`),
};

// Queue API (userSlug optional for /:user_slug/:collection_slug)
export const queueApi = {
  get: (collection: string, userSlug?: string) =>
    api.get<QueueItem[]>('/queue', { params: { collection, ...(userSlug ? { user_slug: userSlug } : {}) } }),
  add: (collection: string, album_number: number, track_number: number = 0, userSlug?: string) =>
    api.post('/queue', { collection, album_number, track_number, ...(userSlug ? { user_slug: userSlug } : {}) }),
  remove: (queueId: string) => api.delete(`/queue/${queueId}`),
  clear: (collection: string, userSlug?: string) =>
    api.delete('/queue', { params: { collection, ...(userSlug ? { user_slug: userSlug } : {}) } }),
  reorder: (collection: string, queue_ids: string[], userSlug?: string) =>
    api.put('/queue/order', { queue_ids }, { params: { collection, ...(userSlug ? { user_slug: userSlug } : {}) } }),
  addFavoritesRandom: (
    collection: string,
    count: number = 10,
    mode: string = 'favorites',
    sectionName?: string,
    sectionStartSlot?: number,
    sectionEndSlot?: number,
    userSlug?: string,
  ) =>
    api.post<{ message: string; added: number }>('/queue/add-favorites-random', {
      collection,
      count,
      mode,
      ...(userSlug ? { user_slug: userSlug } : {}),
      ...(sectionName !== undefined ? { section_name: sectionName } : {}),
      ...(sectionStartSlot !== undefined ? { section_start_slot: sectionStartSlot } : {}),
      ...(sectionEndSlot !== undefined ? { section_end_slot: sectionEndSlot } : {}),
    }),
};

// Playback API (userSlug optional for /:user_slug/:collection_slug)
export const playbackApi = {
  getState: (collection: string, userSlug?: string) =>
    api.get<PlaybackState>('/playback/state', { params: { collection, ...(userSlug ? { user_slug: userSlug } : {}) } }),
  play: (collection: string, userSlug?: string) =>
    api.post('/playback/play', { collection, ...(userSlug ? { user_slug: userSlug } : {}) }),
  pause: (collection: string, userSlug?: string) =>
    api.post('/playback/pause', { collection, ...(userSlug ? { user_slug: userSlug } : {}) }),
  stop: (collection: string, userSlug?: string) =>
    api.post('/playback/stop', { collection, ...(userSlug ? { user_slug: userSlug } : {}) }),
  skip: (collection: string, userSlug?: string) =>
    api.post('/playback/skip', { collection, ...(userSlug ? { user_slug: userSlug } : {}) }),
  updatePosition: (collection: string, position_ms: number, userSlug?: string) =>
    api.post('/playback/position', { collection, position_ms, ...(userSlug ? { user_slug: userSlug } : {}) }),
  setVolume: (collection: string, volume: number, userSlug?: string) =>
    api.post('/playback/volume', { collection, volume, ...(userSlug ? { user_slug: userSlug } : {}) }),
  getStreamUrl: (trackId: string) => `/api/playback/stream/${trackId}`,
  getNextTransition: (collection: string, userSlug?: string) =>
    api.get<{ next_track_id: string | null; next_replaygain_db: number | null; apply_crossfade: boolean }>(
      '/playback/next-transition',
      { params: { collection, ...(userSlug ? { user_slug: userSlug } : {}) } }
    ),
};

/** Build URL for cover art. Absolute https:// URLs (e.g. Spotify CDN) are returned as-is.
 *  Relative local paths are prefixed with /api/media/ (or /api/media/playlist/ for playlists). */
export function getMediaUrl(
  coverPath: string | null | undefined,
  isPlaylist?: boolean
): string | null {
  if (!coverPath) return null;
  if (coverPath.startsWith('https://') || coverPath.startsWith('http://')) return coverPath;
  const base = isPlaylist ? '/api/media/playlist/' : '/api/media/';
  return `${base}${coverPath}`;
}

// Admin API
export const adminApi = {
  scanLibrary: () => api.post<ScanResult>('/admin/library/scan'),
  scanPlaylists: () => api.post<ScanResult>('/admin/playlists/scan'),
  listAllAlbums: (limit: number = 1000, offset: number = 0) =>
    api.get<{ id: string; title: string; artist: string; file_path: string; cover_art_path: string | null; spotify_image_url: string | null; total_tracks: number; year: number | null; various_artists: boolean; archived: boolean; is_playlist: boolean; created_at: string | null }[]>('/admin/library/albums', { params: { limit, offset } }),
  getAlbumDetails: (id: string) => api.get(`/admin/albums/${id}`),
  updateAlbum: (
    id: string,
    data: {
      title?: string;
      artist?: string;
      year?: number;
      various_artists?: boolean;
      archived?: boolean;
      description?: string | null;
    }
  ) => api.put(`/admin/albums/${id}`, data),
  uploadAlbumCover: (albumId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<{ message: string; custom_cover_art_path: string }>(`/admin/albums/${albumId}/cover`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  restoreAlbumCover: (albumId: string) =>
    api.delete<{ message: string }>(`/admin/albums/${albumId}/cover`),
  deleteAlbum: (id: string) => api.delete(`/admin/albums/${id}`),
  updateTrack: (id: string, data: { title?: string; artist?: string; enabled?: boolean; archived?: boolean; is_favorite?: boolean; is_recommended?: boolean }) =>
    api.put(`/admin/tracks/${id}`, data),
  // Collection management
  createCollection: (name: string, slug: string, description?: string, source?: 'local' | 'spotify') =>
    api.post('/admin/collections', { name, slug, description, source: source ?? 'local' }),
  listCollections: () => api.get<{ id: string; name: string; slug: string; description: string | null; is_active: boolean; published: boolean; source: string }[]>('/admin/collections'),
  // Spotify (admin: connect, sync saved albums, add by URL)
  getSpotifyStatus: () => api.get<{ connected: boolean }>('/admin/spotify/status'),
  postSpotifyCallback: (code: string) => api.post<{ message: string }>('/admin/spotify/callback', { code }),
  getSpotifySavedAlbums: (limit?: number, offset?: number) =>
    api.get<{ items: { spotify_id: string; name: string; artists: string[]; cover_url: string | null; already_imported: boolean }[]; total: number }>(
      '/admin/spotify/saved-albums',
      { params: { limit: limit ?? 50, offset: offset ?? 0 } }
    ),
  getAllSpotifySavedAlbumIds: () =>
    api.get<{ ids: string[]; total: number; already_imported_ids: string[] }>('/admin/spotify/saved-albums/all-ids'),
  addSpotifyAlbums: (spotifyAlbumIds: string[]) =>
    api.post<{ added: number; albums: { id: string; title: string; artist: string }[]; errors: string[]; failed_ids: string[]; skipped_unavailable: string[] }>(
      '/admin/spotify/add-albums',
      { spotify_album_ids: spotifyAlbumIds }
    ),
  addSpotifyByUrl: (url: string, addToCollectionId?: string) =>
    api.post<{ message: string; album_id: string; title: string; artist: string }>('/admin/spotify/add-by-url', {
      url,
      add_to_collection_id: addToCollectionId ?? null,
    }),
  getSpotifyAdminAuthorizeUrl: () => {
    const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
    return `${base}/api/auth/spotify/admin`;
  },
  updateCollection: (
    id: string,
    data: { name?: string; slug?: string; description?: string; is_active?: boolean; published?: boolean; source?: 'local' | 'spotify' }
  ) => api.put(`/admin/collections/${id}`, data),
  deleteCollection: (id: string) => api.delete(`/admin/collections/${id}`),
  updateCollectionSections: (
    collectionId: string,
    data: {
      sections_enabled: boolean;
      sections?: { order: number; name: string; color: string; start_slot?: number; end_slot?: number }[];
    }
  ) => api.put(`/admin/collections/${collectionId}/sections`, data),
  updateCollectionSettings: (
    collectionId: string,
    data: {
      default_sort_order?: 'alphabetical' | 'curated';
      default_show_jump_to_bar?: boolean;
      default_jump_button_type?: 'letter-ranges' | 'number-ranges' | 'sections';
      default_show_color_coding?: boolean;
      default_show_card_background?: boolean;
      default_edit_mode?: boolean;
      default_crossfade_seconds?: number;
      default_hit_button_mode?: string;
    }
  ) => api.put(`/admin/collections/${collectionId}/settings`, data),
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
  setCollectionAlbumOrder: (slug: string, album_ids: string[]) =>
    api.put(`/admin/collections/${slug}/albums/order`, { album_ids }),
  sanitizeTracks: () => api.post('/admin/sanitize-tracks'),
};

export default api;
