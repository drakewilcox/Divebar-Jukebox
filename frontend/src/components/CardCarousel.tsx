import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MdStar, MdFiberManualRecord, MdSettings, MdEdit, MdVolumeUp, MdOutlineQueueMusic } from 'react-icons/md';
import { Album, Collection } from '../types';
import { albumsApi, queueApi, playbackApi } from '../services/api';
import audioService from '../services/audio';
import SettingsModal from './SettingsModal';
import AlbumEditModal from './Admin/AlbumEditModal';
import LCDDisplay from './LCDDisplay';
import LCDKeypad from './LCDKeypad';
import QueueDisplay from './QueueDisplay';
import './CardCarousel.css';

function hexToRgba(hex: string, alpha: number): string {
  const m = hex.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return hex;
  let r: number, g: number, b: number;
  if (m[1].length === 3) {
    r = parseInt(m[1][0] + m[1][0], 16);
    g = parseInt(m[1][1] + m[1][1], 16);
    b = parseInt(m[1][2] + m[1][2], 16);
  } else {
    r = parseInt(m[1].slice(0, 2), 16);
    g = parseInt(m[1].slice(2, 4), 16);
    b = parseInt(m[1].slice(4, 6), 16);
  }
  return `rgba(${r},${g},${b},${alpha})`;
}

const SECTION_BUTTON_CREAM = '#f5f0e8';

