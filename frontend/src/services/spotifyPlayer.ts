/**
 * Spotify Web Playback SDK wrapper for listener playback.
 * Load the SDK script, create a player when we have a token, play by URI when backend says so.
 */
declare global {
  interface Window {
    Spotify?: {
      Player: new (opts: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume?: number;
      }) => SpotifyPlayerInstance;
    };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

/** SDK state: position and duration are in milliseconds (see Web Playback SDK reference). */
interface SpotifyPlayerState {
  position: number;
  duration: number;
  paused: boolean;
  track_window: { current_track: { uri: string } };
}

interface SpotifyPlayerInstance {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(event: string, callback: (state: SpotifyPlayerState) => void): void;
  removeListener(event: string): void;
  getCurrentState(): Promise<SpotifyPlayerState | null>;
  activateElement(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  togglePlay(): Promise<void>;
  seek(position_ms: number): Promise<void>;
}

const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';
const PLAYER_NAME = 'Dive Bar Jukebox';

let scriptLoaded = false;
let playerInstance: SpotifyPlayerInstance | null = null;
let resolveReady: (() => void) | null = null;
const readyPromise = new Promise<void>((resolve) => {
  resolveReady = resolve;
});

/** Device ID from the 'ready' event; needed to transfer playback to this player. */
let spotifyDeviceId: string | null = null;

const DEVICE_READY_POLL_MS = 150;
const DEVICE_READY_TIMEOUT_MS = 12000;

/** After reconnect(), wait for 'ready' to fire and set spotifyDeviceId. */
async function waitForDeviceId(): Promise<boolean> {
  const deadline = Date.now() + DEVICE_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (spotifyDeviceId) return true;
    await new Promise((r) => setTimeout(r, DEVICE_READY_POLL_MS));
  }
  return false;
}

/** Reconnect the player to get a fresh device_id (e.g. after 404 Device not found). */
async function reconnectPlayer(): Promise<boolean> {
  const player = getSpotifyPlayer();
  if (!player) return false;
  spotifyDeviceId = null;
  try {
    player.disconnect();
  } catch {
    // ignore
  }
  const connected = await player.connect();
  if (!connected) return false;
  return waitForDeviceId();
}

/** Stored so we can get a token for the Transfer Playback API call. */
let getTokenRef: (() => Promise<string | null>) | null = null;

/** Resolves when the Spotify player is ready (after 'ready' event, so we have device_id). Rejected after timeoutMs if never ready. */
let playerConnectedResolve: (() => void) | null = null;
const playerConnectedPromise = new Promise<void>((resolve) => {
  playerConnectedResolve = resolve;
});

let trackEndPollInterval: ReturnType<typeof setInterval> | null = null;
let lastTrackEndDispatch = 0;
function clearTrackEndPoll() {
  if (trackEndPollInterval != null) {
    clearInterval(trackEndPollInterval);
    trackEndPollInterval = null;
  }
}
function dispatchTrackEndedThrottled() {
  if (Date.now() - lastTrackEndDispatch < 2000) return;
  lastTrackEndDispatch = Date.now();
  window.dispatchEvent(new CustomEvent('track-ended'));
}

function loadScript(): Promise<void> {
  if (scriptLoaded && window.Spotify) {
    resolveReady?.();
    return readyPromise;
  }
  return new Promise((resolve, reject) => {
    if (window.Spotify) {
      scriptLoaded = true;
      resolveReady?.();
      resolve();
      return;
    }
    const existing = document.querySelector(`script[src="${SDK_URL}"]`);
    if (existing) {
      if (window.Spotify) {
        scriptLoaded = true;
        resolveReady?.();
        resolve();
      } else {
        window.onSpotifyWebPlaybackSDKReady = () => {
          scriptLoaded = true;
          resolveReady?.();
          resolve();
        };
      }
      return;
    }
    window.onSpotifyWebPlaybackSDKReady = () => {
      scriptLoaded = true;
      resolveReady?.();
      resolve();
    };
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.onerror = () => reject(new Error('Failed to load Spotify SDK'));
    document.head.appendChild(script);
  });
}

export async function initSpotifyPlayer(getToken: () => Promise<string | null>): Promise<boolean> {
  await loadScript();
  if (!window.Spotify) return false;
  getTokenRef = getToken;
  spotifyDeviceId = null;
  if (playerInstance) {
    try {
      playerInstance.disconnect();
    } catch {
      // ignore
    }
    playerInstance = null;
  }
  const player = new window.Spotify.Player({
    name: PLAYER_NAME,
    getOAuthToken: (cb) => {
      getToken().then((t) => {
        if (t) cb(t);
      });
    },
    volume: 1,
  });
  playerInstance = player;
  player.addListener('ready', (payload: unknown) => {
    const device_id = (payload as { device_id?: string })?.device_id;
    if (device_id) {
      spotifyDeviceId = device_id;
      playerConnectedResolve?.();
    }
  });
  let lastState: SpotifyPlayerState | null = null;
  player.addListener('player_state_changed', (state: SpotifyPlayerState | undefined) => {
    if (!state?.track_window?.current_track) return;
    const { position, duration, paused } = state;
    const wasPlaying = lastState && !lastState.paused;
    const nowPaused = paused;
    const atEnd = duration > 0 && position >= duration - 800;
    const atStart = position <= 800;
    if (lastState) {
      if (wasPlaying && nowPaused && (atEnd || atStart)) {
        dispatchTrackEndedThrottled();
      } else if (nowPaused && atEnd) {
        dispatchTrackEndedThrottled();
      }
    }
    lastState = state;
  });
  clearTrackEndPoll();
  trackEndPollInterval = setInterval(async () => {
    const p = getSpotifyPlayer();
    if (!p) return;
    const state = await p.getCurrentState();
    if (!state?.track_window?.current_track) return;
    const { position, duration, paused } = state;
    if (paused && duration > 0 && (position >= duration - 1000 || position <= 500)) {
      dispatchTrackEndedThrottled();
    }
  }, 1500);
  player.addListener('autoplay_failed', () => {
    console.warn('Spotify: autoplay_failed — ensure user has clicked (e.g. Play) in this tab.');
  });
  const connected = await player.connect();
  if (!connected) {
    clearTrackEndPoll();
    playerInstance = null;
    getTokenRef = null;
    spotifyDeviceId = null;
    return false;
  }
  return true;
}

export function getSpotifyPlayer(): SpotifyPlayerInstance | null {
  return playerInstance;
}

const PLAYER_WAIT_MS = 12000;

/** Wait for the Spotify player to be connected and have a device_id (ready for playback). */
export function waitForSpotifyPlayer(timeoutMs: number = PLAYER_WAIT_MS): Promise<boolean> {
  const p = getSpotifyPlayer();
  if (!p) {
    return Promise.race([
      playerConnectedPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Spotify player not ready')), timeoutMs)
      ),
    ]).then(() => !!getSpotifyPlayer(), () => false);
  }
  if (spotifyDeviceId) return Promise.resolve(true);
  return waitForDeviceId()
    .then(() => !!spotifyDeviceId)
    .catch(() => false);
}

