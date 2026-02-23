import styles from './LCDDisplay.module.css'
import clsx from 'clsx';

interface Props {
  value: string; // Format: "XXX-YY" where X and Y can be digits or _
  discLabel?: string;
  trackLabel?: string;
}

export default function LCDDisplay({ value, discLabel = 'Disc Number', trackLabel = 'Track Number' }: Props) {
  // Parse the value into individual character positions
  // Expected format: "XXX-YY" (5 positions + dash)
  const getCharAtPosition = (position: number): string => {
    if (!value) return '_';
    
    // Remove formatting and get raw input
    const raw = value.replace(/[^0-9_]/g, '');
    
    if (position < raw.length) {
      return raw[position];
    }
    return '_';
  };

  const digits = [
    getCharAtPosition(0),
    getCharAtPosition(1),
    getCharAtPosition(2),
    getCharAtPosition(3),
    getCharAtPosition(4),
  ];

  // Dash should only light up when 4th digit is entered (index 3)
  const raw = value.replace(/[^0-9_]/g, '');
  const isDashActive = raw.length >= 4;

  return (
    <div className={styles['lcd-display']}>
      <div className={styles['lcd-group-with-label']}>
        <div className={styles['lcd-group']}>
          <LCDDigit value={digits[0]} />
          <LCDDigit value={digits[1]} />
          <LCDDigit value={digits[2]} />
        </div>
        <span className={styles['lcd-group-label']}>{discLabel}</span>
      </div>
      <div className={clsx(styles['lcd-dash'], isDashActive ? styles['active'] : styles['inactive'])}>-</div>
      <div className={styles['lcd-group-with-label']}>
        <div className={styles['lcd-group']}>
          <LCDDigit value={digits[3]} />
          <LCDDigit value={digits[4]} />
        </div>
        <span className={styles['lcd-group-label']}>{trackLabel}</span>
      </div>
    </div>
  );
}

interface LCDDigitProps {
  value: string;
}

function LCDDigit({ value }: LCDDigitProps) {
  const isActive = value !== '_' && /[0-9]/.test(value);
  
  return (
    <div className={clsx(styles['lcd-digit'], isActive ? styles['active'] : styles['inactive'])}>
      <div className={styles['lcd-content']}>
        {isActive ? value : '8'}
      </div>
    </div>
  );
}
