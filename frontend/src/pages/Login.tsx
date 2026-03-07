import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { authApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import styles from './Auth.module.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useAuthStore((s) => s.setAuth);
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/admin';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await authApi.login(email, password);
      setAuth(data.access_token, data.user);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const res = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { status?: number; data?: { detail?: string } } }).response
        : undefined;
      const status = res?.status;
      const msg = res?.data?.detail;
      if (status === 404) {
        setError('Cannot reach the server (404). On the deployed site, set VITE_API_BASE_URL to your backend URL and redeploy the frontend.');
      } else if (status !== undefined) {
        setError(Array.isArray(msg) ? msg.join(' ') : (msg ? String(msg) : `Request failed (${status})`));
      } else {
        const message = err instanceof Error ? err.message : String(err ?? 'Login failed');
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <h1>Admin Login</h1>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </label>
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <p className={styles.footer}>
          Don't have an account? <Link to="/register">Register</Link>
        </p>
        <p className={styles.hint}>
          If nothing happens when you click Sign in, open DevTools (F12) → Console and try again. On the deployed site, set <code>VITE_API_BASE_URL</code> to your backend URL and redeploy the frontend.
        </p>
      </div>
    </div>
  );
}
