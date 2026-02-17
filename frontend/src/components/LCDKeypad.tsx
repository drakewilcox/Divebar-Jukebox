import React from 'react';
import './LCDKeypad.css';

interface Props {
  onDigit: (digit: string) => void;
  onClear: () => void;
  onHit: () => void;
}

export default function LCDKeypad({ onDigit, onClear, onHit }: Props) {
  const digits1to9 = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  return (
    <div className="lcd-keypad" role="group" aria-label="Number keypad">
      <div className="lcd-keypad-grid">
        {digits1to9.map((d) => (
          <button
            key={d}
            type="button"
            className="lcd-keypad-key lcd-keypad-digit"
            onClick={() => onDigit(d)}
            aria-label={`Digit ${d}`}
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          className="lcd-keypad-key lcd-keypad-c"
          onClick={onClear}
          aria-label="Clear"
        >
          C
        </button>
        <button
          type="button"
          className="lcd-keypad-key lcd-keypad-digit"
          onClick={() => onDigit('0')}
          aria-label="Digit 0"
        >
          0
        </button>
        <button
          type="button"
          className="lcd-keypad-key lcd-keypad-h"
          onClick={onHit}
          aria-label="Hit"
        >
          H
        </button>
      </div>
    </div>
  );
}
