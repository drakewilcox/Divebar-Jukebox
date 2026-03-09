import { useParams, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { usersApi } from '../services/api';
import { useJukeboxStore } from '../stores/jukeboxStore';
import JukeboxDisplay from '../components/JukeboxDisplay';
import styles from '../App.module.css';

export default function JukeboxPage() {
  const { user_slug: userSlug, collection_slug: collectionSlug } = useParams<{ user_slug: string; collection_slug: string }>();
  const { setCurrentCollection } = useJukeboxStore();

  const { data: collection, isLoading: loadingCollection, error: collectionError } = useQuery({
    queryKey: ['user-collection', userSlug, collectionSlug],
    queryFn: async () => {
      const res = await usersApi.getCollection(userSlug!, collectionSlug!);
      return res.data;
    },
    enabled: !!userSlug && !!collectionSlug,
  });

  const { data: collections } = useQuery({
    queryKey: ['user-collections', userSlug],
    queryFn: async () => {
      const res = await usersApi.getCollections(userSlug!);
      const data = res.data;
      return Array.isArray(data) ? data : [];
    },
    enabled: !!userSlug,
  });

  if (!userSlug || !collectionSlug) {
    return <Navigate to="/" replace />;
  }
  if (collectionError || (collection === undefined && !loadingCollection)) {
    const errMsg = collectionError instanceof Error
      ? collectionError.message
      : (collectionError && typeof collectionError === 'object' && 'response' in collectionError
        ? (collectionError as { response?: { data?: { detail?: string } } }).response?.data?.detail
        : null);
    const errStr = typeof errMsg === 'string' ? errMsg : Array.isArray(errMsg) ? (errMsg as string[]).join(' ') : String(collectionError ?? '');
    return (
      <div className={styles['page-message']} role="alert">
        <p><strong>Collection not found</strong> for <code>/{userSlug}/{collectionSlug}</code>.</p>
        <p>Check that the user slug matches your profile (e.g. the slug shown in Admin when logged in). Unpublished collections only load when you are logged in as the owner.</p>
        {errStr && <p className={styles['page-message-error']}>Error: {errStr}</p>}
      </div>
    );
  }
  if (!collection) {
    return (
      <div className={styles['page-message']}>
        <p>Loading collection…</p>
        <p>Please note, this deployed version of the application is only a demo, and initial load may take 30 - 60 seconds.</p>
      </div>
    );
  }

  const collectionsList = Array.isArray(collections) ? collections : [];

  return (
    <JukeboxDisplay
      collection={collection}
      collections={collectionsList}
      onCollectionChange={setCurrentCollection}
      userSlug={userSlug}
    />
  );
}
