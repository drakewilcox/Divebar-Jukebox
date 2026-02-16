import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collectionsApi } from './services/api';
import { useJukeboxStore } from './stores/jukeboxStore';
import JukeboxDisplay from './components/JukeboxDisplay';
import AdminPanel from './components/Admin/AdminPanel';
import './App.css';

function App() {
  const { currentCollection, setCurrentCollection, isAdminMode } = useJukeboxStore();
  
  // Fetch collections
  const { data: collections } = useQuery({
    queryKey: ['collections'],
    queryFn: async () => {
      const response = await collectionsApi.getAll();
      return response.data;
    },
  });
  
  // Set default collection (from localStorage or fallback to "All Albums")
  useEffect(() => {
    if (collections && collections.length > 0 && !currentCollection) {
      // Check localStorage for default collection
      const savedDefaultSlug = localStorage.getItem('defaultCollection');
      let defaultCollection = null;
      
      if (savedDefaultSlug) {
        defaultCollection = collections.find(c => c.slug === savedDefaultSlug);
      }
      
      // Fallback to "All Albums" or first collection
      if (!defaultCollection) {
        defaultCollection = collections.find(c => c.slug === 'all') || collections[0];
      }
      
      setCurrentCollection(defaultCollection);
    }
  }, [collections, currentCollection, setCurrentCollection]);
  
  return (
    <div className="app">
      <main className="app-main">
        {isAdminMode ? (
          <AdminPanel />
        ) : currentCollection ? (
          <JukeboxDisplay 
            collection={currentCollection} 
            collections={collections || []}
            onCollectionChange={setCurrentCollection}
          />
        ) : (
          <div className="loading">Loading collections...</div>
        )}
      </main>
      
      <footer className="app-footer">
        <button
          className="admin-toggle"
          onClick={() => useJukeboxStore.setState({ isAdminMode: !isAdminMode })}
        >
          {isAdminMode ? '🎵 Jukebox Mode' : '⚙️ Admin Mode'}
        </button>
      </footer>
    </div>
  );
}

export default App;
