import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { adminApi } from '../services/api';
import styles from './Auth.module.css';

/** Admin Spotify OAuth callback: exchange code for tokens, then redirect to /admin */
export default function SpotifyCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    if (!code) {
      setError('Missing authorization code');
      return;
    }
    adminApi
      .postSpotifyCallback(code)
      .then(() => {
        navigate('/admin', { replace: true });
      })
      .catch((err) => {
        setError(err.response?.data?.detail ?? 'Failed to connect Spotify');
      });
  }, [searchParams, navigate]);

  if (error) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.card}>
          <h1>Spotify connection failed</h1>
          <p className={styles.error}>{error}</p>
          <button type="button" onClick={() => navigate('/admin', { replace: true })}>
            Back to Admin
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <h1>Connecting Spotify...</h1>
        <p>Please wait.</p>
      </div>
    </div>
  );
}
