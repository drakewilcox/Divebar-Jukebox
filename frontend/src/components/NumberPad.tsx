import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Collection } from '../types';
import { queueApi } from '../services/api';
import { useJukeboxStore } from '../stores/jukeboxStore';
import './NumberPad.css';

interface Props {
  collection: Collection;
}

export default function NumberPad({ collection }: Props) {
  const { numberInput, setNumberInput, clearNumberInput, appendToNumberInput, backspaceNumberInput } = useJukeboxStore();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<string>('');
  
  const addToQueueMutation = useMutation({
    mutationFn: async ({ albumNumber, trackNumber }: { albumNumber: number; trackNumber: number }) => {
      const response = await queueApi.add(collection.slug, albumNumber, trackNumber);
      return response.data as { already_queued?: boolean; queue_id?: string };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['queue', collection.slug] });
      if (data?.already_queued) {
        setFeedback('Already in Queue');
        setTimeout(() => setFeedback(''), 2000);
      }
      clearNumberInput();
    },
    onError: () => {
      setFeedback('✗ Invalid selection');
      setTimeout(() => setFeedback(''), 2000);
    },
  });
  
  const handleNumberClick = (num: string) => {
    appendToNumberInput(num);
  };
  
  const handleClear = () => {
    clearNumberInput();
    setFeedback('');
  };
  
  const handleBackspace = () => {
    backspaceNumberInput();
  };
  
  const handleSubmit = () => {
    if (numberInput.length < 3) {
      setFeedback('✗ Enter album number (XXX-YY)');
      setTimeout(() => setFeedback(''), 2000);
      return;
    }
    
    // Parse input: XXX or XXX-YY
    let albumNumber: number;
    let trackNumber: number = 0; // 0 means entire album
    
    if (numberInput.length <= 3) {
      // Just album number (XXX or XXX-00)
      albumNumber = parseInt(numberInput, 10);
    } else {
      // Album and track (XXXYN where last 2 digits are track)
      albumNumber = parseInt(numberInput.slice(0, 3), 10);
      trackNumber = parseInt(numberInput.slice(3), 10);
    }
    
    addToQueueMutation.mutate({ albumNumber, trackNumber });
  };
  
  const formatDisplay = () => {
    if (numberInput.length === 0) return 'XXX-YY';
    if (numberInput.length <= 3) {
      return numberInput.padEnd(3, '_') + '-YY';
    }
    return numberInput.slice(0, 3) + '-' + numberInput.slice(3).padEnd(2, '_');
  };
  
  return (
    <div className="number-pad">
      <div className="number-pad-display">
        <div className="input-display">{formatDisplay()}</div>
        {feedback && <div className="feedback-message">{feedback}</div>}
      </div>
      
      <div className="number-pad-grid">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <button
            key={num}
            className="number-button"
            onClick={() => handleNumberClick(String(num))}
          >
            {num}
          </button>
        ))}
        
        <button className="number-button action-button" onClick={handleClear}>
          CLR
        </button>
        
        <button className="number-button" onClick={() => handleNumberClick('0')}>
          0
        </button>
        
        <button className="number-button action-button" onClick={handleBackspace}>
          ←
        </button>
      </div>
      
      <button
        className="submit-button"
        onClick={handleSubmit}
        disabled={numberInput.length < 3 || addToQueueMutation.isPending}
      >
        {addToQueueMutation.isPending ? 'Adding...' : 'Add to Queue'}
      </button>
    </div>
  );
}
