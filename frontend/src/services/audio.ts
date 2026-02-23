// Audio playback service using HTML5 Audio API (two elements for crossfade)
import { playbackApi } from './api';

/** Start crossfade this many seconds before (duration - crossfade) so we beat the 'ended' event */
const CROSSFADE_SAFETY_MARGIN_SEC = 1.5;
const DEBUG_CROSSFADE = true;

/** Convert ReplayGain dB to linear multiplier (e.g. -5 dB → ~0.56) */
function replaygainToMultiplier(db: number): number {
  return Math.pow(10, db / 20);
}

function getCrossfadeSecondsFromStorage(): number {
  const x = typeof localStorage !== 'undefined' ? localStorage.getItem('crossfadeSeconds') : null;
  const n = x != null ? parseInt(x, 10) : NaN;
  return Number.isNaN(n) || n < 0 || n > 12 ? 0 : n;
}

class AudioService {
  private audioA: HTMLAudioElement;
  private audioB: HTMLAudioElement;
  private currentIndex: 0 | 1 = 0;
  private currentTrackId: string | null = null;
  private currentReplaygainDb: number | null = null;
  private baseVolume = 100;
  private collectionSlug: string | null = null;
  private crossfadeSeconds = 0;
  private crossfadeTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private scheduleFallbackId: ReturnType<typeof setTimeout> | null = null;
  private crossfadeAnimationId: number | null = null;
  private isCrossfading = false;
  /** Duration (seconds) used for the current crossfade schedule; used to reschedule on seek */
  private scheduledDurationSec = 0;
  /** Gapless: next track preloaded when apply_crossfade is false (same-album consecutive) */
  private gaplessNextTrackId: string | null = null;
  private gaplessNextReplaygainDb: number | null = null;

  constructor() {
    this.audioA = new Audio();
    this.audioB = new Audio();
    this.crossfadeSeconds = getCrossfadeSecondsFromStorage();
    this.setupEventListeners();
    if (typeof window !== 'undefined') {
      window.addEventListener('crossfade-changed', this.handleCrossfadeChanged as EventListener);
    }
  }

  private get currentAudio(): HTMLAudioElement {
    return this.currentIndex === 0 ? this.audioA : this.audioB;
  }

  private get nextAudio(): HTMLAudioElement {
    return this.currentIndex === 0 ? this.audioB : this.audioA;
  }

  private handleCrossfadeChanged = (e: CustomEvent<number>) => {
    const v = e.detail;
    this.crossfadeSeconds = Number.isNaN(v) || v < 0 || v > 12 ? 0 : v;
  };

  private setupEventListeners() {
    const onEnded = (e: Event) => {
      if (this.isCrossfading) return;
      const el = e.target as HTMLAudioElement;
      if (el === this.currentAudio && this.gaplessNextTrackId) {
        this.finishGaplessSwitch();
        return;
      }
      window.dispatchEvent(new CustomEvent('track-ended'));
    };
    this.audioA.addEventListener('ended', onEnded);
    this.audioB.addEventListener('ended', onEnded);
    [this.audioA, this.audioB].forEach((el) => {
      el.addEventListener('error', (e) => console.error('Audio error:', e));
    });
  }

  getCrossfadeSeconds(): number {
    return this.crossfadeSeconds;
  }

  /** Current track id (for UI to avoid reloading after gapless/crossfade). */
  getCurrentTrackId(): string | null {
    return this.currentTrackId;
  }

