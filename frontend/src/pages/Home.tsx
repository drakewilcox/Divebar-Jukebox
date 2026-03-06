import { Link } from 'react-router-dom';
import styles from './Home.module.css';

export default function Home() {
  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <h1>Divebar Jukebox</h1>
        <p>Open a jukebox at <code>/{'{user_slug}'}/{'{collection_slug}'}</code></p>
        <p className={styles.links}>
          <Link to="/login">Admin login</Link>
          {' · '}
          <Link to="/register">Register</Link>
        </p>
      </div>
    </div>
  );
}
