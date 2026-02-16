import { useState, useEffect } from 'react';
import { Collection } from '../types';
import './SettingsModal.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  collections: Collection[];
  currentCollection: Collection;
  onCollectionChange: (collection: Collection) => void;
}

export default function SettingsModal({
  isOpen,
  onClose,
  collections,
  currentCollection,
  onCollectionChange,
}: Props) {
  const [defaultCollectionSlug, setDefaultCollectionSlug] = useState<string>('all');
  const [editMode, setEditMode] = useState<boolean>(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedDefaultCollection = localStorage.getItem('defaultCollection');
    const savedEditMode = localStorage.getItem('editMode');
    
    if (savedDefaultCollection) {
      setDefaultCollectionSlug(savedDefaultCollection);
    }
    if (savedEditMode) {
      setEditMode(savedEditMode === 'true');
    }
  }, []);

  // Save settings to localStorage when they change
  useEffect(() => {
    localStorage.setItem('defaultCollection', defaultCollectionSlug);
  }, [defaultCollectionSlug]);

  useEffect(() => {
    localStorage.setItem('editMode', editMode.toString());
    // Dispatch custom event so other components can listen
    window.dispatchEvent(new CustomEvent('edit-mode-changed', { detail: editMode }));
  }, [editMode]);

  const handleSetAsDefault = () => {
    setDefaultCollectionSlug(currentCollection.slug);
  };

  const handleCollectionSelect = (collectionSlug: string) => {
    const collection = collections.find(c => c.slug === collectionSlug);
    if (collection) {
      onCollectionChange(collection);
    }
  };

  if (!isOpen) return null;

  const isCurrentDefault = currentCollection.slug === defaultCollectionSlug;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="close-button" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="settings-section">
            <h3>Collection</h3>
            <div className="form-group">
              <label>Current Collection</label>
              <select
                className="form-select"
                value={currentCollection.slug}
                onChange={(e) => handleCollectionSelect(e.target.value)}
              >
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.slug}>
                    {collection.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Default Collection</label>
              <div className="default-collection-row">
                <span className="default-collection-name">
                  {collections.find(c => c.slug === defaultCollectionSlug)?.name || 'All Albums'}
                </span>
                <button
                  className="set-default-button"
                  onClick={handleSetAsDefault}
                  disabled={isCurrentDefault}
                >
                  {isCurrentDefault ? '✓ Default' : 'Set as Default'}
                </button>
              </div>
              <p className="help-text">
                The default collection will be loaded when you open the jukebox.
              </p>
            </div>
          </div>

          <div className="settings-section">
            <h3>Edit Mode</h3>
            <div className="form-group">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={editMode}
                  onChange={(e) => setEditMode(e.target.checked)}
                  className="toggle-checkbox"
                />
                <span className="toggle-text">
                  {/* {editMode ? 'Edit Mode: ON' : 'Edit Mode: OFF'} */}
                </span>
              </label>
              <p className="help-text">
                When enabled, hover over album covers to quickly edit albums from the jukebox view.
              </p>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="close-modal-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
