// Audio playback service using HTML5 Audio API
import { playbackApi } from './api';

/** Convert ReplayGain dB to linear multiplier (e.g. -5 dB → ~0.56) */
function replaygainToMultiplier(db: number): number {
  return Math.pow(10, db / 20);
}

class AudioService {
  private audio: HTMLAudioElement;
  private currentTrackId: string | null = null;
  private currentReplaygainDb: number | null = null;
  private baseVolume = 100; // 0-100, user/master volume

  constructor() {
    this.audio = new Audio();
    this.setupEventListeners();
  }
  
  private setupEventListeners() {
    this.audio.addEventListener('ended', () => {
      // Track ended, trigger next track event
      console.log('Track ended');
      window.dispatchEvent(new CustomEvent('track-ended'));
    });
    
    this.audio.addEventListener('error', (e) => {
      console.error('Audio error:', e);
    });
    
    this.audio.addEventListener('timeupdate', () => {
      // Current time updated
      // Could be used to sync position with backend
    });
    
    this.audio.addEventListener('loadstart', () => {
      console.log('Loading track:', this.currentTrackId);
    });
    
    this.audio.addEventListener('canplay', () => {
      console.log('Track ready to play');
    });
  }
  
  loadTrack(trackId: string, replaygainDb?: number | null) {
    this.currentTrackId = trackId;
    this.currentReplaygainDb = replaygainDb ?? null;
    this.audio.src = playbackApi.getStreamUrl(trackId);
    this.applyVolume();
  }
  
  play() {
    return this.audio.play();
  }
  
  pause() {
    this.audio.pause();
  }
  
  stop() {
    this.audio.pause();
    this.audio.currentTime = 0;
  }
  
  seek(timeInSeconds: number) {
    this.audio.currentTime = timeInSeconds;
  }
  
  setVolume(volume: number) {
    this.baseVolume = Math.max(0, Math.min(100, volume));
    this.applyVolume();
  }

  private applyVolume() {
    const base = this.baseVolume / 100;
    const mult =
      this.currentReplaygainDb != null
        ? replaygainToMultiplier(this.currentReplaygainDb)
        : 1;
    this.audio.volume = Math.max(0, Math.min(1, base * mult));
  }
  
  getCurrentTime(): number {
    return this.audio.currentTime;
  }
  
  getDuration(): number {
    return this.audio.duration;
  }
  
  isPlaying(): boolean {
    return !this.audio.paused;
  }
}

export const audioService = new AudioService();
export default audioService;
