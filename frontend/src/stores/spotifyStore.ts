import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const SPOTIFY_REFRESH_KEY = 'spotify_refresh_token';

interface SpotifyState {
  accessToken: string | null;
  refreshToken: string | null;
  /** Set tokens (e.g. from OAuth callback hash). Persists refresh token. */
  setTokens: (accessToken: string, refreshToken?: string | null) => void;
  clear: () => void;
  /** Return current access token; call refresh first if you need a valid one. */
  getAccessToken: () => string | null;
  /** Refresh access token using stored refresh_token. Returns new access token or null. */
  refreshAccessToken: () => Promise<string | null>;
}
/** Expose refreshToken for components that need to check "have we a chance to get a token?" */
export function hasSpotifyRefreshToken(): boolean {
  const r = useSpotifyStore.getState().refreshToken;
  if (r) return true;
  if (typeof localStorage !== 'undefined' && localStorage.getItem(SPOTIFY_REFRESH_KEY)) return true;
  return false;
}

export const useSpotifyStore = create<SpotifyState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,

      setTokens: (accessToken, refreshToken) => {
        set({ accessToken, refreshToken: refreshToken ?? null });
        if (refreshToken && typeof localStorage !== 'undefined') {
          localStorage.setItem(SPOTIFY_REFRESH_KEY, refreshToken);
        }
      },

      clear: () => {
        set({ accessToken: null, refreshToken: null });
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(SPOTIFY_REFRESH_KEY);
        }
      },

      getAccessToken: () => get().accessToken,

      refreshAccessToken: async () => {
        const refreshToken =
          get().refreshToken ?? (typeof localStorage !== 'undefined' ? localStorage.getItem(SPOTIFY_REFRESH_KEY) : null);
        if (!refreshToken) return null;
        try {
          const base = import.meta.env.VITE_API_BASE_URL ?? '';
          const res = await fetch(`${base}/api/auth/spotify/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
          });
          if (!res.ok) return null;
          const data = await res.json();
          const accessToken = data.access_token;
          if (accessToken) set({ accessToken });
          return accessToken ?? null;
        } catch {
          return null;
        }
      },
    }),
    {
      name: 'spotify-listener',
      partialize: (s) => ({ refreshToken: s.refreshToken }),
    }
  )
);

/** Parse window hash for spotify_access_token and spotify_refresh_token (from OAuth callback). */
export function parseSpotifyHash(): { accessToken: string; refreshToken?: string } | { error: string } | null {
  if (typeof window === 'undefined' || !window.location.hash) return null;
  const hash = window.location.hash.slice(1);
  const params = new URLSearchParams(hash);
  const error = params.get('spotify_error');
  if (error) return { error };
  const accessToken = params.get('spotify_access_token');
  const refreshToken = params.get('spotify_refresh_token') ?? undefined;
  if (!accessToken) return null;
  return { accessToken, refreshToken };
}

/** Remove spotify_* params from current URL hash (call after reading). */
export function clearSpotifyHash(): void {
  if (typeof window === 'undefined') return;
  const hash = window.location.hash.slice(1);
  const params = new URLSearchParams(hash);
  params.delete('spotify_access_token');
  params.delete('spotify_refresh_token');
  params.delete('spotify_error');
  const rest = params.toString();
  window.history.replaceState(null, '', rest ? `#${rest}` : window.location.pathname + window.location.search);
}
