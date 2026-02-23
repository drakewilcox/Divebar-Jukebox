import clsx from 'clsx';
import styles from './JukeboxSettingsPanel.module.css';
import type { HitButtonMode } from '../types';

export interface JukeboxSettingsPanelProps {
  sortOrder: 'alphabetical' | 'curated';
  onSortOrderChange: (v: 'alphabetical' | 'curated') => void;
  showJumpToBar: boolean;
  onShowJumpToBarChange: (v: boolean) => void;
  jumpButtonType: 'letter-ranges' | 'number-ranges' | 'sections';
  onJumpButtonTypeChange: (v: 'letter-ranges' | 'number-ranges' | 'sections') => void;
  showColorCoding: boolean;
  onShowColorCodingChange: (v: boolean) => void;
  crossfadeSeconds: number;
  onCrossfadeSecondsChange: (v: number) => void;
  hitButtonMode: HitButtonMode;
  onHitButtonModeChange: (v: HitButtonMode) => void;
  sectionsEnabledForCollection: boolean;
  /** Unique prefix for radio name attributes — prevents conflicts if rendered in multiple places */
  namePrefix?: string;
}

export default function JukeboxSettingsPanel({
  sortOrder,
  onSortOrderChange,
  showJumpToBar,
  onShowJumpToBarChange,
  jumpButtonType,
  onJumpButtonTypeChange,
  showColorCoding,
  onShowColorCodingChange,
  crossfadeSeconds,
  onCrossfadeSecondsChange,
  hitButtonMode,
  onHitButtonModeChange,
  sectionsEnabledForCollection,
  namePrefix = '',
}: JukeboxSettingsPanelProps) {
  const colorCodingEnabled =
    showJumpToBar &&
    sortOrder === 'curated' &&
    sectionsEnabledForCollection &&
    jumpButtonType === 'sections';

  return (
    <>
      {/* Sort Order */}
      <div className={styles['settings-section']}>
        <h3>Sort Order</h3>
        <div className={styles['form-group']}>
          <div className={styles['radio-group']} role="radiogroup" aria-label="Sort order">
            <label className={styles['radio-option']}>
              <input
                type="radio"
                name={`${namePrefix}sortOrder`}
                value="alphabetical"
                checked={sortOrder === 'alphabetical'}
                onChange={() => onSortOrderChange('alphabetical')}
              />
              <span>Alphabetical</span>
            </label>
            <label className={styles['radio-option']}>
              <input
                type="radio"
                name={`${namePrefix}sortOrder`}
                value="curated"
                checked={sortOrder === 'curated'}
                onChange={() => onSortOrderChange('curated')}
              />
              <span>Curated</span>
            </label>
          </div>
          <p className={styles['help-text']}>
            Curated uses the collection&apos;s custom order. Alphabetical sorts by artist name
          </p>
        </div>
      </div>

      {/* Jump-To Buttons */}
      <div className={clsx(styles['settings-section'], styles['settings-block'])}>
        <div className={clsx(styles['settings-row'], styles['settings-row-toggle'])}>
          <h3>Jump-To Buttons</h3>
          <label className={styles['toggle-label']}>
            <div className={styles['toggle-label-content']}>
              <input
                type="checkbox"
                checked={showJumpToBar}
                onChange={(e) => onShowJumpToBarChange(e.target.checked)}
                className={styles['toggle-checkbox']}
              />
              <span className={styles['toggle-text']}>{showJumpToBar ? 'Show' : 'Hide'}</span>
            </div>
          </label>
        </div>
        <p className={styles['help-text']}>
          When enabled, buttons above the control bar can be used to jump to letter/number ranges or
          sections
        </p>
      </div>

      {/* Jump Button Type */}
      <div
        className={clsx(
          styles['settings-section'],
          !showJumpToBar && styles['settings-block-disabled']
        )}
      >
        <label className={clsx(styles['radio-group-label'], styles['jump-type'])}>
          Jump Button Type
        </label>
        <div
          className={styles['radio-group']}
          role="radiogroup"
          aria-label="Jump button type"
          aria-disabled={!showJumpToBar}
        >
          {sortOrder === 'alphabetical' && (
            <>
              <label className={styles['radio-option']}>
                <input
                  type="radio"
                  name={`${namePrefix}jumpButtonType`}
                  value="letter-ranges"
                  checked={jumpButtonType === 'letter-ranges'}
                  onChange={() => onJumpButtonTypeChange('letter-ranges')}
                  disabled={!showJumpToBar}
                />
                <span>Letter Ranges</span>
              </label>
              <label className={styles['radio-option']}>
                <input
                  type="radio"
                  name={`${namePrefix}jumpButtonType`}
                  value="number-ranges"
                  checked={jumpButtonType === 'number-ranges'}
                  onChange={() => onJumpButtonTypeChange('number-ranges')}
                  disabled={!showJumpToBar}
                />
                <span>Number Ranges</span>
              </label>
            </>
          )}
          {sortOrder === 'curated' && (
            <>
              <label className={styles['radio-option']}>
                <input
                  type="radio"
                  name={`${namePrefix}jumpButtonType`}
                  value="number-ranges"
                  checked={jumpButtonType === 'number-ranges'}
                  onChange={() => onJumpButtonTypeChange('number-ranges')}
                  disabled={!showJumpToBar}
                />
                <span>Number Ranges</span>
              </label>
              {sectionsEnabledForCollection && (
                <label className={styles['radio-option']}>
                  <input
                    type="radio"
                    name={`${namePrefix}jumpButtonType`}
                    value="sections"
                    checked={jumpButtonType === 'sections'}
                    onChange={() => onJumpButtonTypeChange('sections')}
                    disabled={!showJumpToBar}
                  />
                  <span>Sections</span>
                </label>
              )}
            </>
          )}
        </div>
      </div>

      {/* Color Coding */}
      <div
        className={clsx(
          styles['settings-section'],
          styles['settings-block'],
          !colorCodingEnabled && styles['settings-block-disabled']
        )}
      >
        <div className={clsx(styles['settings-row'], styles['settings-row-toggle'])}>
          <h3>Color Coding</h3>
          <label className={styles['toggle-label']}>
            <div className={styles['toggle-label-content']}>
              <input
                type="checkbox"
                checked={showColorCoding}
                onChange={(e) => onShowColorCodingChange(e.target.checked)}
                className={styles['toggle-checkbox']}
                disabled={!colorCodingEnabled}
              />
              <span className={styles['toggle-text']}>{showColorCoding ? 'Show' : 'Hide'}</span>
            </div>
          </label>
        </div>
        <p className={styles['help-text']}>
          When enabled, section buttons and album cards use each section&apos;s color
        </p>
      </div>

      {/* Crossfade */}
      <div className={styles['settings-section']}>
        <h3>Crossfade</h3>
        <div className={styles['form-group']}>
          <div className={styles['settings-crossfade-row']}>
            <input
              id={`${namePrefix}crossfade`}
              type="range"
              min={0}
              max={12}
              value={crossfadeSeconds}
              onChange={(e) => onCrossfadeSecondsChange(Number(e.target.value))}
              className={styles['settings-crossfade-slider']}
              style={{ ['--crossfade-pct' as string]: `${(crossfadeSeconds / 12) * 100}%` }}
              aria-valuemin={0}
              aria-valuemax={12}
              aria-valuenow={crossfadeSeconds}
              aria-valuetext={`${crossfadeSeconds} seconds`}
            />
            <label
              htmlFor={`${namePrefix}crossfade`}
              className={styles['settings-crossfade-label']}
            >
              {crossfadeSeconds} sec
            </label>
          </div>
          <p className={styles['help-text']}>
            * No fade is used when the next track is the next track on the same album
          </p>
        </div>
      </div>

      {/* Hit Button */}
      <div className={styles['settings-section']}>
        <h3>Hit Button</h3>
      
        <div className={styles['form-group']}>
          <div className={styles['select-wrap']}>
            <select
              value={hitButtonMode}
              onChange={(e) => onHitButtonModeChange(e.target.value as HitButtonMode)}
              className={styles['settings-select']}
              aria-label="Hit button mode"
            >
              <option
                value="prioritize-section"
                disabled={!(jumpButtonType === 'sections' && sectionsEnabledForCollection)}
              >
                Prioritize Current Section
              </option>
              <option value="favorites">Add tracks from Favorites</option>
              <option value="favorites-and-recommended">
                Add tracks from Favorites &amp; Recommended
              </option>
              <option value="any">Add any tracks from collection</option>
            </select>
          </div>
          <p className={styles['help-text']}>
          Specifies which type of 10 tracks from the collection are added to the Queue when the "H" (Hit) button is selected from the keypad.
          </p>
        </div>
      </div>
    </>
  );
}
