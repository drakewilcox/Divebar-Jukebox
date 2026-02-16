import { useState } from 'react';
import LibraryScanner from './LibraryScanner';
import CollectionManager from './CollectionManager';
import './AdminPanel.css';

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<'scanner' | 'collections'>('scanner');
  
  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h1>⚙️ Admin Panel</h1>
      </div>
      
      <div className="admin-tabs">
        <button
          className={`admin-tab ${activeTab === 'scanner' ? 'admin-tab-active' : ''}`}
          onClick={() => setActiveTab('scanner')}
        >
          Library Scanner
        </button>
        <button
          className={`admin-tab ${activeTab === 'collections' ? 'admin-tab-active' : ''}`}
          onClick={() => setActiveTab('collections')}
        >
          Collection Manager
        </button>
      </div>
      
      <div className="admin-content">
        {activeTab === 'scanner' && <LibraryScanner />}
        {activeTab === 'collections' && <CollectionManager />}
      </div>
    </div>
  );
}