  /**
   * @param durationMs Optional track duration in ms; used to schedule crossfade when the audio element doesn't report duration (e.g. some streams).
   */
  loadTrack(trackId: string, replaygainDb?: number | null, collectionSlug?: string | null, durationMs?: number | null) {
    if (this.currentTrackId === trackId && this.currentAudio.src) {
      if (collectionSlug != null) this.collectionSlug = collectionSlug;
      // After a crossfade we don't reload; reschedule for this track's duration so seek uses the right length
      if (durationMs != null && durationMs > 0) {
        this.scheduledDurationSec = durationMs / 1000;
        this.rescheduleCrossfadeFromPosition(this.currentAudio.currentTime);
      }
      return;
    }
    this.clearCrossfadeSchedule();
    this.gaplessNextTrackId = null;
    this.gaplessNextReplaygainDb = null;
    this.nextAudio.pause();
    this.nextAudio.removeAttribute('src');
    this.nextAudio.load();
    this.currentTrackId = trackId;
    this.currentReplaygainDb = replaygainDb ?? null;
    if (collectionSlug != null) this.collectionSlug = collectionSlug;
    if (DEBUG_CROSSFADE) {
      console.log('[crossfade] loadTrack:', { trackId, collectionSlug: this.collectionSlug, durationMs: durationMs ?? 'none' });
    }
    this.currentAudio.src = playbackApi.getStreamUrl(trackId);
    this.applyVolumeTo(this.currentAudio, this.currentReplaygainDb);
    const fallbackDurationSec = durationMs != null && durationMs > 0 ? durationMs / 1000 : 0;
    this.currentAudio.addEventListener('loadedmetadata', () => {
      if (this.scheduleFallbackId != null) {
        clearTimeout(this.scheduleFallbackId);
        this.scheduleFallbackId = null;
      }
      const elDur = this.currentAudio.duration;
      const dur = Number.isFinite(elDur) && elDur > 0 ? elDur : fallbackDurationSec;
      if (dur > 0) this.scheduleCrossfade(dur);
      if (this.crossfadeTimeoutId == null && this.collectionSlug) {
        this.tryPreloadGapless();
      }
    }, { once: true });
    if (fallbackDurationSec > 0) {
      this.scheduleFallbackId = setTimeout(() => {
        this.scheduleFallbackId = null;
        if (this.crossfadeTimeoutId == null && this.currentTrackId === trackId) {
          this.scheduleCrossfade(fallbackDurationSec);
        }
        if (this.crossfadeTimeoutId == null && this.currentTrackId === trackId && this.collectionSlug) {
          this.tryPreloadGapless();
        }
      }, 600);
    }
  }

  play() {
    return this.currentAudio.play();
  }

  pause() {
    this.currentAudio.pause();
    this.nextAudio.pause();
  }

  stop() {
    this.clearCrossfadeSchedule();
    this.gaplessNextTrackId = null;
    this.gaplessNextReplaygainDb = null;
    this.currentAudio.pause();
    this.currentAudio.currentTime = 0;
    this.nextAudio.pause();
    this.nextAudio.currentTime = 0;
    this.isCrossfading = false;
  }

  seek(timeInSeconds: number) {
    this.currentAudio.currentTime = timeInSeconds;
    this.rescheduleCrossfadeFromPosition(timeInSeconds);
  }

  setVolume(volume: number) {
    this.baseVolume = Math.max(0, Math.min(100, volume));
    this.applyVolumeTo(this.currentAudio, this.currentReplaygainDb);
    if (!this.isCrossfading) {
      this.applyVolumeTo(this.nextAudio, null);
    }
  }

  private applyVolumeTo(el: HTMLAudioElement, replaygainDb: number | null) {
    const base = this.baseVolume / 100;
    const mult = replaygainDb != null ? replaygainToMultiplier(replaygainDb) : 1;
    el.volume = Math.max(0, Math.min(1, base * mult));
  }

  getCurrentTime(): number {
    return this.currentAudio.currentTime;
  }

  getDuration(): number {
    return this.currentAudio.duration;
  }

  isPlaying(): boolean {
    return !this.currentAudio.paused || !this.nextAudio.paused;
  }

