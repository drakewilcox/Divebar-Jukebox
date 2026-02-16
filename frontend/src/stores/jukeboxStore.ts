// Zustand store for jukebox state management
import { create } from 'zustand';
import type { Collection, Album, QueueItem, PlaybackState } from '../types';

interface JukeboxState {
  // Current state
  currentCollection: Collection | null;
  selectedAlbum: Album | null;
  queue: QueueItem[];
  playbackState: PlaybackState | null;
  isAdminMode: boolean;
  
  // Number pad input
  numberInput: string;
  
  // Actions
  setCurrentCollection: (collection: Collection | null) => void;
  setSelectedAlbum: (album: Album | null) => void;
  setQueue: (queue: QueueItem[]) => void;
  setPlaybackState: (state: PlaybackState | null) => void;
  setAdminMode: (isAdmin: boolean) => void;
  setNumberInput: (input: string) => void;
  clearNumberInput: () => void;
  appendToNumberInput: (digit: string) => void;
  backspaceNumberInput: () => void;
}

export const useJukeboxStore = create<JukeboxState>((set) => ({
  // Initial state
  currentCollection: null,
  selectedAlbum: null,
  queue: [],
  playbackState: null,
  isAdminMode: false,
  numberInput: '',
  
  // Actions
  setCurrentCollection: (collection) => set({ currentCollection: collection }),
  setSelectedAlbum: (album) => set({ selectedAlbum: album }),
  setQueue: (queue) => set({ queue }),
  setPlaybackState: (state) => set({ playbackState: state }),
  setAdminMode: (isAdmin) => set({ isAdminMode: isAdmin }),
  setNumberInput: (input) => set({ numberInput: input }),
  clearNumberInput: () => set({ numberInput: '' }),
  appendToNumberInput: (digit) =>
    set((state) => ({
      numberInput: (state.numberInput + digit).slice(0, 5), // Max 5 digits (XXX-YY)
    })),
  backspaceNumberInput: () =>
    set((state) => ({
      numberInput: state.numberInput.slice(0, -1),
    })),
}));
