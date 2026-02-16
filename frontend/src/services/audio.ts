// Audio playback service using HTML5 Audio API
import { playbackApi } from './api';

class AudioService {
  private audio: HTMLAudioElement;
  private currentTrackId: string | null = null;
  
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
  
  loadTrack(trackId: string) {
    this.currentTrackId = trackId;
    this.audio.src = playbackApi.getStreamUrl(trackId);
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
    // Volume is 0-1 for audio element, but 0-100 in our API
    this.audio.volume = Math.max(0, Math.min(1, volume / 100));
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
