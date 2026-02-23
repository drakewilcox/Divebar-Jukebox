import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../services/api';
import type { Collection } from '../../types';
import './CollectionSettings.css';

type Props = {
  collection: Collection | null;
};

export default function CollectionSettings({ collection }: Props) {
  const queryClient = useQueryClient();
  const [sortOrder, setSortOrder] = useState<'alphabetical' | 'curated'>('curated');
  const [showJumpToBar, setShowJumpToBar] = useState(true);
  const [jumpButtonType, setJumpButtonType] = useState<'letter-ranges' | 'number-ranges' | 'sections'>('number-ranges');
  const [showColorCoding, setShowColorCoding] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [crossfadeSeconds, setCrossfadeSeconds] = useState(0);

  const sectionsEnabledForCollection =
    !!collection?.sections_enabled &&
    Array.isArray(collection?.sections) &&
    (collection?.sections?.length ?? 0) > 0;

  useEffect(() => {
    if (!collection) return;
    setSortOrder(
      collection.default_sort_order === 'alphabetical' || collection.default_sort_order === 'curated'
        ? collection.default_sort_order
        : 'curated'
    );
    setShowJumpToBar(collection.default_show_jump_to_bar ?? true);
    setJumpButtonType(
      collection.default_jump_button_type === 'letter-ranges' ||
        collection.default_jump_button_type === 'number-ranges' ||
        collection.default_jump_button_type === 'sections'
        ? collection.default_jump_button_type
        : 'number-ranges'
    );
    setShowColorCoding(collection.default_show_color_coding ?? true);
    setEditMode(collection.default_edit_mode ?? false);
    const cf = collection.default_crossfade_seconds;
    setCrossfadeSeconds(
      cf != null && cf >= 0 && cf <= 12 ? cf : 0
    );
  }, [collection?.id, collection?.default_sort_order, collection?.default_show_jump_to_bar, collection?.default_jump_button_type, collection?.default_show_color_coding, collection?.default_edit_mode, collection?.default_crossfade_seconds]);

  useEffect(() => {
    if (sortOrder === 'alphabetical' && jumpButtonType === 'sections') {
      setJumpButtonType('number-ranges');
    }
  }, [sortOrder]);

  useEffect(() => {
    if (sortOrder === 'curated' && !sectionsEnabledForCollection && jumpButtonType === 'sections') {
      setJumpButtonType('number-ranges');
    }
  }, [sortOrder, sectionsEnabledForCollection, jumpButtonType]);

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!collection) return Promise.reject(new Error('No collection'));
      return adminApi.updateCollectionSettings(collection.id, {
        default_sort_order: sortOrder,
        default_show_jump_to_bar: showJumpToBar,
        default_jump_button_type: jumpButtonType,
        default_show_color_coding: showColorCoding,
        default_edit_mode: editMode,
        default_crossfade_seconds: crossfadeSeconds,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
    },
  });

  const hasChanges =
    collection &&
    (sortOrder !== (collection.default_sort_order ?? 'curated') ||
      showJumpToBar !== (collection.default_show_jump_to_bar ?? true) ||
      jumpButtonType !== (collection.default_jump_button_type ?? 'number-ranges') ||
      showColorCoding !== (collection.default_show_color_coding ?? true) ||
      editMode !== (collection.default_edit_mode ?? false) ||
      crossfadeSeconds !== (collection.default_crossfade_seconds ?? 0));

  const handleSave = () => {
    if (!hasChanges) return;
    updateMutation.mutate();
  };

  if (!collection) return null;

  return (
    <div className="collection-settings">
      <p className="collection-settings-hint">
        These settings are used as defaults when viewing this collection in the jukebox.
      </p>

      <div className="collection-settings-section">
        <h3>Default Sort Order</h3>
        <div className="form-group">
          <div className="radio-group" role="radiogroup" aria-label="Sort order">
            <label className="radio-option">
              <input
                type="radio"
                name="collectionSortOrder"
                value="alphabetical"
                checked={sortOrder === 'alphabetical'}
                onChange={() => setSortOrder('alphabetical')}
              />
              <span>Alphabetical</span>
            </label>
            <label className="radio-option">
              <input
                type="radio"
                name="collectionSortOrder"
                value="curated"
                checked={sortOrder === 'curated'}
                onChange={() => setSortOrder('curated')}
              />
              <span>Curated</span>
            </label>
          </div>
          <p className="help-text">
            Curated uses the collection&apos;s custom order. Alphabetical sorts by artist name
          </p>
        </div>
      </div>

      <div className="collection-settings-section collection-settings-block">
        <div className="collection-settings-row collection-settings-row-toggle">
          <h3>Jump-To Buttons</h3>
          <label className="toggle-label">
            <div className="toggle-label-content">
              <input
                type="checkbox"
                checked={showJumpToBar}
                onChange={(e) => setShowJumpToBar(e.target.checked)}
                className="toggle-checkbox"
              />
              <span className="toggle-text">{showJumpToBar ? 'Show' : 'Hide'}</span>
            </div>
          </label>
        </div>
        <p className="help-text">
          When enabled, a bar above the carousel lets you jump to ranges or sections.
        </p>
      </div>

      <div className={`collection-settings-section form-group ${!showJumpToBar ? 'collection-settings-block-disabled' : ''}`}>
        <label className="radio-group-label jump-type">Jump</label>
        <div className="radio-group" role="radiogroup" aria-label="Jump button type" aria-disabled={!showJumpToBar}>
          {sortOrder === 'alphabetical' && (
            <>
              <label className="radio-option">
                <input
                  type="radio"
                  name="collectionJumpButtonType"
                  value="letter-ranges"
                  checked={jumpButtonType === 'letter-ranges'}
                  onChange={() => setJumpButtonType('letter-ranges')}
                  disabled={!showJumpToBar}
                />
                <span>Letter ranges</span>
              </label>
              <label className="radio-option">
                <input
                  type="radio"
                  name="collectionJumpButtonType"
                  value="number-ranges"
                  checked={jumpButtonType === 'number-ranges'}
                  onChange={() => setJumpButtonType('number-ranges')}
                  disabled={!showJumpToBar}
                />
                <span>Number ranges</span>
              </label>
            </>
          )}
          {sortOrder === 'curated' && (
            <>
              <label className="radio-option">
                <input
                  type="radio"
                  name="collectionJumpButtonType"
                  value="number-ranges"
                  checked={jumpButtonType === 'number-ranges'}
                  onChange={() => setJumpButtonType('number-ranges')}
                  disabled={!showJumpToBar}
                />
                <span>Number ranges</span>
              </label>
              {sectionsEnabledForCollection && (
                <label className="radio-option">
                  <input
                    type="radio"
                    name="collectionJumpButtonType"
                    value="sections"
                    checked={jumpButtonType === 'sections'}
                    onChange={() => setJumpButtonType('sections')}
                    disabled={!showJumpToBar}
                  />
                  <span>Sections</span>
                </label>
              )}
            </>
          )}
        </div>
        {/* <p className="help-text">
          {sortOrder === 'curated' && sectionsEnabledForCollection
            ? 'Sections shows one button per collection section and jumps to the start of each section.'
            : 'Number ranges split the list into 8 ranges (e.g. 1–10, 11–20).'}
        </p> */}
      </div>

      <div className={`collection-settings-section collection-settings-block ${!(showJumpToBar && sortOrder === 'curated' && sectionsEnabledForCollection && jumpButtonType === 'sections') ? 'collection-settings-block-disabled' : ''}`}>
        <div className="collection-settings-row collection-settings-row-toggle">
          <h3>Color Coding</h3>
          <label className="toggle-label">
            <div className="toggle-label-content">
              <input
                type="checkbox"
                checked={showColorCoding}
                onChange={(e) => setShowColorCoding(e.target.checked)}
                className="toggle-checkbox"
                disabled={!(showJumpToBar && sortOrder === 'curated' && sectionsEnabledForCollection && jumpButtonType === 'sections')}
              />
              <span className="toggle-text">{showColorCoding ? 'Show' : 'Hide'}</span>
            </div>
          </label>
        </div>
        <p className="help-text">
          When enabled, section buttons and album cards use each section&apos;s color
        </p>
      </div>

      <div className="collection-settings-section">
        <h3>Default crossfade</h3>
        <div className="form-group">
          <label htmlFor="collection-default-crossfade">
            Fade between songs: {crossfadeSeconds} second{crossfadeSeconds !== 1 ? 's' : ''}
          </label>
          <input
            id="collection-default-crossfade"
            type="range"
            min={0}
            max={12}
            value={crossfadeSeconds}
            onChange={(e) => setCrossfadeSeconds(Number(e.target.value))}
            className="collection-settings-crossfade-slider"
            style={{ ['--crossfade-pct' as string]: `${(crossfadeSeconds / 12) * 100}%` }}
            aria-valuemin={0}
            aria-valuemax={12}
            aria-valuenow={crossfadeSeconds}
          />
          <p className="help-text">
            Default crossfade (0–12 seconds) when viewing this collection. No fade is applied between consecutive tracks on the same album
          </p>
        </div>
      </div>

      <div className="collection-settings-section">
        <div className="collection-settings-row collection-settings-row-toggle">
          <h3>Edit Mode</h3>
          <label className="toggle-label">
            <div className="toggle-label-content">
              <input
                type="checkbox"
                checked={editMode}
                onChange={(e) => setEditMode(e.target.checked)}
                className="toggle-checkbox"
              />
              <span className="toggle-text">{editMode ? 'ON' : 'OFF'}</span>
            </div>
          </label>
        </div>
        <p className="help-text">
          When enabled, hover over album covers to quickly edit albums from the jukebox view.
        </p>
      </div>

      <div className="collection-settings-actions">
        <button
          type="button"
          className="submit-button"
          onClick={handleSave}
          disabled={!hasChanges || updateMutation.isPending}
        >
          {updateMutation.isPending ? 'Saving…' : 'Save defaults'}
        </button>
        {updateMutation.isError && (
          <p className="collection-settings-error">
            {(updateMutation.error as { response?: { data?: { detail?: string } }; message?: string })?.response
              ?.data?.detail ?? (updateMutation.error as Error).message}
          </p>
        )}
      </div>
    </div>
  );
}
