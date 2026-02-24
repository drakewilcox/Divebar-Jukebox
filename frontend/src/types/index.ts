// Type definitions for the jukebox application

export type HitButtonMode =
  | 'prioritize-section'
  | 'favorites'
  | 'favorites-and-recommended'
  | 'any';

export interface CollectionSection {
  order: number;
  name: string;
  color: string;
  start_slot?: number;  // 1-based first slot in this section
  end_slot?: number;   // 1-based last slot; omit for last section = "to end" (new albums included)
}

export interface Collection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  sections_enabled?: boolean;
  sections?: CollectionSection[] | null;
  /** Default display settings when viewing this collection in the jukebox */
  default_sort_order?: 'alphabetical' | 'curated' | null;
  default_show_jump_to_bar?: boolean | null;
  default_jump_button_type?: 'letter-ranges' | 'number-ranges' | 'sections' | null;
  default_show_color_coding?: boolean | null;
  default_edit_mode?: boolean | null;
  default_crossfade_seconds?: number | null;
  default_hit_button_mode?: HitButtonMode | null;
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
  archived?: boolean;
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
    selection_display?: string | null;
    album_id?: string | null;
    track_number?: number | null; // 1-based
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
    selection_display: string | null;
    album_id?: string | null;
    track_number?: number | null; // 1-based
    /** ReplayGain in dB (e.g. -5.23); null if not present. Applied to normalize loudness. */
    replaygain_track_gain: number | null;
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
