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
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const queuePanelRef = useRef<HTMLDivElement>(null);
  const queueToggleRef = useRef<HTMLDivElement>(null);
  const inputSectionRef = useRef<HTMLDivElement>(null);
  const jumpToBarRef = useRef<HTMLDivElement>(null);
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

  // Live position for now-playing countdown (updates from audio service)
  useEffect(() => {
    const interval = setInterval(() => {
      if (audioService.isPlaying()) {
        setNowPlayingPositionMs(audioService.getCurrentTime() * 1000);
      }
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

  // Listen for edit mode changes from localStorage
  useEffect(() => {
    const savedEditMode = localStorage.getItem('editMode');
    if (savedEditMode) {
      setEditMode(savedEditMode === 'true');
    }

    const handleEditModeChange = (event: CustomEvent) => {
      setEditMode(event.detail);
    };

    window.addEventListener('edit-mode-changed', handleEditModeChange as EventListener);
    return () => {
      window.removeEventListener('edit-mode-changed', handleEditModeChange as EventListener);
    };
  }, []);
  
  // Pad albums array to ensure even number (each card needs 2 albums)
  const paddedAlbums = React.useMemo(() => {
    if (albums.length % 2 !== 0) {
      // Add a null placeholder for odd-numbered collections
      return [...albums, null as any];
    }
    return albums;
  }, [albums]);
  
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
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['queue', collection.slug] });
      setFeedback('✓ Added!');
      const value = String(variables.albumNumber).padStart(3, '0') + String(variables.trackNumber).padStart(2, '0');
      setDisplayFlash(value);
      inputRef.current?.blur();
      setTimeout(() => setFeedback(''), 2000);
    },
    onError: () => {
      setFeedback('✗ Invalid');
      setTimeout(() => setFeedback(''), 2000);
    },
  });
  
  const handleAddToQueue = () => {
    if (numberInput.length !== 5) {
      setFeedback('✗ Enter XXX-YY');
      setTimeout(() => setFeedback(''), 2000);
      return;
    }
    const albumNumber = parseInt(numberInput.slice(0, 3), 10);
    const trackNumber = parseInt(numberInput.slice(3), 10);
    addToQueueMutation.mutate({ albumNumber, trackNumber });
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
    addToQueueMutation.mutate({
      albumNumber: parseInt(numberInput.slice(0, 3), 10),
      trackNumber: parseInt(numberInput.slice(3), 10),
    });
  }, [numberInput, addToQueueMutation]);

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

  // Jump To: 8 buttons, ranges adapt to album count (e.g. 80 albums → 1-10, 11-20, …)
  const totalAlbums = albums.length;
  const jumpRangeSize = totalAlbums <= 0 ? 0 : Math.ceil(totalAlbums / 8);
  const jumpRanges = Array.from({ length: 8 }, (_, i) => {
    const start = i * jumpRangeSize + 1;
    const end = Math.min((i + 1) * jumpRangeSize, totalAlbums);
    return { start, end, label: start <= totalAlbums ? `${start}-${end}` : '–' };
  });
  const currentRangeIndex = totalAlbums <= 0 || jumpRangeSize <= 0
    ? 0
    : Math.min(7, Math.floor(currentIndex / jumpRangeSize));

  /* Line moves in sync with cards: use target range during slide so it animates over the same 0.5s */
  const activeLineRangeIndex =
    jumpTargetIndex != null && jumpRangeSize > 0
      ? Math.min(7, Math.floor(jumpTargetIndex / jumpRangeSize))
      : slideDirection === 'left'
        ? Math.min(7, currentRangeIndex + 1)
        : slideDirection === 'right'
          ? Math.max(0, currentRangeIndex - 1)
          : currentRangeIndex;

  useLayoutEffect(() => {
    const bar = jumpToBarRef.current;
    if (!bar) return;
    const button = bar.querySelectorAll('.jump-to-button')[activeLineRangeIndex] as HTMLElement | undefined;
    if (!button) return;
    const barRect = bar.getBoundingClientRect();
    const btnRect = button.getBoundingClientRect();
    setJumpLineStyle({
      left: btnRect.left - barRect.left,
      width: btnRect.width,
    });
  }, [activeLineRangeIndex]);

  useEffect(() => {
    const bar = jumpToBarRef.current;
    if (!bar) return;
    const resizeObserver = new ResizeObserver(() => {
      const button = bar.querySelectorAll('.jump-to-button')[activeLineRangeIndex] as HTMLElement | undefined;
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
  }, [activeLineRangeIndex]);

  const handleJumpTo = (rangeIndex: number) => {
    const newIndex = Math.max(0, Math.min(rangeIndex * jumpRangeSize, paddedAlbums.length - 4));
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

  const renderAlbumRow = (album: Album | null, keyPrefix: string, idx: number) =>
    album ? (
      <AlbumRow
        key={album.id}
        album={album}
        collection={collection}
        editMode={editMode}
        onEditClick={setEditingAlbumId}
        currentTrackId={currentTrackId}
        queueTrackIds={queueTrackIds}
      />
    ) : (
      <div key={`${keyPrefix}-${idx}`} className="album-row album-row-empty"></div>
    );

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
                          {leftCard.map((album, idx) => renderAlbumRow(album, 'jump-left', idx))}
                        </div>
                      </div>
                      <div className="card-slot card-slot-right">
                        <div className="slider-card">
                          {rightCard.map((album, idx) => renderAlbumRow(album, 'jump-right', idx))}
                        </div>
                      </div>
                    </div>
                    <div className="carousel-full-slide-page">
                      <div className="card-slot card-slot-left">
                        <div className="slider-card">
                          {targetLeftCard.map((album, idx) => renderAlbumRow(album, 'target-left', idx))}
                        </div>
                      </div>
                      <div className="card-slot card-slot-right">
                        <div className="slider-card">
                          {targetRightCard.map((album, idx) => renderAlbumRow(album, 'target-right', idx))}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="carousel-full-slide-page">
                      <div className="card-slot card-slot-left">
                        <div className="slider-card">
                          {targetLeftCard.map((album, idx) => renderAlbumRow(album, 'target-left', idx))}
                        </div>
                      </div>
                      <div className="card-slot card-slot-right">
                        <div className="slider-card">
                          {targetRightCard.map((album, idx) => renderAlbumRow(album, 'target-right', idx))}
                        </div>
                      </div>
                    </div>
                    <div className="carousel-full-slide-page">
                      <div className="card-slot card-slot-left">
                        <div className="slider-card">
                          {leftCard.map((album, idx) => renderAlbumRow(album, 'jump-left', idx))}
                        </div>
                      </div>
                      <div className="card-slot card-slot-right">
                        <div className="slider-card">
                          {rightCard.map((album, idx) => renderAlbumRow(album, 'jump-right', idx))}
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
                  ? prevLeftCard.map((album, idx) => renderAlbumRow(album, 'prev-left', idx))
                  : leftCard.map((album, idx) => renderAlbumRow(album, 'left', idx))}
              </div>
            </div>
            <div className="card-slot card-slot-right">
              <div className="slider-card">
                {slideDirection === 'left' && nextRightCard.length === 2
                  ? nextRightCard.map((album, idx) => renderAlbumRow(album, 'next-right', idx))
                  : rightCard.map((album, idx) => renderAlbumRow(album, 'right', idx))}
              </div>
            </div>
            {slideDirection === 'left' && (
              <div className="slider-card-animated animate-slide-right-to-left">
                {rightCard.map((album, idx) => renderAlbumRow(album, 'slide', idx))}
              </div>
            )}
            {slideDirection === 'right' && (
              <div className="slider-card-animated animate-slide-left-to-right">
                {leftCard.map((album, idx) => renderAlbumRow(album, 'slide-left', idx))}
              </div>
            )}
            <div className="glass-overlay"></div>
          </>
        )}
      </div>

      {/* Jump To: 8 buttons to jump to sections of the carousel */}
      <div ref={jumpToBarRef} className="jump-to-bar">
        {jumpRanges.map((range, i) => (
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
        ))}
        {totalAlbums > 0 && (
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
                  onHit={() => {}}
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
}

function AlbumRow({ album, collection, editMode, onEditClick, currentTrackId, queueTrackIds }: AlbumRowProps) {
  const [isHovered, setIsHovered] = useState(false);
  const tracksContainerRef = useRef<HTMLDivElement>(null);
  
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
  
  const displayNumber = String(album.display_number || 0).padStart(3, '0');
  
  return (
    <div className="album-row">
      <div 
        className="album-row-cover"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
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
      
      <div className="album-row-info">
        <div className="vintage-card-header">
          <div className="header-left">
            <div className="header-label">TRACK NO.</div>
            {/* <div className="header-subtext">NEXT 2 #s</div> */}
            <div className="triangle-down">▼</div>
          </div>
          
          <div className="header-center">
            <div className="card-number-box">{displayNumber}</div>
          </div>
          
          <div className="header-right">
            <div className="triangle-left">◀</div>
            <div className="header-label">DISC NO.</div>
            {/* <div className="header-subtext">FIRST 3 DIG.</div> */}
          </div>
        </div>
        
        <div className="album-info-text">
          <div className="album-row-artist">{album.artist.toUpperCase()}</div>
          <div className="album-row-title">
            {/* {album.title} {album.year && `(${album.year})`} */}
            {album.title}
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
    </div>
  );
}
