import { useState } from 'react';
import { useJukeboxStore } from '../../stores/jukeboxStore';
import LibraryScanner from './LibraryScanner';
import CollectionManager from './CollectionManager';
import styles from './AdminPanel.module.css'
import clsx from 'clsx';

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<'scanner' | 'collections'>('scanner');

  return (
    <div className={styles['admin-panel']}>
      <div className={styles['admin-header']}>
        <h1>Admin Panel</h1>
        <button
          type="button"
          className={styles['admin-back-to-jukebox']}
          onClick={() => useJukeboxStore.setState({ isAdminMode: false })}
        >
          ←
        </button>
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
      </div>

      <div className={styles['admin-content']}>
        {activeTab === 'scanner' && <LibraryScanner />}
        {activeTab === 'collections' && <CollectionManager />}
      </div>
    </div>
  );
}
