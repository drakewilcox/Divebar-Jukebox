import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { MdDragIndicator, MdEdit, MdDelete } from 'react-icons/md';
import { collectionsApi, adminApi } from '../../services/api';
import type { Album } from '../../types';
import AlbumEditModal from './AlbumEditModal';
import './SlotManagement.css';

const SLOTS_PER_SECTION = 4;
const COLS = 2;
const ROWS = 2;

/** Index in ordered list → (section, row, col) for 2x2 grid. Slot order: #1 top-left, #2 bottom-left, #3 top-right, #4 bottom-right. */
function indexToGrid(index: number): { section: number; row: number; col: number } {
  const section = Math.floor(index / SLOTS_PER_SECTION);
  const pos = index % SLOTS_PER_SECTION;
  const row = pos % ROWS;
  const col = Math.floor(pos / ROWS);
  return { section, row, col };
}

/** (section, row, col) → index. */
function gridToIndex(section: number, row: number, col: number): number {
  return section * SLOTS_PER_SECTION + row + col * ROWS;
}

const SLOT_ID_PREFIX = 'slot-';
function slotId(index: number): string {
  return `${SLOT_ID_PREFIX}${index}`;
}
function parseSlotId(id: string): number | null {
  if (!id.startsWith(SLOT_ID_PREFIX)) return null;
  const n = parseInt(id.slice(SLOT_ID_PREFIX.length), 10);
  return Number.isNaN(n) ? null : n;
}

function SlotCard({ album, slotNumber, isDragging }: { album: Album; slotNumber: number; isDragging?: boolean }) {
  return (
    <div className={`slot-card ${isDragging ? 'slot-card-dragging' : ''}`}>
      <div className="slot-card-number">{slotNumber}</div>
          <div className="slot-card-drag-handle" aria-hidden>
            <MdDragIndicator size={18} />
          </div>
          <div className="slot-card-cover">
            {album.cover_art_path ? (
              <img src={`/api/media/${album.cover_art_path}`} alt="" />
            ) : (
              <div className="slot-card-cover-placeholder">No art</div>
            )}
          </div>
          <div className="slot-card-info">
            <div className="slot-card-title">{album.title}</div>
            <div className="slot-card-artist">{album.artist}</div>
            <div className="slot-card-year">{album.year ?? '—'}</div>
          </div>
    </div>
  );
}

