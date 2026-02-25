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

  const jumpButtonTypeOptions = sortOrder === 'alphabetical'
    ? [
        { value: 'letter-ranges' as const, label: 'Letter Ranges' },
        { value: 'number-ranges' as const, label: 'Number Ranges' },
      ]
    : [
        { value: 'number-ranges' as const, label: 'Number Ranges' },
        ...(sectionsEnabledForCollection ? [{ value: 'sections' as const, label: 'Sections' }] : []),
      ];

  return (
    <>
      {/* Sort Order */}
      <div className={styles['settings-section']}>
        <div className={styles['settings-row']}>
          <div className={styles['settings-row-left']}>
            <h3 className={styles['settings-row-title']}>Sort Order</h3>
            <p className={styles['settings-row-help']}>
              Curated uses the collection&apos;s custom order. Alphabetical sorts by artist name
            </p>
          </div>
          <div className={styles['settings-row-right']}>
            <div className={clsx(styles['select-wrap'], styles['narrow'])}>
              <select
                value={sortOrder}
                onChange={(e) => onSortOrderChange(e.target.value as 'alphabetical' | 'curated')}
                className={styles['settings-select']}
                aria-label="Sort order"
              >
                <option value="alphabetical">Alphabetical</option>
                <option value="curated">Curated</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Jump-To Buttons */}
      <div className={clsx(styles['settings-section'], styles['settings-block'])}>
        <div className={styles['settings-row']}>
          <div className={styles['settings-row-left']}>
            <h3 className={styles['settings-row-title']}>Jump-To Buttons</h3>
            <p className={styles['settings-row-help']}>
              When enabled, buttons above the control bar can be used to jump to letter/number ranges or sections
            </p>
          </div>
          <div className={styles['settings-row-right']}>
            <label className={styles['toggle-label']}>
              <div className={styles['toggle-label-content']}>
                <input
                  type="checkbox"
                  checked={showJumpToBar}
                  onChange={(e) => onShowJumpToBarChange(e.target.checked)}
                  className={styles['toggle-checkbox']}
                />
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* Jump Button Type */}
      <div
        className={clsx(
          styles['settings-section'],
          !showJumpToBar && styles['settings-block-disabled']
        )}
      >
        <div className={styles['settings-row']}>
          <div className={styles['settings-row-left']}>
            <h3 className={styles['settings-row-title']}>Jump-To Button Type</h3>
            <p className={styles['settings-row-help']}>
              Letter or number ranges, or section shortcuts when using curated order
            </p>
          </div>
          <div className={styles['settings-row-right']}>
            <div className={clsx(styles['select-wrap'], styles['narrow'])}>
              <select
                value={jumpButtonType}
                onChange={(e) => onJumpButtonTypeChange(e.target.value as 'letter-ranges' | 'number-ranges' | 'sections')}
                className={styles['settings-select']}
                aria-label="Jump button type"
                disabled={!showJumpToBar}
              >
                {jumpButtonTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
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
        <div className={styles['settings-row']}>
          <div className={styles['settings-row-left']}>
            <h3 className={styles['settings-row-title']}>Color Coding</h3>
            <p className={styles['settings-row-help']}>
              When enabled, section buttons and album cards use each section&apos;s color
            </p>
          </div>
          <div className={styles['settings-row-right']}>
            <label className={styles['toggle-label']}>
              <div className={styles['toggle-label-content']}>
                <input
                  type="checkbox"
                  checked={showColorCoding}
                  onChange={(e) => onShowColorCodingChange(e.target.checked)}
                  className={styles['toggle-checkbox']}
                  disabled={!colorCodingEnabled}
                />
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* Crossfade */}
      <div className={styles['settings-section']}>
        <div className={styles['settings-row-crossfade']}>
          <div className={styles['settings-row-crossfade-top']}>
            <h3 className={styles['settings-row-title']}>Crossfade</h3>
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
            <span className={styles['settings-row-crossfade-label']}>
              {crossfadeSeconds} sec
            </span>
          </div>
          <p className={styles['settings-row-help']}>
            * No fade is used when the next track is the next track on the same album
          </p>
        </div>
      </div>

      {/* Hit Button */}
      <div className={styles['settings-section']}>
        <div className={styles['settings-row']}>
          <div className={styles['settings-row-left']}>
            <h3 className={styles['settings-row-title']}>Hit Button</h3>
            <p className={styles['settings-row-help']}>
              Specifies which tracks are added to the queue when the &quot;H&quot; (Hit) button is selected from the keypad
            </p>
          </div>
          <div className={styles['settings-row-right']}>
            <div className={clsx(styles['select-wrap'], styles['narrow'])}>
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
                  Favorites &amp; Recommended
                </option>
                <option value="any">Add any tracks from collection</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
