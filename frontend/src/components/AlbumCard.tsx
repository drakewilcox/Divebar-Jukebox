import { Album, Collection } from '../types';
import { useJukeboxStore } from '../stores/jukeboxStore';
import styles from './AlbumCard.module.css';
import clsx from 'clsx';

interface Props {
  album: Album;
  collection: Collection;
}

export default function AlbumCard({ album }: Props) {
  const { setSelectedAlbum, selectedAlbum } = useJukeboxStore();
  
  const isSelected = selectedAlbum?.id === album.id;
  
  const handleClick = () => {
    setSelectedAlbum(isSelected ? null : album);
  };
  
  const displayNumber = String(album.display_number || 0).padStart(3, '0');
  
  return (
    <div
      className={clsx(styles['album-card'], isSelected && styles['album-card-selected'])}
      onClick={handleClick}
    >
      <div className={styles['album-number']}>{displayNumber}</div>
      
      <div className={styles['album-cover']}>
        {album.cover_art_path ? (
          <img
            src={`/api/media/${album.cover_art_path}`}
            alt={`${album.title} cover`}
            onError={(e) => {
              e.currentTarget.src = '/placeholder-album.png';
            }}
          />
        ) : (
          <div className={styles['album-cover-placeholder']}>🎵</div>
        )}
      </div>
      
      <div className={styles['album-info']}>
        <h3 className={styles['album-title']}>{album.title}</h3>
        <p className={styles['album-artist']}>{album.artist}</p>
        {album.year && <p className={styles['album-year']}>{album.year}</p>}
      </div>
    </div>
  );
}
