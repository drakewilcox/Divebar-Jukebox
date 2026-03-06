import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import LibraryScanner from './LibraryScanner';
import CollectionManager from './CollectionManager';
import UserSettings from './UserSettings';
import styles from './AdminPanel.module.css'
import clsx from 'clsx';

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<'scanner' | 'collections' | 'user-settings'>('scanner');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    if (!userMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [userMenuOpen]);

  const handleBackToJukebox = () => {
    const returnPath = sessionStorage.getItem('adminReturnPath');
    if (returnPath) {
      navigate(returnPath);
    } else {
      const defaultSlug = localStorage.getItem('defaultCollection') || 'all';
      navigate(user ? `/${user.slug}/${defaultSlug}` : '/');
    }
  };

  return (
    <div className={styles['admin-panel']}>
      <div className={styles['admin-header']}>
        <h1>Admin Panel</h1>
        <div className={styles['admin-header-actions']}>
          <button
            type="button"
            className={styles['admin-back-to-jukebox']}
            onClick={handleBackToJukebox}
          >
            ← Jukebox
          </button>
          {user && (
            <div className={styles['admin-user-menu']} ref={userMenuRef}>
              <button
                type="button"
                className={styles['admin-user-trigger']}
                onClick={() => setUserMenuOpen(o => !o)}
              >
                {user.slug}
                <span className={styles['admin-user-caret']}>{userMenuOpen ? '▲' : '▼'}</span>
              </button>
              {userMenuOpen && (
                <div className={styles['admin-user-dropdown']}>
                  <button
                    type="button"
                    className={styles['admin-user-dropdown-item']}
                    onClick={() => { logout(); navigate('/login'); }}
                  >
                    Log out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className={styles['admin-tabs']}>
        <button
          className={clsx(styles['admin-tab'], activeTab === 'scanner' && styles['admin-tab-active'])}
          onClick={() => setActiveTab('scanner')}
        >
          Library Scanner
        </button>
        <button
          className={clsx(styles['admin-tab'], activeTab === 'collections' && styles['admin-tab-active'])}
          onClick={() => setActiveTab('collections')}
        >
          Collection Manager
        </button>
        <button
          className={clsx(styles['admin-tab'], activeTab === 'user-settings' && styles['admin-tab-active'])}
          onClick={() => setActiveTab('user-settings')}
        >
          User Settings
        </button>
      </div>

      <div className={styles['admin-content']}>
        {activeTab === 'scanner' && <LibraryScanner />}
        {activeTab === 'collections' && <CollectionManager />}
        {activeTab === 'user-settings' && <UserSettings />}
      </div>
    </div>
  );
}