  private clearCrossfadeSchedule() {
    if (this.crossfadeTimeoutId != null) {
      clearTimeout(this.crossfadeTimeoutId);
      this.crossfadeTimeoutId = null;
    }
    if (this.scheduleFallbackId != null) {
      clearTimeout(this.scheduleFallbackId);
      this.scheduleFallbackId = null;
    }
    if (this.crossfadeAnimationId != null) {
      cancelAnimationFrame(this.crossfadeAnimationId);
      this.crossfadeAnimationId = null;
    }
  }

  /** Preload next track when backend says apply_crossfade is false (same-album consecutive). */
  private async tryPreloadGapless() {
    if (!this.collectionSlug || this.crossfadeTimeoutId != null) return;
    try {
      const res = await playbackApi.getNextTransition(this.collectionSlug);
      const data = res.data;
      if (data.apply_crossfade || !data.next_track_id) return;
      if (DEBUG_CROSSFADE) {
        console.log('[gapless] Preloading next track:', data.next_track_id);
      }
      const nextEl = this.nextAudio;
      nextEl.src = playbackApi.getStreamUrl(data.next_track_id);
      nextEl.load();
      this.gaplessNextTrackId = data.next_track_id;
      this.gaplessNextReplaygainDb = data.next_replaygain_db ?? null;
      this.applyVolumeTo(nextEl, this.gaplessNextReplaygainDb);
    } catch (err) {
      console.error('Gapless preload failed:', err);
    }
  }

  /** Switch to preloaded track immediately on ended (gapless). */
  private async finishGaplessSwitch() {
    if (!this.gaplessNextTrackId) return;
    const nextTrackId = this.gaplessNextTrackId;
    const nextReplaygainDb = this.gaplessNextReplaygainDb;
    this.gaplessNextTrackId = null;
    this.gaplessNextReplaygainDb = null;
    this.currentAudio.pause();
    this.currentAudio.currentTime = 0;
    this.currentAudio.removeAttribute('src');
    this.currentAudio.load();
    this.currentIndex = this.currentIndex === 0 ? 1 : 0;
    this.currentTrackId = nextTrackId;
    this.currentReplaygainDb = nextReplaygainDb;
    this.applyVolumeTo(this.currentAudio, nextReplaygainDb);
    this.currentAudio.play().catch((e) => console.error('Gapless play failed:', e));
    if (this.collectionSlug) {
      try {
        await playbackApi.skip(this.collectionSlug);
      } catch (e) {
        console.error('Skip after gapless failed:', e);
      }
    }
    window.dispatchEvent(new CustomEvent('crossfade-complete', { detail: { collectionSlug: this.collectionSlug } }));
    this.tryPreloadGapless();
  }

  private scheduleCrossfade(durationSeconds: number) {
    this.clearCrossfadeSchedule();
    const cf = getCrossfadeSecondsFromStorage();
    this.crossfadeSeconds = cf;
    if (cf <= 0 || !this.collectionSlug) {
      this.scheduledDurationSec = 0;
      if (DEBUG_CROSSFADE) {
        console.log('[crossfade] Not scheduling:', { cf, hasSlug: !!this.collectionSlug });
      }
      return;
    }
    this.scheduledDurationSec = durationSeconds;
    const startAt = Math.max(0, durationSeconds - cf - CROSSFADE_SAFETY_MARGIN_SEC);
    if (DEBUG_CROSSFADE) {
      console.log('[crossfade] Scheduled in', startAt.toFixed(1), 's (duration=', durationSeconds.toFixed(1), 'cf=', cf, 'slug=', this.collectionSlug, ')');
    }
    this.crossfadeTimeoutId = setTimeout(() => {
      this.crossfadeTimeoutId = null;
      this.startCrossfade();
    }, startAt * 1000);
  }

