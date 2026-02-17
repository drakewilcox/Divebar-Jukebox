// Type definitions for the jukebox application

export interface Collection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
}

export interface Album {
  id: string;
  display_number?: number;
  title: string;
  artist: string;
  cover_art_path: string | null;
  year: number | null;
  total_tracks: number;
  has_multi_disc: boolean;
}

export interface Track {
  id: string;
  disc_number: number;
  track_number: number;
  title: string;
  artist: string;
  duration_ms: number;
  enabled: boolean;
  is_favorite: boolean;
  is_recommended: boolean;
  file_path: string;
}

export interface AlbumDetail extends Album {
  tracks: Track[];
}

export interface QueueItem {
  id: string;
  position: number;
  status: string;
  queued_at: string;
  track: {
    id: string;
    title: string;
    artist: string;
    duration_ms: number;
    album_title: string;
    album_artist: string;
    cover_art_path: string | null;
  };
}

export interface PlaybackState {
  collection_id: string;
  current_track_id: string | null;
  is_playing: boolean;
  current_position_ms: number;
  volume: number;
  current_track: {
    id: string;
    title: string;
    artist: string;
    duration_ms: number;
    album_title: string;
    album_artist: string;
    album_year: number | null;
    cover_art_path: string | null;
  } | null;
}

export interface ScanResult {
  albums_found: number;
  albums_imported: number;
  albums_updated: number;
  albums_skipped: number;
  tracks_imported: number;
  errors: string[];
}
