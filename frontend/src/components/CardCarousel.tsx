import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MdStar, MdFiberManualRecord, MdSettings } from 'react-icons/md';
import { Album, Collection } from '../types';
import { albumsApi, queueApi, playbackApi } from '../services/api';
import audioService from '../services/audio';
import SettingsModal from './SettingsModal';
import AlbumEditModal from './Admin/AlbumEditModal';
import LCDDisplay from './LCDDisplay';
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
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  const [numberInput, setNumberInput] = useState('');
  const [feedback, setFeedback] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingAlbumId, setEditingAlbumId] = useState<string | null>(null);
  const [pressedButton, setPressedButton] = useState<'prev' | 'next' | null>(null);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [nowPlayingPositionMs, setNowPlayingPositionMs] = useState(0);
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  
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
  
  // Show current 4 albums + next 2 (for smooth sliding)
  const currentAlbums = paddedAlbums.slice(currentIndex, currentIndex + 4);
  const nextAlbums = paddedAlbums.slice(currentIndex + 2, currentIndex + 6);
  const prevAlbums = paddedAlbums.slice(Math.max(0, currentIndex - 2), currentIndex + 2);
  
  // Current cards
  const leftCard = currentAlbums.slice(0, 2);
  const rightCard = currentAlbums.slice(2, 4);
  
  // Next set for sliding left
  const nextRightCard = nextAlbums.slice(2, 4);
  
  // Previous set for sliding right
  const prevLeftCard = prevAlbums.slice(0, 2);
  
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue', collection.slug] });
      setFeedback('✓ Added!');
      setNumberInput('');
      inputRef.current?.blur(); // Unfocus input so arrow keys work
      setTimeout(() => setFeedback(''), 2000);
    },
    onError: () => {
      setFeedback('✗ Invalid');
      setTimeout(() => setFeedback(''), 2000);
    },
  });
  
  const handleAddToQueue = () => {
    if (numberInput.length < 3) {
      setFeedback('✗ Enter XXX-YY');
      setTimeout(() => setFeedback(''), 2000);
      return;
    }
    
    // Parse input: XXX or XXXYY
    let albumNumber: number;
    let trackNumber: number = 0;
    
    if (numberInput.length <= 3) {
      albumNumber = parseInt(numberInput, 10);
    } else {
      albumNumber = parseInt(numberInput.slice(0, 3), 10);
      trackNumber = parseInt(numberInput.slice(3), 10);
    }
    
    addToQueueMutation.mutate({ albumNumber, trackNumber });
  };
  
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
  
  // Auto-focus input when typing numbers
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Only handle number keys
      if (/^[0-9]$/.test(e.key)) {
        // If not focused on any input, focus our number input and add the digit
        if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
          e.preventDefault();
          inputRef.current?.focus();
          setNumberInput((prev) => {
            if (prev.length < 5) {
              return prev + e.key;
            }
            return prev;
          });
        }
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
  
  return (
    <div className="card-carousel">
      <div className="carousel-container">
        {/* Left card slot */}
        <div className="card-slot card-slot-left">
          <div className="slider-card">
            {slideDirection === 'right' && prevLeftCard.length === 2 ? (
              // During left arrow: show incoming previous card underneath
              prevLeftCard.map((album, idx) => 
                album ? (
                  <AlbumRow 
                    key={album.id} 
                    album={album} 
                    collection={collection}
                    editMode={editMode}
                    onEditClick={setEditingAlbumId}
                  />
                ) : (
                  <div key={`empty-${idx}`} className="album-row album-row-empty"></div>
                )
              )
            ) : (
              // Normal: show current left card
              leftCard.map((album, idx) => 
                album ? (
                  <AlbumRow 
                    key={album.id} 
                    album={album} 
                    collection={collection}
                    editMode={editMode}
                    onEditClick={setEditingAlbumId}
                  />
                ) : (
                  <div key={`empty-${idx}`} className="album-row album-row-empty"></div>
                )
              )
            )}
          </div>
        </div>
        
        {/* Right card slot */}
        <div className="card-slot card-slot-right">
          <div className="slider-card">
            {slideDirection === 'left' && nextRightCard.length === 2 ? (
              // During right arrow: show incoming next card underneath
              nextRightCard.map((album, idx) => 
                album ? (
                  <AlbumRow 
                    key={album.id} 
                    album={album} 
                    collection={collection}
                    editMode={editMode}
                    onEditClick={setEditingAlbumId}
                  />
                ) : (
                  <div key={`empty-right-${idx}`} className="album-row album-row-empty"></div>
                )
              )
            ) : (
              // Normal: show current right card
              rightCard.map((album, idx) => 
                album ? (
                  <AlbumRow 
                    key={album.id} 
                    album={album} 
                    collection={collection}
                    editMode={editMode}
                    onEditClick={setEditingAlbumId}
                  />
                ) : (
                  <div key={`empty-right-${idx}`} className="album-row album-row-empty"></div>
                )
              )
            )}
          </div>
        </div>
        
        {/* Animated sliding cards (absolutely positioned over carousel) */}
        {slideDirection === 'left' && (
          // Clicking right arrow: Right card slides left to cover left card
          <div className="slider-card-animated animate-slide-right-to-left">
            {rightCard.map((album, idx) => 
              album ? (
                <AlbumRow 
                  key={album.id} 
                  album={album} 
                  collection={collection}
                  editMode={editMode}
                  onEditClick={setEditingAlbumId}
                />
              ) : (
                <div key={`empty-slide-${idx}`} className="album-row album-row-empty"></div>
              )
            )}
          </div>
        )}
        
        {slideDirection === 'right' && (
          // Clicking left arrow: Left card slides right to cover right card
          <div className="slider-card-animated animate-slide-left-to-right">
            {leftCard.map((album, idx) => 
              album ? (
                <AlbumRow 
                  key={album.id} 
                  album={album} 
                  collection={collection}
                  editMode={editMode}
                  onEditClick={setEditingAlbumId}
                />
              ) : (
                <div key={`empty-slide-left-${idx}`} className="album-row album-row-empty"></div>
              )
            )}
          </div>
        )}
        
        {/* Glass overlay effect (top layer) */}
        <div className="glass-overlay"></div>
      </div>
      
      <div className="carousel-controls-wrapper">
        {/* Upward-expanding queue panel */}
        <div className={`queue-panel ${isQueueOpen ? 'open' : ''}`}>
          <div className="queue-panel-content">
            <QueueDisplay collection={collection} />
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

          <div className="input-section">
            <div onClick={() => inputRef.current?.focus()}>
              <LCDDisplay value={formatDisplay(numberInput)} />
            </div>
            <input
              ref={inputRef}
              type="text"
              className="hidden-input"
              onKeyDown={handleKeyDown}
              aria-label="Album and track number input"
            />
            {feedback && <span className="input-feedback">{feedback}</span>}
          </div>
        </div>
        
        <div className="queue-controls-center">
          <div
            className="now-playing-mini"
            role="button"
            tabIndex={0}
            onClick={() => setIsQueueOpen(!isQueueOpen)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsQueueOpen(prev => !prev); } }}
            title={isQueueOpen ? 'Close queue (Q)' : 'Open queue (Q)'}
          >
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
}