  /** Reschedule crossfade based on current position (e.g. after user seeks). */
  private rescheduleCrossfadeFromPosition(positionSec: number) {
    if (this.scheduledDurationSec <= 0 || !this.collectionSlug) return;
    const cf = getCrossfadeSecondsFromStorage();
    if (cf <= 0) return;
    this.clearCrossfadeSchedule();
    const crossfadeStartSec = this.scheduledDurationSec - cf - CROSSFADE_SAFETY_MARGIN_SEC;
    const timeUntilStart = crossfadeStartSec - positionSec;
    if (timeUntilStart <= 0) {
      if (DEBUG_CROSSFADE) console.log('[crossfade] Seek past crossfade point, starting now');
      this.startCrossfade();
      return;
    }
    if (DEBUG_CROSSFADE) {
      console.log('[crossfade] Rescheduled after seek: in', timeUntilStart.toFixed(1), 's');
    }
    this.crossfadeSeconds = cf;
    this.crossfadeTimeoutId = setTimeout(() => {
      this.crossfadeTimeoutId = null;
      this.startCrossfade();
    }, timeUntilStart * 1000);
  }

  private async startCrossfade() {
    if (DEBUG_CROSSFADE) console.log('[crossfade] startCrossfade called, slug=', this.collectionSlug);
    if (!this.collectionSlug) return;
    try {
      const res = await playbackApi.getNextTransition(this.collectionSlug);
      const data = res.data;
      if (DEBUG_CROSSFADE) {
        console.log('[crossfade] API response:', { next_track_id: data.next_track_id, apply_crossfade: data.apply_crossfade });
      }
      if (!data.apply_crossfade || !data.next_track_id) {
        if (DEBUG_CROSSFADE) console.log('[crossfade] Skipping fade (apply_crossfade or next_track_id false/null)');
        return;
      }
      const cf = this.crossfadeSeconds;
      if (cf <= 0) return;
      if (DEBUG_CROSSFADE) console.log('[crossfade] Starting fade to', data.next_track_id);
      this.isCrossfading = true;
      const nextEl = this.nextAudio;
      nextEl.src = playbackApi.getStreamUrl(data.next_track_id);
      const nextGain = data.next_replaygain_db ?? null;
      this.applyVolumeTo(nextEl, null);
      nextEl.volume = 0;
      await nextEl.play();
      const startTime = performance.now();
      const durationMs = cf * 1000;
      const currentEl = this.currentAudio;
      const currentStartVol = currentEl.volume;

      const tick = () => {
        const elapsed = performance.now() - startTime;
        const t = Math.min(1, elapsed / durationMs);
        const ease = t * (2 - t);
        nextEl.volume = Math.max(0, Math.min(1, ease * (this.baseVolume / 100) * (nextGain != null ? replaygainToMultiplier(nextGain) : 1)));
        currentEl.volume = Math.max(0, currentStartVol * (1 - ease));
        if (t < 1) {
          this.crossfadeAnimationId = requestAnimationFrame(tick);
        } else {
          this.crossfadeAnimationId = null;
          this.finishCrossfade(data.next_track_id ?? '', nextGain);
        }
      };
      this.crossfadeAnimationId = requestAnimationFrame(tick);
    } catch (err) {
      console.error('Crossfade failed:', err);
      this.isCrossfading = false;
    }
  }

  private async finishCrossfade(nextTrackId: string, nextReplaygainDb: number | null) {
    this.currentAudio.pause();
    this.currentAudio.currentTime = 0;
    this.currentIndex = this.currentIndex === 0 ? 1 : 0;
    this.currentTrackId = nextTrackId;
    this.currentReplaygainDb = nextReplaygainDb;
    this.applyVolumeTo(this.currentAudio, nextReplaygainDb);
    this.isCrossfading = false;
    if (this.collectionSlug) {
      try {
        await playbackApi.skip(this.collectionSlug);
      } catch (e) {
        console.error('Skip after crossfade failed:', e);
      }
    }
    window.dispatchEvent(new CustomEvent('crossfade-complete', { detail: { collectionSlug: this.collectionSlug } }));
  }
}

export const audioService = new AudioService();
export default audioService;