// Old jukebox letter buttons (I and O skipped - looked like 1 and 0)
const LETTERS_LEFT = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K'];
const LETTERS_RIGHT = ['L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'U', 'V'];
const LETTERS = [...LETTERS_LEFT, ...LETTERS_RIGHT];

function parseHex(hex: string): [number, number, number] | null {
  const m = hex.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  if (m[1].length === 3) {
    return [
      parseInt(m[1][0] + m[1][0], 16),
      parseInt(m[1][1] + m[1][1], 16),
      parseInt(m[1][2] + m[1][2], 16),
    ];
  }
  return [
    parseInt(m[1].slice(0, 2), 16),
    parseInt(m[1].slice(2, 4), 16),
    parseInt(m[1].slice(4, 6), 16),
  ];
}

/** Blend base (cream) with tint (section color). weight 0 = all cream, 1 = all tint. Lower weight = lighter. */
function blendWithCream(sectionHex: string, weight: number): string {
  const cream = parseHex(SECTION_BUTTON_CREAM);
  const tint = parseHex(sectionHex);
  if (!cream || !tint) return sectionHex;
  const r = Math.round(cream[0] * (1 - weight) + tint[0] * weight);
  const g = Math.round(cream[1] * (1 - weight) + tint[1] * weight);
  const b = Math.round(cream[2] * (1 - weight) + tint[2] * weight);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

interface Props {
  albums: Album[];
  collection: Collection;
  collections: Collection[];
  onCollectionChange: (collection: Collection) => void;
}

export default function CardCarousel({ albums, collection, collections, onCollectionChange }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSliding, setIsSliding] = useState(false);
  const [numberInput, setNumberInput] = useState('');
  const [feedback, setFeedback] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingAlbumId, setEditingAlbumId] = useState<string | null>(null);
  const [pressedButton, setPressedButton] = useState<'prev' | 'next' | null>(null);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [keypadOpen, setKeypadOpen] = useState(false);
  const [displayFlash, setDisplayFlash] = useState<string | null>(null);
  const [nowPlayingPositionMs, setNowPlayingPositionMs] = useState(0);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  const [jumpTargetIndex, setJumpTargetIndex] = useState<number | null>(null);
  type NavSettings = {
    sortOrder: 'alphabetical' | 'curated';
    showJumpToBar: boolean;
    jumpButtonType: 'letter-ranges' | 'number-ranges' | 'sections';
    showColorCoding: boolean;
  };
  const [navSettings, setNavSettings] = useState<NavSettings>(() => {
    const sortOrder = localStorage.getItem('sortOrder');
    const showJumpToBar = localStorage.getItem('showJumpToBar');
    const jumpButtonType = localStorage.getItem('jumpButtonType');
    const showColorCoding = localStorage.getItem('showColorCoding');
    const legacy = localStorage.getItem('navBarMode');
    return {
      sortOrder: sortOrder === 'alphabetical' || sortOrder === 'curated' ? sortOrder : 'curated',
      showJumpToBar: showJumpToBar !== null ? showJumpToBar === 'true' : true,
      jumpButtonType:
        jumpButtonType === 'letter-ranges' || jumpButtonType === 'number-ranges' || jumpButtonType === 'sections'
          ? jumpButtonType
          : legacy === 'sections'
            ? 'sections'
            : 'number-ranges',
      showColorCoding: showColorCoding !== null ? showColorCoding === 'true' : true,
    };
  });
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const queuePanelRef = useRef<HTMLDivElement>(null);
  const queueToggleRef = useRef<HTMLDivElement>(null);
  const inputSectionRef = useRef<HTMLDivElement>(null);
  const jumpToBarRef = useRef<HTMLDivElement>(null);
  const nowPlayingProgressBarRef = useRef<HTMLDivElement>(null);
  const handleAddToQueueRef = useRef<() => void>(() => {});
  const lastSubmittedRef = useRef<string | null>(null);
  const [jumpLineStyle, setJumpLineStyle] = useState({ left: 0, width: 0 });
  
  // Fetch queue and playback state
  const { data: queue } = useQuery({
    queryKey: ['queue', collection.slug],
    queryFn: async () => {
      const response = await queueApi.get(collection.slug);
      return response.data;
    },
    refetchInterval: 2000,
  });
  
  const { data: playbackState } = useQuery({
    queryKey: ['playback-state', collection.slug],
    queryFn: async () => {
      const response = await playbackApi.getState(collection.slug);
      return response.data;
    },
    refetchInterval: 1000,
  });
  
  const hasQueueContent = queue && queue.length > 0;

  // Live position for now-playing (updates from audio service so progress bar and seek stay in sync)
  useEffect(() => {
    const interval = setInterval(() => {
      setNowPlayingPositionMs(audioService.getCurrentTime() * 1000);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (playbackState?.current_track_id) {
      setNowPlayingPositionMs(playbackState.current_position_ms ?? 0);
    } else {
      setNowPlayingPositionMs(0);
    }
  }, [playbackState?.current_track_id, playbackState?.current_position_ms]);

  const formatTimeRemaining = (durationMs: number, currentMs: number) => {
    const remainingMs = Math.max(0, durationMs - currentMs);
    const minutes = Math.floor(remainingMs / 60000);
    const seconds = Math.floor((remainingMs % 60000) / 1000);
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

  const handleNowPlayingProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const bar = nowPlayingProgressBarRef.current;
    const durationMs = playbackState?.current_track?.duration_ms;
    if (!bar || durationMs == null || durationMs <= 0) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const seekMs = ratio * durationMs;
    audioService.seek(seekMs / 1000);
    setNowPlayingPositionMs(seekMs);
  };

  // Edit mode: use collection.default_edit_mode when available, otherwise localStorage fallback
  useEffect(() => {
    if (collection.default_edit_mode != null) {
      setEditMode(collection.default_edit_mode);
    } else {
      const saved = localStorage.getItem('editMode');
      if (saved != null) {
        setEditMode(saved === 'true');
      }
    }
  }, [collection.id, collection.default_edit_mode]);

  // Apply collection defaults for nav settings when collection changes
  useEffect(() => {
    const ls = localStorage.getItem('sortOrder');
    const sortOrder =
      collection.default_sort_order === 'alphabetical' || collection.default_sort_order === 'curated'
        ? collection.default_sort_order
        : ls === 'alphabetical' || ls === 'curated'
          ? ls
          : 'curated';
    const lj = localStorage.getItem('showJumpToBar');
    const showJumpToBar =
      collection.default_show_jump_to_bar != null
        ? collection.default_show_jump_to_bar
        : lj != null
          ? lj === 'true'
          : true;
    const jt = collection.default_jump_button_type;
    const ljt = localStorage.getItem('jumpButtonType');
    const leg = localStorage.getItem('navBarMode');
    const jumpButtonType: NavSettings['jumpButtonType'] =
      jt === 'letter-ranges' || jt === 'number-ranges' || jt === 'sections'
        ? jt
        : ljt === 'letter-ranges' || ljt === 'number-ranges' || ljt === 'sections'
          ? ljt
          : leg === 'sections'
            ? 'sections'
            : 'number-ranges';
    const lc = localStorage.getItem('showColorCoding');
    const showColorCoding =
      collection.default_show_color_coding != null
        ? collection.default_show_color_coding
        : lc != null
          ? lc === 'true'
          : true;
    const next: NavSettings = { sortOrder, showJumpToBar, jumpButtonType, showColorCoding };
    setNavSettings(next);
    localStorage.setItem('sortOrder', next.sortOrder);
    localStorage.setItem('showJumpToBar', String(next.showJumpToBar));
    localStorage.setItem('jumpButtonType', next.jumpButtonType);
    localStorage.setItem('showColorCoding', String(next.showColorCoding));
    window.dispatchEvent(new CustomEvent('navigation-settings-changed', { detail: next }));
    const cf =
      collection.default_crossfade_seconds != null &&
      collection.default_crossfade_seconds >= 0 &&
      collection.default_crossfade_seconds <= 12
        ? collection.default_crossfade_seconds
        : (() => {
            const x = localStorage.getItem('crossfadeSeconds');
            const n = x != null ? parseInt(x, 10) : NaN;
            return Number.isNaN(n) || n < 0 || n > 12 ? 0 : n;
          })();
    localStorage.setItem('crossfadeSeconds', String(cf));
    window.dispatchEvent(new CustomEvent('crossfade-changed', { detail: cf }));
  }, [
    collection.id,
    collection.default_sort_order,
    collection.default_show_jump_to_bar,
    collection.default_jump_button_type,
    collection.default_show_color_coding,
    collection.default_crossfade_seconds,
  ]);

  // Listen for navigation settings changes from Settings modal
  useEffect(() => {
    const handleNavSettingsChange = (event: CustomEvent<NavSettings>) => {
      setNavSettings(event.detail);
    };
    window.addEventListener('navigation-settings-changed', handleNavSettingsChange as EventListener);
    return () => {
      window.removeEventListener('navigation-settings-changed', handleNavSettingsChange as EventListener);
    };
  }, []);

  // Apply sort order: curated = collection order, alphabetical = by artist name then album title
  const displayAlbums = React.useMemo(() => {
    if (navSettings.sortOrder === 'alphabetical') {
      return [...albums].sort((a, b) => {
        const artistCmp = (a.artist || '').localeCompare(b.artist || '', undefined, { sensitivity: 'base' });
        if (artistCmp !== 0) return artistCmp;
        return (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
      });
    }
    return albums;
  }, [albums, navSettings.sortOrder]);

  // Pad albums array to ensure even number (each card needs 2 albums)
  const paddedAlbums = React.useMemo(() => {
    if (displayAlbums.length % 2 !== 0) {
      // Add a null placeholder for odd-numbered collections
      return [...displayAlbums, null as any];
    }
    return displayAlbums;
  }, [displayAlbums]);
  
  const currentAlbums = paddedAlbums.slice(currentIndex, currentIndex + 4);
  const nextAlbums = paddedAlbums.slice(currentIndex + 2, currentIndex + 6);
  const prevAlbums = paddedAlbums.slice(Math.max(0, currentIndex - 2), currentIndex + 2);
  const leftCard = currentAlbums.slice(0, 2);
  const rightCard = currentAlbums.slice(2, 4);
  const nextRightCard = nextAlbums.slice(2, 4);
  const prevLeftCard = prevAlbums.slice(0, 2);

  // Prefetch only the *next* card (2 albums) so "next" feels instant without extra requests competing.
  // No prefetch for prev to avoid 4 concurrent requests; prev may load on demand.
  useEffect(() => {
    if (currentIndex + 4 >= paddedAlbums.length) return;
    const nextA = paddedAlbums[currentIndex + 4];
    const nextB = paddedAlbums[currentIndex + 5];
    [nextA, nextB].forEach((album) => {
      if (!album) return;
      queryClient.prefetchQuery({
        queryKey: ['album-details', album.id, collection.slug],
        queryFn: async () => {
          const response = await albumsApi.getById(album.id, collection.slug);
          return response.data;
        },
        staleTime: 5 * 60 * 1000,
      });
      if (album.cover_art_path) {
        const img = new Image();
        img.src = `/api/media/${album.cover_art_path}`;
      }
    });
  }, [currentIndex, paddedAlbums, collection.slug, queryClient]);
  
  const handlePrevious = () => {
    if (isSliding || currentIndex === 0) return;
    setPressedButton('prev');
    setTimeout(() => setPressedButton(null), 150);
    setSlideDirection('right');
    setIsSliding(true);
    setTimeout(() => {
      setCurrentIndex((prev) => Math.max(0, prev - 2));
      setSlideDirection(null);
      setIsSliding(false);
    }, 500);
  };

  const handleNext = () => {
    if (isSliding || currentIndex >= paddedAlbums.length - 4) return;
    setPressedButton('next');
    setTimeout(() => setPressedButton(null), 150);
    setSlideDirection('left');
    setIsSliding(true);
    setTimeout(() => {
      setCurrentIndex((prev) => Math.min(paddedAlbums.length - 4, prev + 2));
      setSlideDirection(null);
      setIsSliding(false);
    }, 500);
  };
  
  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex < paddedAlbums.length - 4;
  
  const addToQueueMutation = useMutation({
    mutationFn: async ({ albumNumber, trackNumber }: { albumNumber: number; trackNumber: number }) => {
      const response = await queueApi.add(collection.slug, albumNumber, trackNumber);
      return response.data as { already_queued?: boolean; queue_id?: string };
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['queue', collection.slug] });
      if (data?.already_queued) {
        setFeedback('Already in Queue');
        setTimeout(() => setFeedback(''), 2000);
      } else {
        const value = String(variables.albumNumber).padStart(3, '0') + String(variables.trackNumber).padStart(2, '0');
        setDisplayFlash(value);
      }
      inputRef.current?.blur();
    },
    onError: () => {
      setFeedback('✗ Invalid');
      setTimeout(() => setFeedback(''), 2000);
    },
  });

  const addFavoritesRandomMutation = useMutation({
    mutationFn: async () => {
      const response = await queueApi.addFavoritesRandom(collection.slug, 10);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['queue', collection.slug] });
      setFeedback(data?.message ?? `Added ${data?.added ?? 0} favorites`);
      setTimeout(() => setFeedback(''), 3000);
    },
    onError: () => {
      setFeedback('Could not add favorites');
      setTimeout(() => setFeedback(''), 2000);
    },
  });
  
  const handleAddToQueue = () => {
    if (numberInput.length !== 5) {
      setFeedback('✗ Enter XXX-YY');
      setTimeout(() => setFeedback(''), 2000);
      return;
    }
    const positionOrDisplay = parseInt(numberInput.slice(0, 3), 10);
    const trackNumber = parseInt(numberInput.slice(3), 10);
    const apiAlbumNumber =
      navSettings.sortOrder === 'alphabetical'
        ? (displayAlbums[positionOrDisplay - 1]?.display_number ?? positionOrDisplay)
        : positionOrDisplay;
    addToQueueMutation.mutate({ albumNumber: apiAlbumNumber, trackNumber });
  };
  handleAddToQueueRef.current = handleAddToQueue;
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddToQueue();
      return;
    }
    
    // Handle backspace/delete on the raw input
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      setNumberInput((prev) => prev.slice(0, -1));
      return;
    }
    
    // Handle number input
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      if (numberInput.length < 5) {
        setNumberInput((prev) => prev + e.key);
      }
    }
  };
  
  const formatDisplay = (input: string) => {
    if (input.length === 0) return '';
    if (input.length <= 3) {
      return input.padEnd(3, '_') + '-YY';
    }
    return input.slice(0, 3) + '-' + input.slice(3).padEnd(2, '_');
  };
  
  // Keyboard navigation for arrow keys
  useEffect(() => {
    const handleArrowKey = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      if (e.key === 'ArrowLeft' && canGoPrevious && !isSliding) {
        e.preventDefault();
        handlePrevious();
      } else if (e.key === 'ArrowRight' && canGoNext && !isSliding) {
        e.preventDefault();
        handleNext();
      }
    };
    
    window.addEventListener('keydown', handleArrowKey);
    return () => window.removeEventListener('keydown', handleArrowKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canGoPrevious, canGoNext, isSliding, currentIndex]);
  
  // When user types numbers (desktop), add to input. Backspace/Delete remove last digit. Enter submits. (Auto-submit at 5 digits is in useEffect below.)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        setNumberInput((prev) => (prev.length < 5 ? prev + e.key : prev));
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        setNumberInput((prev) => prev.slice(0, -1));
      }
      if (e.key === 'Enter') {
        handleAddToQueueRef.current();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);
  
  // Keyboard shortcut to toggle queue with "Q" key
  useEffect(() => {
    const handleQKey = (e: KeyboardEvent) => {
      // Only toggle if not typing in an input/textarea
      if (e.key.toLowerCase() === 'q' && 
          !(e.target instanceof HTMLInputElement) && 
          !(e.target instanceof HTMLTextAreaElement)) {
        setIsQueueOpen(prev => !prev);
      }
    };
    
    window.addEventListener('keydown', handleQKey);
    return () => window.removeEventListener('keydown', handleQKey);
  }, []);

  // Close queue when clicking outside the panel (and not on the toggle)
  useEffect(() => {
    if (!isQueueOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        queuePanelRef.current?.contains(target) ||
        queueToggleRef.current?.contains(target)
      ) {
        return;
      }
      setIsQueueOpen(false);
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isQueueOpen]);

  // Close keypad when clicking outside the LCD/keypad area
  useEffect(() => {
    if (!keypadOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (inputSectionRef.current?.contains(target)) return;
      setKeypadOpen(false);
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [keypadOpen]);

  // Auto-submit once when we reach exactly 5 digits (keypad or keyboard)
  useEffect(() => {
    if (numberInput.length !== 5 || numberInput === lastSubmittedRef.current) return;
    lastSubmittedRef.current = numberInput;
    const positionOrDisplay = parseInt(numberInput.slice(0, 3), 10);
    const trackNumber = parseInt(numberInput.slice(3), 10);
    const apiAlbumNumber =
      navSettings.sortOrder === 'alphabetical'
        ? (displayAlbums[positionOrDisplay - 1]?.display_number ?? positionOrDisplay)
        : positionOrDisplay;
    addToQueueMutation.mutate({ albumNumber: apiAlbumNumber, trackNumber });
  }, [numberInput, addToQueueMutation, navSettings.sortOrder, displayAlbums]);

  // After adding to queue: show numbers, flash twice, then clear
  useEffect(() => {
    if (displayFlash == null) return;
    const t = setTimeout(() => {
      setDisplayFlash(null);
      setNumberInput('');
      lastSubmittedRef.current = null;
    }, 500);
    return () => clearTimeout(t);
  }, [displayFlash]);

  const currentTrackId = playbackState?.current_track_id ?? null;
  const queueTrackIds = queue?.map((q) => q.track.id) ?? [];

  // Sections bar: when show jump-to bar, jump type is sections, sort is curated, and collection has sections with ranges
  const sortedSections = React.useMemo(() => {
    if (!collection.sections_enabled || !Array.isArray(collection.sections) || collection.sections.length === 0) return [];
    return [...collection.sections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [collection.sections_enabled, collection.sections]);
  const sectionsHaveRanges =
    sortedSections.length > 0 &&
    sortedSections.every(
      (s, i) => s.start_slot != null && (s.end_slot != null || i === sortedSections.length - 1)
    );
  const showBar = navSettings.showJumpToBar;
  const showSectionsBar =
    showBar &&
    navSettings.sortOrder === 'curated' &&
    navSettings.jumpButtonType === 'sections' &&
    sectionsHaveRanges;
  const showLetterRangesBar =
    showBar &&
    navSettings.sortOrder === 'alphabetical' &&
    navSettings.jumpButtonType === 'letter-ranges';
  const showJumpToRangesBar = showBar && !showSectionsBar && !showLetterRangesBar;
  const applySectionColors = navSettings.showColorCoding;

  // Which section contains the given 1-based slot? Last section always extends to current end so new albums are included.
  const getSectionIndexForSlot = (slot: number): number => {
    const totalSlots = paddedAlbums.length;
    for (let i = 0; i < sortedSections.length; i++) {
      const s = sortedSections[i];
      const start = s.start_slot;
      if (start == null) continue;
      const end =
        i === sortedSections.length - 1 ? totalSlots : (s.end_slot ?? totalSlots);
      if (slot >= start && slot <= end) return i;
    }
    return 0;
  };

  // Section color for a 1-based slot (for album-row-info background); only when showColorCoding and sections bar active
  const getSectionBackgroundForSlot = (slot: number): string | undefined => {
    if (!applySectionColors || !showSectionsBar || !sectionsHaveRanges) return undefined;
    const i = getSectionIndexForSlot(slot);
    const c = sortedSections[i]?.color;
    return c ? blendWithCream(c, 0.5) : undefined;
  };

  // Jump To: 8 buttons, ranges adapt to album count (e.g. 80 albums → 1-10, 11-20, …)
  const totalAlbums = displayAlbums.length;
  const jumpRangeSize = totalAlbums <= 0 ? 0 : Math.ceil(totalAlbums / 8);
  const jumpRanges = Array.from({ length: 8 }, (_, i) => {
    const start = i * jumpRangeSize + 1;
    const end = Math.min((i + 1) * jumpRangeSize, totalAlbums);
    return { start, end, label: start <= totalAlbums ? `${start}-${end}` : '–' };
  });
  const currentRangeIndex = totalAlbums <= 0 || jumpRangeSize <= 0
    ? 0
    : Math.min(7, Math.floor(currentIndex / jumpRangeSize));

  /* Line moves in sync with cards: only move to target range when the slide actually crosses into a different range */
  const nextRangeIndex = jumpRangeSize > 0 ? Math.min(7, Math.floor((currentIndex + 2) / jumpRangeSize)) : currentRangeIndex;
  const prevRangeIndex = jumpRangeSize > 0 ? Math.max(0, Math.floor((currentIndex - 2) / jumpRangeSize)) : currentRangeIndex;
  const activeLineRangeIndex =
    jumpTargetIndex != null && jumpRangeSize > 0
      ? Math.min(7, Math.floor(jumpTargetIndex / jumpRangeSize))
      : slideDirection === 'left' && nextRangeIndex !== currentRangeIndex
        ? nextRangeIndex
        : slideDirection === 'right' && prevRangeIndex !== currentRangeIndex
          ? prevRangeIndex
          : currentRangeIndex;

  // Sections bar line: show the section most represented by the 4 visible cards (not just the first card)
  const activeSectionIndex = React.useMemo(() => {
    if (!showSectionsBar || sortedSections.length === 0) return 0;
    const start = jumpTargetIndex ?? currentIndex;
    const totalSlots = paddedAlbums.length;
    const sectionForSlot = (slot1Based: number): number => {
      for (let i = 0; i < sortedSections.length; i++) {
        const s = sortedSections[i];
        const startSlot = s.start_slot;
        if (startSlot == null) continue;
        const end =
          i === sortedSections.length - 1 ? totalSlots : (s.end_slot ?? totalSlots);
        if (slot1Based >= startSlot && slot1Based <= end) return i;
      }
      return 0;
    };
    const counts = new Array(sortedSections.length).fill(0);
    for (let offset = 0; offset < 4; offset++) {
      const slot1Based = start + offset + 1;
      counts[sectionForSlot(slot1Based)]++;
    }
    let maxCount = 0;
    let bestIdx = sectionForSlot(start + 1);
    for (let i = 0; i < sortedSections.length; i++) {
      if (counts[i] > maxCount) {
        maxCount = counts[i];
        bestIdx = i;
      } else if (counts[i] === maxCount && maxCount > 0 && sectionForSlot(start + 1) === i) {
        bestIdx = i;
      }
    }
    return bestIdx;
  }, [showSectionsBar, sortedSections, jumpTargetIndex, currentIndex, paddedAlbums.length]);

  // Letter ranges: first index where artist starts with each letter (or nearest if none)
  const letterStartIndices = React.useMemo(() => {
    const result: number[] = new Array(LETTERS.length);
    for (let i = LETTERS.length - 1; i >= 0; i--) {
      const L = LETTERS[i];
      const idx = displayAlbums.findIndex((a) =>
        (a.artist || '').toUpperCase().startsWith(L)
      );
      if (idx >= 0) result[i] = idx;
      else result[i] = i < LETTERS.length - 1 ? result[i + 1] : displayAlbums.length;
    }
    return result;
  }, [displayAlbums]);

  // Letter bar line: show the letter most represented by the 4 visible cards (not just the first card)
  const activeLetterIndex = React.useMemo(() => {
    const start = jumpTargetIndex ?? currentIndex;
    const visible = paddedAlbums.slice(start, start + 4).filter(Boolean) as Album[];
    if (visible.length === 0) return 0;
    const counts = new Array(LETTERS.length).fill(0);
    for (const album of visible) {
      const first = (album.artist || '').toUpperCase().charAt(0);
      for (let i = 0; i < LETTERS.length; i++) {
        if (LETTERS[i] === first) {
          counts[i]++;
          break;
        }
      }
      if (first === 'I') counts[LETTERS.indexOf('J')]++;
      else if (first === 'O') counts[LETTERS.indexOf('P')]++;
    }
    let maxCount = 0;
    let bestIdx = 0;
    for (let i = 0; i < LETTERS.length; i++) {
      if (letterStartIndices[i] <= start) bestIdx = i;
    }
    for (let i = 0; i < LETTERS.length; i++) {
      if (counts[i] > maxCount) {
        maxCount = counts[i];
        bestIdx = i;
      } else if (counts[i] === maxCount && maxCount > 0 && letterStartIndices[i] <= start) {
        bestIdx = i;
      }
    }
    return bestIdx;
  }, [jumpTargetIndex, currentIndex, paddedAlbums, letterStartIndices]);
  const activeButtonIndex = showSectionsBar
    ? activeSectionIndex
    : showLetterRangesBar
      ? activeLetterIndex
      : activeLineRangeIndex;
  const navBarButtonSelector = showSectionsBar
    ? '.section-button'
    : showLetterRangesBar
      ? '.letter-jump-button'
      : '.jump-to-button';

  useLayoutEffect(() => {
    const bar = jumpToBarRef.current;
    if (!bar) return;
    const button = bar.querySelectorAll(navBarButtonSelector)[activeButtonIndex] as HTMLElement | undefined;
    if (!button) return;
    const barRect = bar.getBoundingClientRect();
    const btnRect = button.getBoundingClientRect();
    setJumpLineStyle({
      left: btnRect.left - barRect.left,
      width: btnRect.width,
    });
  }, [activeButtonIndex, navBarButtonSelector]);

  useEffect(() => {
    const bar = jumpToBarRef.current;
    if (!bar) return;
    const resizeObserver = new ResizeObserver(() => {
      const button = bar.querySelectorAll(navBarButtonSelector)[activeButtonIndex] as HTMLElement | undefined;
      if (!button) return;
      const barRect = bar.getBoundingClientRect();
      const btnRect = button.getBoundingClientRect();
      setJumpLineStyle({
        left: btnRect.left - barRect.left,
        width: btnRect.width,
      });
    });
    resizeObserver.observe(bar);
    return () => resizeObserver.disconnect();
  }, [activeButtonIndex, navBarButtonSelector]);

  // Align jump so two-per-column layout is correct: even indices (0,2,4...) top, odd (1,3,5...) bottom.
  const alignJumpIndex = (startIndex: number) =>
    startIndex % 2 === 1 ? Math.max(0, startIndex - 1) : startIndex;

  const handleJumpTo = (rangeIndex: number) => {
    const rawIndex = rangeIndex * jumpRangeSize;
    const newIndex = Math.max(0, Math.min(alignJumpIndex(rawIndex), paddedAlbums.length - 4));
    if (newIndex === currentIndex) return;
    setJumpTargetIndex(newIndex);
    setIsSliding(true);
  };

  const handleJumpToSection = (sectionIndex: number) => {
    const section = sortedSections[sectionIndex];
    if (!section?.start_slot) return;
    const startIndex0 = section.start_slot - 1;
    const newIndex = Math.max(0, Math.min(alignJumpIndex(startIndex0), paddedAlbums.length - 4));
    if (newIndex === currentIndex) return;
    setJumpTargetIndex(newIndex);
    setIsSliding(true);
  };

  // Letter ranges: jump to first artist starting with letter (or nearest if none)
  const handleJumpToLetter = (letter: string) => {
    const idx = LETTERS.indexOf(letter);
    if (idx < 0) return;
    let rawIndex = displayAlbums.length;
    for (let i = idx; i < LETTERS.length; i++) {
      const L = LETTERS[i];
      const found = displayAlbums.findIndex((a) =>
        (a.artist || '').toUpperCase().startsWith(L)
      );
      if (found >= 0) {
        rawIndex = found;
        break;
      }
    }
    const newIndex = Math.max(
      0,
      Math.min(alignJumpIndex(rawIndex), paddedAlbums.length - 4)
    );
    if (newIndex === currentIndex) return;
    setJumpTargetIndex(newIndex);
    setIsSliding(true);
  };

  const isJumping = jumpTargetIndex != null;

  const handleFullSlideEnd = () => {
    if (jumpTargetIndex != null) {
      setCurrentIndex(jumpTargetIndex);
      setJumpTargetIndex(null);
      setIsSliding(false);
    }
  };

  // Full-page strip only for Jump To: current vs target, slide direction by whether target is ahead or behind.
  const targetLeftCard = jumpTargetIndex != null ? paddedAlbums.slice(jumpTargetIndex, jumpTargetIndex + 2) : [];
  const targetRightCard = jumpTargetIndex != null ? paddedAlbums.slice(jumpTargetIndex + 2, jumpTargetIndex + 4) : [];
  const jumpSlideLeft = jumpTargetIndex != null && jumpTargetIndex > currentIndex;

  const renderAlbumRow = (album: Album | null, keyPrefix: string, idx: number, slotIndex: number) => {
    const cardDisplayNumber =
      album && navSettings.sortOrder === 'alphabetical'
        ? slotIndex + 1
        : (album?.display_number ?? 0);
    return album ? (
      <AlbumRow
        key={album.id}
        album={album}
        collection={collection}
        editMode={editMode}
        onEditClick={setEditingAlbumId}
        currentTrackId={currentTrackId}
        queueTrackIds={queueTrackIds}
        sectionBackgroundColor={getSectionBackgroundForSlot(slotIndex + 1)}
        cardDisplayNumber={cardDisplayNumber}
      />
    ) : (
      <div key={`${keyPrefix}-${idx}`} className="album-row album-row-empty"></div>
    );
  };

  return (
    <div className="card-carousel">
      <div className="carousel-container">
        {jumpTargetIndex != null ? (
          <>
            <div className="carousel-full-slide-wrap">
              <div
                className={`carousel-full-slide-strip ${jumpSlideLeft ? 'animate-full-slide-left' : 'animate-full-slide-right'}`}
                onAnimationEnd={handleFullSlideEnd}
              >
                {jumpSlideLeft ? (
                  <>
                    <div className="carousel-full-slide-page">
                      <div className="card-slot card-slot-left">
                        <div className="slider-card">
                          {leftCard.map((album, idx) => renderAlbumRow(album, 'jump-left', idx, currentIndex + idx))}
                        </div>
                      </div>
                      <div className="card-slot card-slot-right">
                        <div className="slider-card">
                          {rightCard.map((album, idx) => renderAlbumRow(album, 'jump-right', idx, currentIndex + 2 + idx))}
                        </div>
                      </div>
                    </div>
                    <div className="carousel-full-slide-page">
                      <div className="card-slot card-slot-left">
                        <div className="slider-card">
                          {targetLeftCard.map((album, idx) => renderAlbumRow(album, 'target-left', idx, jumpTargetIndex! + idx))}
                        </div>
                      </div>
                      <div className="card-slot card-slot-right">
                        <div className="slider-card">
                          {targetRightCard.map((album, idx) => renderAlbumRow(album, 'target-right', idx, jumpTargetIndex! + 2 + idx))}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="carousel-full-slide-page">
                      <div className="card-slot card-slot-left">
                        <div className="slider-card">
                          {targetLeftCard.map((album, idx) => renderAlbumRow(album, 'target-left', idx, jumpTargetIndex! + idx))}
                        </div>
                      </div>
                      <div className="card-slot card-slot-right">
                        <div className="slider-card">
                          {targetRightCard.map((album, idx) => renderAlbumRow(album, 'target-right', idx, jumpTargetIndex! + 2 + idx))}
                        </div>
                      </div>
                    </div>
                    <div className="carousel-full-slide-page">
                      <div className="card-slot card-slot-left">
                        <div className="slider-card">
                          {leftCard.map((album, idx) => renderAlbumRow(album, 'jump-left', idx, currentIndex + idx))}
                        </div>
                      </div>
                      <div className="card-slot card-slot-right">
                        <div className="slider-card">
                          {rightCard.map((album, idx) => renderAlbumRow(album, 'jump-right', idx, currentIndex + 2 + idx))}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="glass-overlay"></div>
          </>
        ) : (
          <>
            <div className="card-slot card-slot-left">
              <div className="slider-card">
                {slideDirection === 'right' && prevLeftCard.length === 2
                  ? prevLeftCard.map((album, idx) => renderAlbumRow(album, 'prev-left', idx, currentIndex - 2 + idx))
                  : leftCard.map((album, idx) => renderAlbumRow(album, 'left', idx, currentIndex + idx))}
              </div>
            </div>
            <div className="card-slot card-slot-right">
              <div className="slider-card">
                {slideDirection === 'left' && nextRightCard.length === 2
                  ? nextRightCard.map((album, idx) => renderAlbumRow(album, 'next-right', idx, currentIndex + 4 + idx))
                  : rightCard.map((album, idx) => renderAlbumRow(album, 'right', idx, currentIndex + 2 + idx))}
              </div>
            </div>
            {slideDirection === 'left' && (
              <div className="slider-card-animated animate-slide-right-to-left">
                {rightCard.map((album, idx) => renderAlbumRow(album, 'slide', idx, currentIndex + 2 + idx))}
              </div>
            )}
            {slideDirection === 'right' && (
              <div className="slider-card-animated animate-slide-left-to-right">
                {leftCard.map((album, idx) => renderAlbumRow(album, 'slide-left', idx, currentIndex + idx))}
              </div>
            )}
            <div className="glass-overlay"></div>
          </>
        )}
      </div>

      {/* Navigation bar: only when Show Jump-To Buttons; Jump-to (ranges) or Sections */}
      {showBar && (
        <div
          ref={jumpToBarRef}
          className={`jump-to-bar ${showLetterRangesBar ? 'jump-to-bar-letters' : ''}`}
        >
          {showSectionsBar ? (
            sortedSections.map((section, i) => {
              const nameLen = (section.name ?? '').length;
              const textSizeClass =
                nameLen > 24 ? 'section-button-text-long' : nameLen > 14 ? 'section-button-text-medium' : 'section-button-text-short';
              const bgColor = applySectionColors
                ? blendWithCream(section.color ?? SECTION_BUTTON_CREAM, 0.65)
                : SECTION_BUTTON_CREAM;
              return (
                <button
                  key={i}
                  type="button"
                  className={`section-button jump-to-button ${textSizeClass}`}
                  style={{
                    ['--section-bg' as string]: bgColor,
                    background: bgColor,
                    backgroundColor: bgColor,
                  }}
                  onClick={() => handleJumpToSection(i)}
                  aria-label={`Jump to ${section.name}`}
                >
                  <span className="section-button-label">{section.name}</span>
                </button>
              );
            })
          ) : showLetterRangesBar ? (
            <>
              <div className="jump-to-bar-letters-left">
                {LETTERS_LEFT.map((letter) => (
                  <button
                    key={letter}
                    type="button"
                    className="jump-to-button letter-jump-button"
                    onClick={() => handleJumpToLetter(letter)}
                    disabled={displayAlbums.length === 0}
                    aria-label={`Jump to artists starting with ${letter}`}
                  >
                    {letter}
                  </button>
                ))}
              </div>
              <div className="jump-to-bar-letters-right">
                {LETTERS_RIGHT.map((letter) => (
                  <button
                    key={letter}
                    type="button"
                    className="jump-to-button letter-jump-button"
                    onClick={() => handleJumpToLetter(letter)}
                    disabled={displayAlbums.length === 0}
                    aria-label={`Jump to artists starting with ${letter}`}
                  >
                    {letter}
                  </button>
                ))}
              </div>
            </>
          ) : showJumpToRangesBar ? (
            jumpRanges.map((range, i) => (
              <button
                key={i}
                type="button"
                className="jump-to-button"
                onClick={() => handleJumpTo(i)}
                disabled={range.start > totalAlbums || totalAlbums === 0}
                aria-label={`Jump to albums ${range.label}`}
              >
                {range.label}
              </button>
            ))
          ) : null}
          {((showSectionsBar && sortedSections.length > 0) ||
            (showLetterRangesBar && displayAlbums.length > 0) ||
            (showJumpToRangesBar && totalAlbums > 0)) && (
            <div
              className="jump-to-bar-line"
              style={{
                left: jumpLineStyle.left,
                width: jumpLineStyle.width,
              }}
              aria-hidden
            />
          )}
        </div>
      )}
      
      <div className="carousel-controls-wrapper">
        {/* Upward-expanding queue panel */}
        <div
          ref={queuePanelRef}
          className={`queue-panel ${isQueueOpen ? 'open' : ''}`}
        >
          <div className="queue-panel-content">
            <QueueDisplay
              collection={collection}
              onQueueCleared={() => setIsQueueOpen(false)}
            />
          </div>
        </div>
        
        <div className="carousel-controls">
        <div className="controls-left">
          <button
            className="settings-button"
            onClick={() => setIsSettingsOpen(true)}
            title="Settings"
          >
            <MdSettings size={28} />
          </button>

          <div className="input-section" ref={inputSectionRef}>
            <div className={`lcd-keypad-wrapper ${displayFlash != null ? 'lcd-flash' : ''}`}>
              <div
                onClick={() => setKeypadOpen((open) => !open)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setKeypadOpen((open) => !open);
                  }
                }}
                aria-label="Open number keypad for album and track entry"
              >
                <LCDDisplay
                  value={formatDisplay(displayFlash ?? numberInput)}
                  discLabel="Disc"
                  trackLabel="Track"
                />
              </div>
              {keypadOpen && (
                <LCDKeypad
                  onDigit={(d) => setNumberInput((prev) => (prev.length < 5 ? prev + d : prev))}
                  onClear={() => setNumberInput('')}
                  onHit={() => addFavoritesRandomMutation.mutate()}
                />
              )}
            </div>
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              className="hidden-input"
              onKeyDown={handleKeyDown}
              aria-label="Album and track number input"
            />
            {feedback && <span className="input-feedback">{feedback}</span>}
          </div>
        </div>
        
        <div className="queue-controls-center" ref={queueToggleRef}>
          <div
            className="now-playing-mini"
            role="button"
            tabIndex={0}
            onClick={() => setIsQueueOpen(!isQueueOpen)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsQueueOpen(prev => !prev); } }}
            title={isQueueOpen ? 'Close queue (Q)' : 'Open queue (Q)'}
          >
            {/* Track title, album title, and artist come from playback state API (database-saved values, not file metadata) */}
            {playbackState?.current_track ? (
              <>
                <div className="now-playing-mini-row">
                  {playbackState.current_track.cover_art_path && (
                    <div className="now-playing-cover-wrap">
                      <img 
                        src={`/api/media/${playbackState.current_track.cover_art_path}`}
                        alt={playbackState.current_track.album_title}
                        className="now-playing-cover"
                      />
                    </div>
                  )}
                  <div className="now-playing-info">
                    <div className="now-playing-title">{playbackState.current_track.title}</div>
                    <div className="now-playing-artist">{playbackState.current_track.artist}</div>
                    <div className="now-playing-album">
                      {playbackState.current_track.album_title}
                      {playbackState.current_track.album_year != null && ` (${playbackState.current_track.album_year})`}
                    </div>
                    {playbackState.current_track.selection_display && (
                      <div className="now-playing-selection">{playbackState.current_track.selection_display}</div>
                    )}
                  </div>
                  <div className="now-playing-time">
                    {formatTimeRemaining(playbackState.current_track.duration_ms, nowPlayingPositionMs)}
                  </div>
                </div>
                <div
                  ref={nowPlayingProgressBarRef}
                  className="now-playing-mini-progress"
                  onClick={handleNowPlayingProgressClick}
                  role="slider"
                  aria-label="Track position"
                  aria-valuemin={0}
                  aria-valuemax={playbackState.current_track.duration_ms}
                  aria-valuenow={nowPlayingPositionMs}
                >
                  <div
                    className="now-playing-mini-progress-fill"
                    style={{
                      width: `${Math.min(100, (nowPlayingPositionMs / playbackState.current_track.duration_ms) * 100) || 0}%`,
                    }}
                  />
                </div>
              </>
            ) : null}
          </div>
        </div>
        
        <div className="nav-buttons">
          <button
            className={`nav-button nav-button-prev ${pressedButton === 'prev' ? 'pressed' : ''}`}
            onClick={handlePrevious}
            disabled={!canGoPrevious}
            aria-label="Previous albums"
          >
            ◀
          </button>
          
          <button
            className={`nav-button nav-button-next ${pressedButton === 'next' ? 'pressed' : ''}`}
            onClick={handleNext}
            disabled={!canGoNext}
            aria-label="Next albums"
          >
            ▶
          </button>
        </div>
      </div>
      </div>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        collections={collections}
        currentCollection={collection}
        onCollectionChange={onCollectionChange}
      />

      {editingAlbumId && (
        <AlbumEditModal
          albumId={editingAlbumId}
          onClose={() => setEditingAlbumId(null)}
        />
      )}
    </div>
  );
}

interface AlbumRowProps {
  album: Album;
  collection: Collection;
  editMode: boolean;
  onEditClick: (albumId: string) => void;
  currentTrackId: string | null;
  queueTrackIds: string[];
  sectionBackgroundColor?: string;
  /** Number shown in card-number-box: position (1-based) when alphabetical, display_number when curated */
  cardDisplayNumber: number;
}

function AlbumRow({ album, collection, editMode, onEditClick, currentTrackId, queueTrackIds, sectionBackgroundColor, cardDisplayNumber }: AlbumRowProps) {
  const [isHovered, setIsHovered] = useState(false);
  const tracksContainerRef = useRef<HTMLDivElement>(null);
  const albumRowRef = useRef<HTMLDivElement>(null);

  // Measure cover width so card-number-box can be positioned at the boundary (above both cover and info).
  useLayoutEffect(() => {
    const row = albumRowRef.current;
    if (!row) return;
    const cover = row.querySelector('.album-row-cover');
    if (!cover) return;
    const setCoverWidth = () => {
      const w = (cover as HTMLElement).offsetWidth;
      (row as HTMLElement).style.setProperty('--cover-width', `${w}px`);
    };
    setCoverWidth();
    const ro = new ResizeObserver(setCoverWidth);
    ro.observe(cover);
    return () => ro.disconnect();
  }, []);

  // Fetch album details with tracks. staleTime so prefetched/cached data is used immediately without refetch.
  const { data: albumDetails } = useQuery({
    queryKey: ['album-details', album.id, collection.slug],
    queryFn: async () => {
      const response = await albumsApi.getById(album.id, collection.slug);
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 min – use cache when navigating back or when prefetch already loaded
  });
  
  // Dynamic sizing for tracks based on available space
  useLayoutEffect(() => {
    const container = tracksContainerRef.current;
    if (!container || !albumDetails?.tracks || albumDetails.tracks.length === 0) return;
    
    const MIN_FONT_SIZE = 11; // px
    const MAX_FONT_SIZE = 14.5; // px
    const MIN_GAP = 0.1; // rem
    const MAX_GAP = 1.75; // rem
    const LINE_HEIGHT_RATIO = 1.4; // line-height relative to font-size
    const LONG_TITLE_THRESHOLD = 22; // Character count that likely causes wrapping
    const SAFETY_BUFFER = 20; // Buffer to prevent overflow (accounts for circular badges and wrapping)
    
    const trackCount = albumDetails.tracks.length;
    const containerStyles = window.getComputedStyle(container);
    const paddingTop = parseFloat(containerStyles.paddingTop);
    const paddingBottom = parseFloat(containerStyles.paddingBottom);
    const availableHeight = container.clientHeight - paddingTop - paddingBottom - SAFETY_BUFFER;
    const remInPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const minGapPx = MIN_GAP * remInPx;
    
    // Estimate how many tracks will wrap to 2 lines based on title length
    const longTitleCount = albumDetails.tracks.filter(t => t.title.length > LONG_TITLE_THRESHOLD).length;
    const wrapRatio = longTitleCount / trackCount;
    
    const calculateAndApply = (startFontSize: number) => {
      for (let fontSize = startFontSize; fontSize >= MIN_FONT_SIZE; fontSize -= 0.5) {
        const lineHeight = fontSize * LINE_HEIGHT_RATIO;
        const avgLinesPerTrack = 1 + (wrapRatio * 1.0);
        const trackHeight = lineHeight * avgLinesPerTrack;
        
        const minTotalTrackHeight = trackHeight * trackCount;
        const minTotalGapHeight = minGapPx * (trackCount - 1);
        const minRequiredHeight = minTotalTrackHeight + minTotalGapHeight;
        
        if (minRequiredHeight <= availableHeight) {
          const remainingSpace = availableHeight - minTotalTrackHeight;
          const calculatedGapPx = remainingSpace / (trackCount - 1);
          const calculatedGapRem = calculatedGapPx / remInPx;
          const optimalGap = Math.min(MAX_GAP, Math.max(MIN_GAP, calculatedGapRem));
          
          // Apply CSS custom properties
          container.style.setProperty('--track-font-size', `${fontSize}px`);
          container.style.setProperty('--track-gap', `${optimalGap}rem`);
          container.style.setProperty('--track-line-height', String(LINE_HEIGHT_RATIO));
          
          return fontSize;
        }
      }
      
      // Fallback to minimum (shouldn't happen with proper calculations)
      container.style.setProperty('--track-font-size', `${MIN_FONT_SIZE}px`);
      container.style.setProperty('--track-gap', `${Math.min(MAX_GAP, MIN_GAP)}rem`);
      container.style.setProperty('--track-line-height', String(LINE_HEIGHT_RATIO));
      return MIN_FONT_SIZE;
    };
    
    // Initial calculation
    let currentFontSize = calculateAndApply(MAX_FONT_SIZE);
    
    // Synchronously correct any overflow before the first paint.
    // Reading scrollHeight inside useLayoutEffect forces an immediate layout
    // recalculation, so every correction happens before the browser renders
    // a single frame — eliminating any mid-animation font-size flicker.
    let safety = 20;
    while (
      container.scrollHeight > container.clientHeight &&
      currentFontSize > MIN_FONT_SIZE &&
      safety-- > 0
    ) {
      currentFontSize = calculateAndApply(currentFontSize - 0.5);
    }
    
  }, [albumDetails?.tracks]);

  const displayNumber = String(cardDisplayNumber || 0).padStart(3, '0');

  return (
    <div className="album-row" ref={albumRowRef}>
      <div className="album-row-corner-tab album-row-corner-tab-tl" aria-hidden="true" />
      <div className="album-row-corner-tab album-row-corner-tab-tr" aria-hidden="true" />
      <div className="album-row-corner-tab album-row-corner-tab-bl" aria-hidden="true" />
      <div className="album-row-corner-tab album-row-corner-tab-br" aria-hidden="true" />
      <div 
        className="album-row-cover"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="album-row-cover-image-wrap">
          {album.cover_art_path ? (
            <img
              src={`/api/media/${album.cover_art_path}`}
              alt={`${album.title} cover`}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling?.classList.remove('hidden');
              }}
            />
          ) : null}
          <div className={`album-row-cover-placeholder ${album.cover_art_path ? 'hidden' : ''}`}>
            🎵
          </div>
        </div>
        {editMode && isHovered && (
          <button
            className="album-edit-overlay-button"
            onClick={(e) => {
              e.stopPropagation();
              onEditClick(album.id);
            }}
            title="Edit Album"
            aria-label="Edit Album"
          >
            <MdEdit size={24} />
          </button>
        )}
      </div>
      
      <div
        className="album-row-info"
        style={sectionBackgroundColor ? { backgroundColor: sectionBackgroundColor } : undefined}
      >
        <div className="album-info-text">
          <div className="album-row-artist">{album.artist.toUpperCase()}</div>
          <div className="album-row-title">
            {album.title}
            {album.year != null && ` (${album.year})`}
          </div>
        </div>
        
        {albumDetails && albumDetails.tracks && (
          <div className="album-row-tracks" ref={tracksContainerRef}>
            {albumDetails.tracks.map((track, index) => {
              const isNowPlaying = currentTrackId === track.id;
              const isInQueue = queueTrackIds.includes(track.id);
              return (
                <div key={track.id} className="track-line">
                  <span className="track-number" aria-hidden="true">
                    {isNowPlaying ? (
                      <MdVolumeUp className="track-status-icon track-status-now-playing" aria-label="Now playing" />
                    ) : isInQueue ? (
                      <MdOutlineQueueMusic className="track-status-icon track-status-in-queue" aria-label="In queue" />
                    ) : (
                      String(index + 1).padStart(2, '0')
                    )}
                  </span>
                  <span className="track-title">
                    {track.title}
                    {track.is_favorite && <span className="track-icon track-favorite"><MdStar size={10} /></span>}
                    {track.is_recommended && <span className="track-icon track-recommended"><MdFiberManualRecord size={8} /></span>}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="card-number-box">{displayNumber}</div>
      <div className="album-row-cover-tab album-row-cover-tab-top" aria-hidden="true" />
      <div className="album-row-cover-tab album-row-cover-tab-bottom" aria-hidden="true" />
      <div className="album-row-cover-tab album-row-cover-tab-left" aria-hidden="true" />
      <div className="album-row-cover-tab album-row-cover-tab-right" aria-hidden="true" />
      <div className="album-row-cover-tab album-row-cover-tab-bottom-center" aria-hidden="true" />
    </div>
  );
}