function AlbumRow({ album, collection, editMode, onEditClick }: AlbumRowProps) {
  const [isHovered, setIsHovered] = useState(false);
  const tracksContainerRef = useRef<HTMLDivElement>(null);
  
  // Fetch album details with tracks
  const { data: albumDetails } = useQuery({
    queryKey: ['album-details', album.id, collection.slug],
    queryFn: async () => {
      const response = await albumsApi.getById(album.id, collection.slug);
      return response.data;
    },
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
    
    // Check actual rendered height after a microtask (let DOM update)
    requestAnimationFrame(() => {
      // Keep reducing font size until no overflow
      const checkAndAdjust = () => {
        const hasOverflow = container.scrollHeight > container.clientHeight;
        
        if (hasOverflow && currentFontSize > MIN_FONT_SIZE) {
          // Overflow detected, try smaller font sizes
          currentFontSize = calculateAndApply(currentFontSize - 0.5);
          
          // Check again after next frame
          requestAnimationFrame(checkAndAdjust);
        }
      };
      
      checkAndAdjust();
    });
    
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
          >
            ✎ Edit
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
            {albumDetails.tracks.map((track, index) => (
              <div key={track.id} className="track-line">
                <span className="track-number">{String(index + 1).padStart(2, '0')}</span>
                <span className="track-title">
                  {track.title}
                  {track.is_favorite && <span className="track-icon track-favorite"><MdStar size={10} /></span>}
                  {track.is_recommended && <span className="track-icon track-recommended"><MdFiberManualRecord size={8} /></span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
