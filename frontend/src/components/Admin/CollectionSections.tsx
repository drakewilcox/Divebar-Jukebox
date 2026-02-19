import { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MdAdd, MdDelete, MdDragIndicator } from 'react-icons/md';
import { adminApi } from '../../services/api';
import type { Collection, CollectionSection } from '../../types';
import { SECTION_COLORS, MIN_SECTIONS, MAX_SECTIONS } from './SectionColors';
import './CollectionSections.css';

const ROW_HEIGHT_PX = 48;

type AlbumInOrder = {
  id: string;
  title: string;
  artist: string;
  cover_art_path?: string | null;
  display_number?: number;
};

type Props = {
  collection: Collection | null;
  albums?: AlbumInOrder[];
};

function defaultSections(): CollectionSection[] {
  return [
    { order: 0, name: 'Section 1', color: SECTION_COLORS[0] },
    { order: 1, name: 'Section 2', color: SECTION_COLORS[1] },
    { order: 2, name: 'Section 3', color: SECTION_COLORS[2] },
  ];
}

function defaultRanges(albumCount: number, sectionCount: number): { start_slot: number; end_slot: number }[] {
  if (albumCount <= 0 || sectionCount <= 0) return [];
  const ranges: { start_slot: number; end_slot: number }[] = [];
  for (let i = 0; i < sectionCount; i++) {
    const start = Math.floor((i * albumCount) / sectionCount) + 1;
    const end = Math.floor(((i + 1) * albumCount) / sectionCount);
    ranges.push({ start_slot: start, end_slot: end });
  }
  return ranges;
}

function nextUnusedColor(used: string[]): string {
  for (const c of SECTION_COLORS) {
    if (!used.includes(c)) return c;
  }
  return SECTION_COLORS[used.length % SECTION_COLORS.length];
}

