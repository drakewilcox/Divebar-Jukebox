import { useQuery } from '@tanstack/react-query';
import { spotifyListenerApi } from '../services/api';
import { useSpotifyStore } from '../stores/spotifyStore';
import styles from './SpotifyAuthBanner.module.css';

interface Props {
  /** When true (cloud-only mode), show a more prominent "Spotify required" notice */
  spotifyRequired?: boolean;
}

export default function SpotifyAuthBanner({ spotifyRequired = false }: Props) {
  const accessToken = useSpotifyStore((s) => s.getAccessToken());
  const { data: status } = useQuery({
    queryKey: ['spotify-status'],
    queryFn: async () => {
      const res = await spotifyListenerApi.getStatus();
      return res.data;
    },
    retry: false,
  });

  if (!status?.configured) return null;

  const authorizeUrl = spotifyListenerApi.getAuthorizeUrl();
  if (accessToken) {
    return (
      <div className={styles.connected} role="status" aria-label="Spotify connected">
        <span className={styles.connectedDot} aria-hidden />
        Spotify connected
      </div>
    );
  }

  return (
    <div
      className={spotifyRequired ? styles.bannerRequired : styles.banner}
      role="region"
      aria-label="Spotify authorization"
    >
      <span className={styles.text}>
        {spotifyRequired
          ? 'All playback is through Spotify. Sign in with a Spotify Premium account to play music.'
          : 'Some tracks can be played with Spotify. You need a Spotify Premium account.'}
      </span>
      <a href={authorizeUrl} className={styles.button} rel="noopener noreferrer">
        Authorize with Spotify
      </a>
    </div>
  );
}
