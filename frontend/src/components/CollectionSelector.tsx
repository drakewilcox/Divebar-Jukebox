import { Collection } from '../types';
import { useJukeboxStore } from '../stores/jukeboxStore';
import styles from './CollectionSelector.module.css';

interface Props {
  collections: Collection[];
}

export default function CollectionSelector({ collections }: Props) {
  const { currentCollection, setCurrentCollection } = useJukeboxStore();
  const collectionsList = Array.isArray(collections) ? collections : [];

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const collection = collectionsList.find(c => c.slug === e.target.value);
    if (collection) {
      setCurrentCollection(collection);
    }
  };
  
  return (
    <div className={styles['collection-selector']}>
      <label htmlFor="collection-select">Collection:</label>
      <select
        id="collection-select"
        value={currentCollection?.slug || ''}
        onChange={handleChange}
      >
        {collectionsList.map((collection) => (
          <option key={collection.id} value={collection.slug}>
            {collection.name}
          </option>
        ))}
      </select>
    </div>
  );
}
