/**
 * Single place that syncs backend playback state to the Spotify Web Playback SDK.
 *
 * Track-end detection strategy:
 *   The Spotify SDK does NOT send a reliable "track ended" event, and when a track ends
 *   it resets position to 0 and duration to 0 — making position/duration checks useless.
 *   The correct signal is: backend says `is_playing=true` but the SDK player is paused.
 *   When the user pauses, the backend is set to `is_playing=false` before (or simultaneously
 *   with) the SDK pause, so the combination (SDK paused + backend is_playing=true) uniquely
 *   identifies a natural track end.
 */
import { useEffect, useRef } from 'react';
import { spotifyPlayTrack, spotifyPause, spotifyResume, getSpotifyPlayer } from '../services/spotifyPlayer';

const JUST_STOPPED_MS = 2000;
/** How often to poll the SDK for track-end detection */
const POLL_MS = 1000;
/** Grace period after a new track starts before we check for track-end (avoids false positives during startup) */
const GRACE_MS = 4000;
/** Min time between consecutive onTrackEnd calls */
const THROTTLE_MS = 4000;

interface Props {
  playbackState: import('../types').PlaybackState | null | undefined;
  spotifyToken: string | null;
  lastStoppedAt: number | null;
  onTrackEnd?: () => void | Promise<void>;
}

export default function SpotifyPlaybackSync({ playbackState, spotifyToken, lastStoppedAt, onTrackEnd }: Props) {
  const spotifyActiveTrackIdRef = useRef<string | null>(null);
  const onTrackEndRef = useRef(onTrackEnd);
  const lastOnTrackEndAtRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);
  const trackStartedAtRef = useRef<number>(0);

  // Keep refs current without triggering re-renders
  onTrackEndRef.current = onTrackEnd;
  isPlayingRef.current = playbackState?.is_playing ?? false;

  // ── Main sync effect ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!playbackState || !spotifyToken) return;

    const currentTrackId = playbackState.current_track_id;
    const spotifyId = playbackState.current_track?.spotify_id ?? null;
    const isPlaying = playbackState.is_playing;
    const inJustStoppedWindow =
      lastStoppedAt != null && Date.now() - lastStoppedAt < JUST_STOPPED_MS;

    // No current track: pause and clear
    if (!currentTrackId || !spotifyId) {
      spotifyPause();
      spotifyActiveTrackIdRef.current = null;
      return;
    }

    if (inJustStoppedWindow) return;

    const sameTrack = spotifyActiveTrackIdRef.current === currentTrackId;

    if (!sameTrack) {
      const trackLabel =
        playbackState.current_track != null
          ? `${playbackState.current_track.title ?? '?'} – ${playbackState.current_track.artist ?? '?'} (${playbackState.current_track.album_title ?? '?'})`
          : currentTrackId;
      console.info('[Spotify] Syncing new track', {
        trackId: currentTrackId,
        spotifyId,
        label: trackLabel,
      });
      spotifyActiveTrackIdRef.current = currentTrackId;
      trackStartedAtRef.current = Date.now();
      spotifyPlayTrack(spotifyId).then((started) => {
        if (!started) {
          console.warn('[Spotify] Sync: play returned false — track may be skipped by track-end poll', {
            trackId: currentTrackId,
            spotifyId,
            label: trackLabel,
          });
        }
        if (!isPlaying) spotifyPause();
      });
      return;
    }

    // Same track: sync play/pause, but never resume if SDK is paused and position is at 0
    // (that means the track ended; let the poll call onTrackEnd instead)
    if (isPlaying) {
      const player = getSpotifyPlayer();
      player?.getCurrentState().then((state) => {
        if (!state) return; // no state = no active playback; don't resume
        const { paused, position } = state;
        // If paused and position is 0 (or near start), track may have just ended; don't resume
        if (paused && position <= 1000) return;
        if (!paused) return; // already playing; nothing to do
        spotifyResume();
      });
    } else {
      spotifyPause();
    }
  }, [
    playbackState?.current_track_id,
    playbackState?.is_playing,
    playbackState?.current_track?.spotify_id,
    spotifyToken,
    lastStoppedAt,
  ]);

  // ── Track-end poll ─────────────────────────────────────────────────────────
  // Polls SDK state; when the player is paused but the backend says is_playing=true,
  // the track ended naturally → call onTrackEnd.
  useEffect(() => {
    const hasSpotifyTrack =
      !!playbackState?.current_track_id &&
      !!playbackState?.current_track?.spotify_id &&
      !!spotifyToken;
    if (!hasSpotifyTrack) return;

    const id = setInterval(async () => {
      // Only check for track-end if backend says the track is still playing
      if (!isPlayingRef.current) return;

      // Respect grace period after track starts (SDK takes a moment to actually play)
      if (Date.now() - trackStartedAtRef.current < GRACE_MS) return;

      const player = getSpotifyPlayer();
      if (!player) return;

      const state = await player.getCurrentState();

      // If SDK is NOT paused, track is still playing — nothing to do
      if (state && !state.paused) return;

      // SDK is paused (or state is null) but backend says is_playing=true → track ended or never started
      if (Date.now() - lastOnTrackEndAtRef.current < THROTTLE_MS) return;
      lastOnTrackEndAtRef.current = Date.now();
      const trackLabel =
        playbackState?.current_track != null
          ? `${playbackState.current_track.title ?? '?'} – ${playbackState.current_track.artist ?? '?'} (${playbackState.current_track.album_title ?? '?'})`
          : playbackState?.current_track_id ?? '?';
      console.info('[Spotify] Track-end detected (SDK paused, backend playing) — advancing to next', {
        trackId: playbackState?.current_track_id,
        spotifyId: playbackState?.current_track?.spotify_id,
        label: trackLabel,
      });
      onTrackEndRef.current?.();
    }, POLL_MS);

    return () => clearInterval(id);
  }, [
    playbackState?.current_track_id,
    playbackState?.current_track?.spotify_id,
    spotifyToken,
  ]);

  return null;
}