export default function CollectionSections({ collection, albums = [] }: Props) {
  const queryClient = useQueryClient();
  const [sectionsEnabled, setSectionsEnabled] = useState(false);
  const [sections, setSections] = useState<CollectionSection[]>([]);
  const [openColorIndex, setOpenColorIndex] = useState<number | null>(null);
  const [draggingBoundary, setDraggingBoundary] = useState<number | null>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const tableBodyRef = useRef<HTMLTableSectionElement>(null);

  const albumCount = albums.length;
  const sortedSections = [...sections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  // Sync from server: preserve start_slot/end_slot when present
  useEffect(() => {
    if (!collection) return;
    setSectionsEnabled(collection.sections_enabled ?? false);
    const raw = collection.sections;
    if (Array.isArray(raw) && raw.length >= MIN_SECTIONS && raw.length <= MAX_SECTIONS) {
      const sorted = [...raw].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setSections(
        sorted.map((s, i) => ({
          order: i,
          name: s.name || '',
          color: s.color || SECTION_COLORS[i % SECTION_COLORS.length],
          start_slot: s.start_slot,
          end_slot: s.end_slot,
        }))
      );
    } else {
      setSections(defaultSections());
    }
  }, [collection?.id, collection?.sections_enabled, collection?.sections]);

  // When sections are enabled and we have albums but no ranges, fill default ranges
  useEffect(() => {
    if (!sectionsEnabled || albumCount === 0 || sections.length === 0) return;
    const hasRanges = sortedSections.every((s) => s.start_slot != null && s.end_slot != null);
    if (hasRanges) return;
    const ranges = defaultRanges(albumCount, sections.length);
    setSections((prev) =>
      prev.map((s, i) => ({
        ...s,
        order: i,
        start_slot: ranges[i]?.start_slot ?? 1,
        end_slot: ranges[i]?.end_slot ?? albumCount,
      }))
    );
  }, [sectionsEnabled, albumCount, sections.length]); // intentional: run when album count or section count changes

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!collection) return Promise.reject(new Error('No collection'));
      return adminApi.updateCollectionSections(collection.id, {
        sections_enabled: sectionsEnabled,
        sections: sectionsEnabled ? sections : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
    },
  });

  const handleEnableChange = (enabled: boolean) => {
    setSectionsEnabled(enabled);
    if (enabled && sections.length < MIN_SECTIONS) {
      setSections(defaultSections());
    }
    setOpenColorIndex(null);
  };

  const handleSave = () => {
    if (!collection) return;
    if (sectionsEnabled && (sections.length < MIN_SECTIONS || sections.length > MAX_SECTIONS)) return;
    updateMutation.mutate();
  };

  const addSection = () => {
    if (sections.length >= MAX_SECTIONS) return;
    const used = sections.map((s) => s.color);
    const newSection: CollectionSection = {
      order: sections.length,
      name: `Section ${sections.length + 1}`,
      color: nextUnusedColor(used),
    };
    const next = [...sections, newSection];
    if (albumCount > 0) {
      const nextRanges = defaultRanges(albumCount, next.length);
      setSections(
        next.map((s, i) => ({
          ...s,
          order: i,
          start_slot: nextRanges[i]?.start_slot ?? 1,
          end_slot: nextRanges[i]?.end_slot ?? albumCount,
        }))
      );
    } else {
      setSections(next);
    }
    setOpenColorIndex(null);
  };

  const removeSection = (index: number) => {
    if (sections.length <= MIN_SECTIONS) return;
    const next = sections.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i }));
    if (albumCount > 0 && next.length > 0) {
      const nextRanges = defaultRanges(albumCount, next.length);
      setSections(
        next.map((s, i) => ({
          ...s,
          start_slot: nextRanges[i]?.start_slot ?? 1,
          end_slot: nextRanges[i]?.end_slot ?? albumCount,
        }))
      );
    } else {
      setSections(next);
    }
    setOpenColorIndex(null);
  };

  const updateSection = (index: number, patch: Partial<CollectionSection>) => {
    setSections((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const setSectionColor = (index: number, color: string) => {
    updateSection(index, { color });
    setOpenColorIndex(null);
  };

  const getSectionIndexForSlot = useCallback(
    (slot: number): number => {
      for (let i = 0; i < sortedSections.length; i++) {
        const s = sortedSections[i];
        const start = s.start_slot ?? 1;
        const end = s.end_slot ?? albumCount;
        if (slot >= start && slot <= end) return i;
      }
      return 0;
    },
    [sortedSections, albumCount]
  );

  const moveBoundary = useCallback(
    (sectionIndex: number, newEndSlot: number) => {
      const s0 = sortedSections[sectionIndex];
      const s1 = sortedSections[sectionIndex + 1];
      if (!s0 || !s1) return;
      const minEnd = s0.start_slot ?? 1;
      const maxEnd = (s1.end_slot ?? albumCount) - 1;
      const clamped = Math.min(Math.max(newEndSlot, minEnd), maxEnd);
      setSections((prev) =>
        prev.map((s, i) => {
          if (i === sectionIndex) return { ...s, end_slot: clamped };
          if (i === sectionIndex + 1) return { ...s, start_slot: clamped + 1 };
          return s;
        })
      );
    },
    [sortedSections, albumCount]
  );

  useEffect(() => {
    if (draggingBoundary === null) return;
    const onMove = (e: MouseEvent) => {
      const tbody = tableBodyRef.current;
      if (!tbody) return;
      const rows = tbody.querySelectorAll<HTMLTableRowElement>('tr.collection-sections-album-row');
      const y = e.clientY;
      for (let i = 0; i < rows.length; i++) {
        const rect = rows[i].getBoundingClientRect();
        if (y >= rect.top && y <= rect.bottom) {
          const slot = parseInt(rows[i].getAttribute('data-slot') ?? '1', 10);
          moveBoundary(draggingBoundary, slot);
          return;
        }
      }
      // clamp to first or last slot if above/below table
      const first = rows[0];
      const last = rows[rows.length - 1];
      if (first && y < first.getBoundingClientRect().top) moveBoundary(draggingBoundary, 1);
      else if (last && y > last.getBoundingClientRect().bottom) moveBoundary(draggingBoundary, albumCount);
    };
    const onUp = () => setDraggingBoundary(null);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('mouseleave', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('mouseleave', onUp);
    };
  }, [draggingBoundary, albumCount, moveBoundary]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (openColorIndex !== null && colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setOpenColorIndex(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [openColorIndex]);

  if (!collection) return null;

  const canAdd = sections.length < MAX_SECTIONS;
  const canRemove = sections.length > MIN_SECTIONS;
  const hasRanges = sortedSections.every((s) => s.start_slot != null && s.end_slot != null);
  const hasChanges =
    collection.sections_enabled !== sectionsEnabled ||
    (sectionsEnabled && JSON.stringify(collection.sections ?? []) !== JSON.stringify(sections));

  return (
    <div className="collection-sections">
      <div className="collection-sections-enable">
        <label className="collection-sections-enable-label">
          <input
            type="checkbox"
            checked={sectionsEnabled}
            onChange={(e) => handleEnableChange(e.target.checked)}
            aria-label="Enable sections for this collection"
          />
          <span>Enable sections</span>
        </label>
      </div>

      {sectionsEnabled && (
        <>
          <p className="collection-sections-hint">
            Add 3–10 section labels. Each section has a number, name, and color. Click the color box to choose a color.
          </p>
          <div className="collection-sections-list">
            {sections.map((section, index) => (
              <div key={index} className="collection-section-row">
                <span className="collection-section-number">{index + 1}</span>
                <input
                  type="text"
                  className="collection-section-name"
                  value={section.name}
                  onChange={(e) => updateSection(index, { name: e.target.value })}
                  placeholder="Section name"
                  aria-label={`Section ${index + 1} name`}
                />
                <div className="collection-section-color-wrap" ref={index === openColorIndex ? colorPickerRef : null}>
                  <button
                    type="button"
                    className="collection-section-color-btn"
                    onClick={() => setOpenColorIndex(openColorIndex === index ? null : index)}
                    style={{ backgroundColor: section.color }}
                    aria-label={`Section ${index + 1} color`}
                    title="Choose color"
                  />
                  {openColorIndex === index && (
                    <div className="collection-section-color-picker" role="dialog" aria-label="Choose color">
                      {SECTION_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className="collection-section-color-swatch"
                          style={{ backgroundColor: color }}
                          onClick={() => setSectionColor(index, color)}
                          title={color}
                          aria-label={`Color ${color}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="collection-section-remove"
                  onClick={() => removeSection(index)}
                  disabled={!canRemove}
                  aria-label="Remove section"
                  title="Remove section"
                >
                  <MdDelete size={20} />
                </button>
              </div>
            ))}
          </div>
          <div className="collection-sections-actions">
            <button type="button" className="collection-sections-add" onClick={addSection} disabled={!canAdd}>
              <MdAdd size={20} />
              Add section
            </button>
            {hasChanges && (
              <button
                type="button"
                className="collection-sections-save"
                onClick={handleSave}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? 'Saving…' : 'Save sections'}
              </button>
            )}
          </div>
          {updateMutation.isError && (
            <p className="collection-sections-error">
              {(updateMutation.error as { response?: { data?: { detail?: string } }; message?: string })?.response
                ?.data?.detail ?? (updateMutation.error as Error).message}
            </p>
          )}

          {sectionsEnabled && hasRanges && albumCount > 0 && (
            <div className="collection-sections-ranges">
              <h3 className="collection-sections-ranges-title">Section ranges</h3>
              <p className="collection-sections-ranges-hint">
                Drag the dividers between sections to change how many albums are in each section.
              </p>
              <div className="collection-sections-list-wrap">
                <table className="collection-sections-table">
                  <colgroup>
                    <col className="collection-sections-col-bar" />
                    <col className="collection-sections-col-slot" />
                    <col className="collection-sections-col-cover" />
                    <col className="collection-sections-col-info" />
                  </colgroup>
                  <tbody ref={tableBodyRef}>
                    {albums.map((album, index) => {
                      const slot = index + 1;
                      const sectionIndex = getSectionIndexForSlot(slot);
                      const section = sortedSections[sectionIndex];
                      const isFirstInSection =
                        section && (section.start_slot ?? 1) === slot;
                      const rowSpan = section
                        ? (section.end_slot ?? slot) - (section.start_slot ?? slot) + 1
                        : 1;
                      const showDivider =
                        sectionIndex < sortedSections.length - 1 &&
                        section?.end_slot === slot;

                      return (
                        <Fragment key={album.id}>
                          <tr className="collection-sections-album-row" data-slot={slot} style={{ height: ROW_HEIGHT_PX }}>
                            {isFirstInSection ? (
                              <td
                                rowSpan={rowSpan}
                                className="collection-sections-bar-cell"
                                style={{ backgroundColor: section?.color }}
                              >
                                <span className="collection-sections-bar-number">{sectionIndex + 1}</span>
                              </td>
                            ) : null}
                            <td className="collection-sections-slot-cell">{slot}</td>
                            <td className="collection-sections-cover-cell">
                              {album.cover_art_path ? (
                                <img
                                  src={`/api/media/${album.cover_art_path}`}
                                  alt=""
                                  className="collection-sections-cover-img"
                                />
                              ) : (
                                <div className="collection-sections-cover-placeholder">No art</div>
                              )}
                            </td>
                            <td className="collection-sections-info-cell">
                              <div className="collection-sections-info-title">{album.title}</div>
                              <div className="collection-sections-info-artist">{album.artist}</div>
                            </td>
                          </tr>
                          {showDivider && (() => {
                            const sectionAbove = section;
                            const sectionBelow = sortedSections[sectionIndex + 1];
                            return (
                              <tr
                                className="collection-sections-divider-row"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setDraggingBoundary(sectionIndex);
                                }}
                                role="separator"
                              >
                                <td className="collection-sections-divider-bar-cell">
                                  <span className="collection-sections-divider-grip">
                                    <MdDragIndicator size={18} style={{ transform: 'rotate(90deg)' }} />
                                  
                                  </span>
                                </td>
                                <td colSpan={3} className="collection-sections-divider-spacer">
                                  <div className="collection-sections-divider-spacer-inner">
                                    <div
                                      className="collection-sections-divider-spacer-top"
                                      style={{ backgroundColor: sectionAbove?.color }}
                                    >
                                      <span className="collection-sections-divider-section-name">
                                        {sectionAbove?.name ?? ''}
                                      </span>
                                    </div>
                                    <div
                                      className="collection-sections-divider-spacer-bottom"
                                      style={{ backgroundColor: sectionBelow?.color }}
                                    >
                                      <span className="collection-sections-divider-section-name">
                                        {sectionBelow?.name ?? ''}
                                      </span>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            );
                          })()}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