function isDeviceNotFoundError(res: Response, body: { error?: { status?: number; message?: string } }): boolean {
  return res.status === 404 && body?.error?.message?.toLowerCase().includes('device not found');
}

/** Delay after reconnect so Spotify's API can register the new device. */
const POST_RECONNECT_DELAY_MS = 1200;
const POST_RECONNECT_RETRY2_DELAY_MS = 1500;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Transfer the user's playback to our Web Playback SDK device. Requires user-modify-playback-state. */
async function transferPlaybackToThisDevice(accessToken: string): Promise<boolean> {
  if (!spotifyDeviceId) return false;
  const doPut = async (): Promise<Response> =>
    fetch('https://api.spotify.com/v1/me/player', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ device_ids: [spotifyDeviceId!], play: false }),
    });

  try {
    let res = await doPut();
    if (res.ok || res.status === 204) return true;
    const text = await res.text();
    const body = (() => { try { return JSON.parse(text) as { error?: { status?: number; message?: string } }; } catch { return {}; } })();
    if (!isDeviceNotFoundError(res, body)) {
      console.warn('Spotify transfer playback failed:', res.status, text);
      return false;
    }
    const reconnected = await reconnectPlayer();
    if (!reconnected || !spotifyDeviceId) return false;
    await delay(POST_RECONNECT_DELAY_MS);
    res = await doPut();
    if (res.ok || res.status === 204) return true;
    const retry1Text = await res.text();
    if (isDeviceNotFoundError(res, (() => { try { return JSON.parse(retry1Text); } catch { return {}; } })())) {
      await delay(POST_RECONNECT_RETRY2_DELAY_MS);
      res = await doPut();
      if (res.ok || res.status === 204) return true;
    }
    console.warn('[Spotify] Transfer playback failed:', res.status, retry1Text);
    return false;
  } catch (e) {
    console.warn('[Spotify] Transfer playback error:', e);
    return false;
  }
}

