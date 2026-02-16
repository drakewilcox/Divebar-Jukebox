import React from 'react';
import './LCDDisplay.css';

interface Props {
  value: string; // Format: "XXX-YY" where X and Y can be digits or _
}

export default function LCDDisplay({ value }: Props) {
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
    <div className="lcd-display">
      <div className="lcd-group">
        <LCDDigit value={digits[0]} />
        <LCDDigit value={digits[1]} />
        <LCDDigit value={digits[2]} />
      </div>
      <div className={`lcd-dash ${isDashActive ? 'active' : 'inactive'}`}>-</div>
      <div className="lcd-group">
        <LCDDigit value={digits[3]} />
        <LCDDigit value={digits[4]} />
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
    <div className={`lcd-digit ${isActive ? 'active' : 'inactive'}`}>
      <div className="lcd-content">
        {isActive ? value : '8'}
      </div>
    </div>
  );
}