function DraggableSlotCard({
  album,
  slotIndex,
  slotNumber,
  onEdit,
  onRemove,
}: {
  album: Album;
  slotIndex: number;
  slotNumber: number;
  onEdit: (albumId: string) => void;
  onRemove: (albumId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: album.id,
    data: { album, slotIndex },
  });

  return (
    <div ref={setNodeRef} className="slot-cell-inner" {...attributes}>
      <div className="slot-cell-droppable" data-slot-index={slotIndex}>
        <div
          className={`slot-card slot-card-in-slot ${isDragging ? 'slot-card-dragging' : ''}`}
          {...listeners}
        >
          <div className="slot-card-number">{slotNumber}</div>
          <div className="slot-card-drag-handle" aria-hidden>
            <MdDragIndicator size={18} />
          </div>
          <div className="slot-card-cover">
            {album.cover_art_path ? (
              <img src={`/api/media/${album.cover_art_path}`} alt="" />
            ) : (
              <div className="slot-card-cover-placeholder">No art</div>
            )}
          </div>
          <div className="slot-card-info">
            <div className="slot-card-title">{album.title}</div>
            <div className="slot-card-artist">{album.artist}</div>
            <div className="slot-card-year">{album.year ?? '—'}</div>
          </div>
          <div
            className="slot-card-actions"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="slot-card-action-btn"
              onClick={() => onEdit(album.id)}
              aria-label="Edit album"
              title="Edit album"
            >
              <MdEdit size={16} />
            </button>
            <button
              type="button"
              className="slot-card-action-btn slot-card-action-remove"
              onClick={() => onRemove(album.id)}
              aria-label="Remove from collection"
              title="Remove from collection"
            >
              <MdDelete size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DroppableSlot({
  slotIndex,
  slotNumber,
  children,
}: {
  slotIndex: number;
  slotNumber: number;
  album: Album;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: slotId(slotIndex),
    data: { slotIndex, slotNumber },
  });

  return (
    <div
      ref={setNodeRef}
      className={`slot-cell ${isOver ? 'slot-cell-over' : ''}`}
      data-slot-number={slotNumber}
    >
      {children}
    </div>
  );
}

type SlotManagementProps = {
  /** When provided, use this collection and hide the collection selector (e.g. when embedded in Collection Manager). */
  collectionSlug?: string;
};

export default function SlotManagement({ collectionSlug }: SlotManagementProps) {
  const queryClient = useQueryClient();
  const [selectedSlug, setSelectedSlug] = useState<string>('');
  const [orderedAlbums, setOrderedAlbums] = useState<Album[]>([]);
  const [hasLocalChanges, setHasLocalChanges] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingAlbumId, setEditingAlbumId] = useState<string | null>(null);

  const effectiveSlug = collectionSlug ?? selectedSlug;

  const { data: collections } = useQuery({
    queryKey: ['collections'],
    queryFn: async () => {
      const response = await collectionsApi.getAll();
      return response.data.filter((c: { slug: string }) => c.slug !== 'all');
    },
  });

  const { data: serverAlbums, isSuccess: albumsLoaded } = useQuery({
    queryKey: ['collection-albums', effectiveSlug],
    queryFn: async () => {
      const response = await collectionsApi.getAlbums(effectiveSlug);
      return response.data;
    },
    enabled: !!effectiveSlug,
  });

  useEffect(() => {
    if (effectiveSlug && albumsLoaded && serverAlbums) {
      setOrderedAlbums(serverAlbums);
      setHasLocalChanges(false);
    }
  }, [effectiveSlug, albumsLoaded, serverAlbums]);

  const saveMutation = useMutation({
    mutationFn: (albums: Album[]) =>
      adminApi.setCollectionAlbumOrder(effectiveSlug, albums.map((a) => a.id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection-albums', effectiveSlug] });
      setHasLocalChanges(false);
    },
    onError: () => {
      setHasLocalChanges(true);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (albumId: string) => adminApi.updateCollectionAlbums(effectiveSlug, albumId, 'remove'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection-albums', effectiveSlug] });
      queryClient.invalidateQueries({ queryKey: ['admin-albums'] });
    },
  });

  const handleEdit = (albumId: string) => {
    setEditingAlbumId(albumId);
  };

  const handleRemove = async (albumId: string) => {
    if (!effectiveSlug) return;
    if (!confirm('Remove this album from the collection?')) return;
    if (hasLocalChanges) {
      await saveMutation.mutateAsync(orderedAlbums);
    }
    removeMutation.mutate(albumId);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const fromIndex = orderedAlbums.findIndex((a) => a.id === active.id);
    if (fromIndex === -1) return;
    // Resolve target index: collision may report the slot (slot-N) or the card (album uuid)
    let toIndex: number;
    const slotIndex = parseSlotId(String(over.id));
    if (slotIndex !== null) {
      toIndex = slotIndex;
    } else {
      const overAlbumIndex = orderedAlbums.findIndex((a) => a.id === over.id);
      if (overAlbumIndex === -1) return;
      toIndex = overAlbumIndex;
    }
    if (fromIndex === toIndex) return;
    const clampedTo = Math.min(Math.max(0, toIndex), orderedAlbums.length - 1);
    const newOrder = arrayMove(orderedAlbums, fromIndex, clampedTo);
    setOrderedAlbums(newOrder);
    saveMutation.mutate(newOrder);
  };

  // Build section grids: each section is 2x2. Index order: #1 top-left, #2 bottom-left, #3 top-right, #4 bottom-right.
  const numSections = Math.ceil(orderedAlbums.length / SLOTS_PER_SECTION);
  const sectionGrids: { section: number; grid: ({ index: number; row: number; col: number; album: Album; slotNumber: number } | null)[][] }[] = [];
  for (let s = 0; s < numSections; s++) {
    const grid: ({ index: number; row: number; col: number; album: Album; slotNumber: number } | null)[][] = [
      [null, null],
      [null, null],
    ];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const index = gridToIndex(s, row, col);
        if (index < orderedAlbums.length) {
          grid[row][col] = {
            index,
            row,
            col,
            album: orderedAlbums[index],
            slotNumber: index + 1,
          };
        }
      }
    }
    sectionGrids.push({ section: s, grid });
  }

  const activeAlbum = activeId ? orderedAlbums.find((a) => a.id === activeId) : null;
  const activeSlotNum = activeId ? orderedAlbums.findIndex((a) => a.id === activeId) + 1 : 0;

  return (
    <div className={`slot-management ${collectionSlug != null ? 'slot-management-embedded' : ''}`}>
      {collectionSlug == null && (
        <div className="slot-management-controls">
          <label htmlFor="slot-collection-select">Collection</label>
          <select
            id="slot-collection-select"
            value={selectedSlug}
            onChange={(e) => setSelectedSlug(e.target.value)}
            className="slot-collection-select"
          >
            <option value="">Select a collection…</option>
            {collections?.map((c: { id: string; name: string; slug: string }) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {effectiveSlug && (
        <div className="slot-list-scroll">
          <div className="slot-list-wrap">
          {orderedAlbums.length === 0 && !albumsLoaded ? (
            <p className="slot-loading">Loading albums…</p>
          ) : orderedAlbums.length === 0 ? (
            <p className="slot-empty">This collection has no albums. Add albums in Collection Manager first.</p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div className="slot-grid-container">
                {sectionGrids.map(({ section, grid }) => (
                  <div key={section} className="slot-section">
                    <div className="slot-section-grid">
                      {[0, 1].map((row) =>
                        [0, 1].map((col) => {
                          const cell = grid[row][col];
                          const index = gridToIndex(section, row, col);
                          const slotNumber = index + 1;
                          const isDroppable = index < orderedAlbums.length;
                          if (!cell) {
                            return (
                              <div key={`${section}-${row}-${col}`} className="slot-cell slot-cell-empty-wrap" data-slot-number={slotNumber}>
                                <div className="slot-cell-empty">
                                  <span className="slot-cell-empty-num">{slotNumber}</span>
                                  <span className="slot-cell-empty-hint">Empty</span>
                                </div>
                              </div>
                            );
                          }
                          return (
                            <DroppableSlot
                              key={`${section}-${row}-${col}`}
                              slotIndex={index}
                              slotNumber={slotNumber}
                              album={cell.album}
                            >
                              <DraggableSlotCard
                                album={cell.album}
                                slotIndex={cell.index}
                                slotNumber={cell.slotNumber}
                                onEdit={handleEdit}
                                onRemove={handleRemove}
                              />
                            </DroppableSlot>
                          );
                        })
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <DragOverlay dropAnimation={null}>
                {activeAlbum ? (
                  <div className="slot-card-overlay">
                    <SlotCard album={activeAlbum} slotNumber={activeSlotNum} isDragging />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
          </div>
        </div>
      )}

      {editingAlbumId && (
        <AlbumEditModal
          albumId={editingAlbumId}
          onClose={() => {
            setEditingAlbumId(null);
            queryClient.invalidateQueries({ queryKey: ['collection-albums', effectiveSlug] });
          }}
        />
      )}
    </div>
  );
}
