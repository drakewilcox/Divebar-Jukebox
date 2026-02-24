import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../services/api';
import type { Collection, HitButtonMode } from '../../types';
import styles from './CollectionSettings.module.css';
import clsx from 'clsx';
import JukeboxSettingsPanel from '../JukeboxSettingsPanel';

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
  const [hitButtonMode, setHitButtonMode] = useState<HitButtonMode>('favorites');

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
    const hbm = collection.default_hit_button_mode;
    setHitButtonMode(
      hbm === 'prioritize-section' || hbm === 'favorites-and-recommended' || hbm === 'any'
        ? hbm
        : 'favorites'
    );
  }, [collection?.id, collection?.default_sort_order, collection?.default_show_jump_to_bar, collection?.default_jump_button_type, collection?.default_show_color_coding, collection?.default_edit_mode, collection?.default_crossfade_seconds, collection?.default_hit_button_mode]);

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

  useEffect(() => {
    if (
      hitButtonMode === 'prioritize-section' &&
      !(jumpButtonType === 'sections' && sectionsEnabledForCollection)
    ) {
      setHitButtonMode('favorites');
    }
  }, [jumpButtonType, sectionsEnabledForCollection, hitButtonMode]);

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
        default_hit_button_mode: hitButtonMode,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      if (collection?.slug) {
        queryClient.invalidateQueries({ queryKey: ['collection', collection.slug] });
      }
    },
  });

  const hasChanges =
    collection &&
    (sortOrder !== (collection.default_sort_order ?? 'curated') ||
      showJumpToBar !== (collection.default_show_jump_to_bar ?? true) ||
      jumpButtonType !== (collection.default_jump_button_type ?? 'number-ranges') ||
      showColorCoding !== (collection.default_show_color_coding ?? true) ||
      editMode !== (collection.default_edit_mode ?? false) ||
      crossfadeSeconds !== (collection.default_crossfade_seconds ?? 0) ||
      hitButtonMode !== (collection.default_hit_button_mode ?? 'favorites'));

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!collection || !hasChanges) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      updateMutation.mutate();
    }, 300);
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [
    collection?.id,
    sortOrder,
    showJumpToBar,
    jumpButtonType,
    showColorCoding,
    editMode,
    crossfadeSeconds,
    hitButtonMode,
  ]);

  if (!collection) return null;

  return (
    <div className={styles['collection-settings']}>
      <p className={styles['collection-settings-hint']}>
        These settings are used as defaults when viewing this collection in the jukebox.
      </p>

      <JukeboxSettingsPanel
        sortOrder={sortOrder}
        onSortOrderChange={setSortOrder}
        showJumpToBar={showJumpToBar}
        onShowJumpToBarChange={setShowJumpToBar}
        jumpButtonType={jumpButtonType}
        onJumpButtonTypeChange={setJumpButtonType}
        showColorCoding={showColorCoding}
        onShowColorCodingChange={setShowColorCoding}
        crossfadeSeconds={crossfadeSeconds}
        onCrossfadeSecondsChange={setCrossfadeSeconds}
        hitButtonMode={hitButtonMode}
        onHitButtonModeChange={setHitButtonMode}
        sectionsEnabledForCollection={sectionsEnabledForCollection}
        namePrefix="collection-"
      />

      <div className={styles['collection-settings-section']}>
        <div className={clsx(styles['collection-settings-row'], styles['collection-settings-row-toggle'])}>
          <h3>Edit Mode</h3>
          <label className={styles['toggle-label']}>
            <div className={styles['toggle-label-content']}>
              <input
                type="checkbox"
                checked={editMode}
                onChange={(e) => setEditMode(e.target.checked)}
                className={styles['toggle-checkbox']}
              />
              <span className={styles['toggle-text']}>{editMode ? 'ON' : 'OFF'}</span>
            </div>
          </label>
        </div>
        <p className={styles['help-text']}>
          When enabled, hover over album covers to quickly edit albums from the jukebox view.
        </p>
      </div>

      {updateMutation.isError && (
        <p className={styles['collection-settings-error']}>
          {(updateMutation.error as { response?: { data?: { detail?: string } }; message?: string })?.response
            ?.data?.detail ?? (updateMutation.error as Error).message}
        </p>
      )}
    </div>
  );
}
