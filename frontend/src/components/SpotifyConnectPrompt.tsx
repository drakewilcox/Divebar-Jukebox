import { useQuery } from '@tanstack/react-query';
import { spotifyListenerApi } from '../services/api';
import { useSpotifyStore } from '../stores/spotifyStore';
import styles from './SpotifyConnectPrompt.module.css';

export const SPOTIFY_RETURN_PATH_KEY = 'spotify_return_path';

export default function SpotifyConnectPrompt() {
  const accessToken = useSpotifyStore((s) => s.getAccessToken());

  const { data: status } = useQuery({
    queryKey: ['spotify-status'],
    queryFn: async () => {
      const res = await spotifyListenerApi.getStatus();
      return res.data;
    },
    retry: false,
  });

  if (!status?.configured || accessToken) return null;

  const authorizeUrl = spotifyListenerApi.getAuthorizeUrl();

  function handleAuthorize() {
    sessionStorage.setItem(SPOTIFY_RETURN_PATH_KEY, window.location.pathname + window.location.search);
    window.location.href = authorizeUrl;
  }

  return (
    <div className={styles.prompt} role="region" aria-label="Spotify authorization">
      <span className={styles.text}>
        Sign in with a Spotify Premium account to play music
      </span>
      <button
        type="button"
        className={styles.button}
        onClick={handleAuthorize}
      >
        Authorize
      </button>
    </div>
  );
}