/** Start playback of a track via Web API (SDK has no play() method). Requires device_id and user-modify-playback-state. */
async function startPlaybackViaApi(accessToken: string, uri: string): Promise<boolean> {
  if (!spotifyDeviceId) return false;
  const doPlay = async (): Promise<Response> =>
    fetch(`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(spotifyDeviceId!)}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uris: [uri] }),
    });

  try {
    let res = await doPlay();
    if (res.ok || res.status === 204) return true;
    const text = await res.text();
    const body = (() => { try { return JSON.parse(text) as { error?: { status?: number; message?: string } }; } catch { return {}; } })();
    if (!isDeviceNotFoundError(res, body)) {
      console.warn('[Spotify] Start playback failed', { uri, status: res.status, response: text });
      return false;
    }
    const reconnected = await reconnectPlayer();
    if (!reconnected || !spotifyDeviceId) return false;
    await delay(POST_RECONNECT_DELAY_MS);
    res = await doPlay();
    if (res.ok || res.status === 204) return true;
    const retry1Text = await res.text();
    if (isDeviceNotFoundError(res, (() => { try { return JSON.parse(retry1Text); } catch { return {}; } })())) {
      await delay(POST_RECONNECT_RETRY2_DELAY_MS);
      res = await doPlay();
      if (res.ok || res.status === 204) return true;
    }
    console.warn('[Spotify] Start playback failed (after retries)', { uri, status: res.status, response: retry1Text });
    return false;
  } catch (e) {
    console.warn('[Spotify] Start playback error', { uri, error: e });
    return false;
  }
}

/** Disable repeat so Spotify doesn't auto-replay the track when it ends. */
async function setRepeatOff(accessToken: string): Promise<void> {
  if (!spotifyDeviceId) return;
  try {
    await fetch(
      `https://api.spotify.com/v1/me/player/repeat?state=off&device_id=${encodeURIComponent(spotifyDeviceId)}`,
      { method: 'PUT', headers: { Authorization: `Bearer ${accessToken}` } }
    );
  } catch {
    // non-critical
  }
}

export interface SpotifyPlayTrackOptions {
  /** When true, skip transfer playback (use when we just paused on this device and are switching tracks). */
  skipTransfer?: boolean;
}

/** Serialize play attempts so we don't bombard the API when queue/state updates rapidly (e.g. Hit adds 10 songs). */
let playSerialPromise: Promise<boolean> = Promise.resolve(false);

/** When player isn't ready on first attempt, wait and retry once (e.g. right after adding to queue). */
const PLAYER_NOT_READY_RETRY_DELAY_MS = 2500;
const PLAYER_RETRY_WAIT_MS = 8000;

export async function spotifyPlayTrack(
  spotifyId: string,
  options?: SpotifyPlayTrackOptions
): Promise<boolean> {
  const uri = `spotify:track:${spotifyId}`;
  const previous = playSerialPromise;
  let resolveCurrent: (value: boolean) => void = () => {};
  playSerialPromise = new Promise<boolean>((r) => { resolveCurrent = r; });
  await previous;
  try {
    let ok = await waitForSpotifyPlayer();
    let player = getSpotifyPlayer();
    if (!player || !ok) {
      console.warn('[Spotify] Player not ready on first attempt, retrying in 2.5s…', { spotifyId, uri });
      await delay(PLAYER_NOT_READY_RETRY_DELAY_MS);
      ok = await waitForSpotifyPlayer(PLAYER_RETRY_WAIT_MS);
      player = getSpotifyPlayer();
    }
    if (!player || !ok) {
      console.warn('[Spotify] Play aborted: player not ready (after retry)', { spotifyId, uri });
      resolveCurrent(false);
      return false;
    }
    const token = getTokenRef ? await getTokenRef() : null;
    if (!token || !spotifyDeviceId) {
      console.warn('[Spotify] Play aborted: no token or device', { spotifyId, uri });
      resolveCurrent(false);
      return false;
    }
    if (!options?.skipTransfer) {
      const transferred = await transferPlaybackToThisDevice(token);
      if (!transferred) {
        console.warn('[Spotify] Play aborted: transfer failed', { spotifyId, uri });
      }
    }
    await player.activateElement();
    const started = await startPlaybackViaApi(token, uri);
    if (started) {
      await setRepeatOff(token);
      console.info('[Spotify] Play started', { spotifyId, uri });
    } else {
      console.warn('[Spotify] Play failed (startPlaybackViaApi returned false)', { spotifyId, uri });
    }
    resolveCurrent(started);
    return started;
  } catch (e) {
    console.error('[Spotify] Play exception', { spotifyId, uri, error: e });
    resolveCurrent(false);
    return false;
  }
}

export async function spotifyPause(): Promise<void> {
  const player = getSpotifyPlayer();
  if (player) {
    try {
      await player.pause();
    } catch (e) {
      console.error('Spotify pause failed:', e);
    }
  }
}

/** Seek to position in the current track. position_ms in milliseconds (per SDK). */
export async function spotifySeek(position_ms: number): Promise<void> {
  const player = getSpotifyPlayer();
  if (player) {
    try {
      await player.seek(position_ms);
    } catch (e) {
      console.error('Spotify seek failed:', e);
    }
  }
}

export async function spotifyResume(): Promise<void> {
  const player = getSpotifyPlayer();
  if (player) {
    try {
      await player.resume();
    } catch (e) {
      console.error('Spotify resume failed:', e);
    }
  }
}

export function disconnectSpotifyPlayer(): void {
  clearTrackEndPoll();
  if (playerInstance) {
    try {
      playerInstance.disconnect();
    } catch {
      // ignore
    }
    playerInstance = null;
  }
  spotifyDeviceId = null;
  getTokenRef = null;
}

export function isSpotifyPlayerReady(): boolean {
  return getSpotifyPlayer() != null;
}
