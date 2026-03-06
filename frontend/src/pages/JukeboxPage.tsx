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
      return res.data;
    },
    enabled: !!userSlug,
  });

  if (!userSlug || !collectionSlug) {
    return <Navigate to="/" replace />;
  }
  if (collectionError || (collection === undefined && !loadingCollection)) {
    return (
      <div className={styles.loading}>
        <p>Collection not found for <code>/{userSlug}/{collectionSlug}</code>.</p>
        <p>Check that the user slug matches your profile (e.g. the slug shown in Admin when logged in). Unpublished collections only load when you are logged in as the owner.</p>
      </div>
    );
  }
  if (!collection) {
    return <div className={styles.loading}>Loading...</div>;
  }

  return (
    <JukeboxDisplay
      collection={collection}
      collections={collections ?? []}
      onCollectionChange={setCurrentCollection}
      userSlug={userSlug}
    />
  );
}
