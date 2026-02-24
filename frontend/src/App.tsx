import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collectionsApi, settingsApi } from './services/api';
import { useJukeboxStore } from './stores/jukeboxStore';
import JukeboxDisplay from './components/JukeboxDisplay';
import AdminPanel from './components/Admin/AdminPanel';
import styles from './App.module.css';

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

  // Fetch settings (default collection) from backend
  const { data: settings, isFetched: settingsFetched } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await settingsApi.get();
      return response.data;
    },
    retry: false,
  });

  // Set default collection once when we have collections and settings have been fetched
  useEffect(() => {
    if (!collections?.length || currentCollection || !settingsFetched) return;
    const slug = settings?.default_collection_slug || localStorage.getItem('defaultCollection') || 'all';
    const defaultCollection = collections.find(c => c.slug === slug) ||
      collections.find(c => c.slug === 'all') ||
      collections[0];
    setCurrentCollection(defaultCollection);
  }, [collections, currentCollection, setCurrentCollection, settingsFetched, settings?.default_collection_slug]);

  // When collections refetch (e.g. after saving collection settings), use fresh data for current collection
  useEffect(() => {
    if (!collections?.length || !currentCollection) return;
    const fresh = collections.find(c => c.id === currentCollection.id);
    if (fresh) setCurrentCollection(fresh);
  }, [collections, currentCollection?.id, setCurrentCollection]);

  return (
    <div className={styles['app']}>
      <main className={styles['app-main']}>
        {isAdminMode ? (
          <AdminPanel />
        ) : currentCollection ? (
          <JukeboxDisplay 
            collection={currentCollection} 
            collections={collections || []}
            onCollectionChange={setCurrentCollection}
          />
        ) : (
          <div className={styles['loading']}>Loading collections...</div>
        )}
      </main>
    </div>
  );
}

export default App;
