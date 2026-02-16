import { Album, Collection } from '../types';
import { useJukeboxStore } from '../stores/jukeboxStore';
import './AlbumCard.css';

interface Props {
  album: Album;
  collection: Collection;
}

export default function AlbumCard({ album, collection }: Props) {
  const { setSelectedAlbum, selectedAlbum } = useJukeboxStore();
  
  const isSelected = selectedAlbum?.id === album.id;
  
  const handleClick = () => {
    setSelectedAlbum(isSelected ? null : album);
  };
  
  const displayNumber = String(album.display_number || 0).padStart(3, '0');
  
  return (
    <div
      className={`album-card ${isSelected ? 'album-card-selected' : ''}`}
      onClick={handleClick}
    >
      <div className="album-number">{displayNumber}</div>
      
      <div className="album-cover">
        {album.cover_art_path ? (
          <img
            src={`/api/media/${album.cover_art_path}`}
            alt={`${album.title} cover`}
            onError={(e) => {
              e.currentTarget.src = '/placeholder-album.png';
            }}
          />
        ) : (
          <div className="album-cover-placeholder">🎵</div>
        )}
      </div>
      
      <div className="album-info">
        <h3 className="album-title">{album.title}</h3>
        <p className="album-artist">{album.artist}</p>
        {album.year && <p className="album-year">{album.year}</p>}
      </div>
    </div>
  );
}
