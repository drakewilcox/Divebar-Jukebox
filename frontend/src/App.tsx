import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import JukeboxPage from './pages/JukeboxPage';
import AdminPanel from './components/Admin/AdminPanel';
import SpotifyCallbackPage from './pages/SpotifyCallbackPage';
import { parseSpotifyHash, clearSpotifyHash, useSpotifyStore } from './stores/spotifyStore';
import { SPOTIFY_RETURN_PATH_KEY } from './components/SpotifyConnectPrompt';
import styles from './App.module.css';

/** Handles Spotify OAuth hash on return — must be inside BrowserRouter to use useNavigate. */
function SpotifyHashHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    const parsed = parseSpotifyHash();
    if (parsed && 'accessToken' in parsed) {
      useSpotifyStore.getState().setTokens(parsed.accessToken, parsed.refreshToken);
      clearSpotifyHash();
      const returnPath = sessionStorage.getItem(SPOTIFY_RETURN_PATH_KEY);
      sessionStorage.removeItem(SPOTIFY_RETURN_PATH_KEY);
      if (returnPath && returnPath !== '/') {
        navigate(returnPath, { replace: true });
      }
    }
  }, [navigate]);

  return null;
}

function App() {
  return (
    <BrowserRouter>
      <SpotifyHashHandler />
      <div className={styles['app']}>
        <main className={styles['app-main']}>
          <Routes>
            <Route path="/" element={<Navigate to="/dfranklin/the-motivator" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route
              path="/admin/spotify-callback"
              element={
                <ProtectedRoute>
                  <SpotifyCallbackPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <AdminPanel />
                </ProtectedRoute>
              }
            />
            <Route path="/:user_slug/:collection_slug" element={<JukeboxPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
