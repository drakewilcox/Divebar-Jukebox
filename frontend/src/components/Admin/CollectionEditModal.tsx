import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MdClose } from 'react-icons/md';
import { adminApi } from '../../services/api';
import styles from './CollectionEditModal.module.css';

export type CollectionToEdit = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
};

type Props = {
  collection: CollectionToEdit | null;
  onClose: () => void;
};

function generateSlug(fromName: string) {
  return fromName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export default function CollectionEditModal({ collection, onClose }: Props) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (collection) {
      setName(collection.name);
      setSlug(collection.slug);
      setDescription(collection.description ?? '');
    }
  }, [collection]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const isCreate = !collection?.id;

  const createMutation = useMutation({
    mutationFn: () => adminApi.createCollection(name.trim(), slug.trim(), description.trim() || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!collection?.id) return Promise.reject(new Error('No collection'));
      return adminApi.updateCollection(collection.id, { name, slug, description: description || undefined });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;
    if (isCreate) createMutation.mutate();
    else updateMutation.mutate();
  };

  if (!collection) return null;

  const mutation = isCreate ? createMutation : updateMutation;
  const err = mutation.error as { response?: { data?: { detail?: string } }; message?: string } | undefined;
  const errorMessage = mutation.isError
    ? (err?.response?.data?.detail ?? err?.message ?? 'Failed to save')
    : null;

  return (
    <div className={styles['collection-edit-modal-overlay']} onClick={onClose} role="presentation">
      <div
        className={styles['collection-edit-modal-content']}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="collection-edit-modal-title"
      >
        <div className={styles['collection-edit-modal-header']}>
          <h2 id="collection-edit-modal-title">{isCreate ? 'Add Collection' : 'Edit Collection'}</h2>
          <button
            type="button"
            className={styles['collection-edit-modal-close']}
            onClick={onClose}
            aria-label="Close"
          >
            <MdClose size={24} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className={styles['collection-edit-modal-body']}>
          <div className={styles['collection-edit-form-group']}>
            <label htmlFor="collection-edit-name">Name</label>
            <input
              id="collection-edit-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSlug(generateSlug(e.target.value));
              }}
              placeholder="Name your collection..."
              autoFocus
            />
          </div>
          <div className={styles['collection-edit-form-group']}>
            <label htmlFor="collection-edit-slug">Slug</label>
            <input
              id="collection-edit-slug"
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="Url Slug for Collection..."
            />
          </div>
          <div className={styles['collection-edit-form-group']}>
            <label htmlFor="collection-edit-description">Description (optional)</label>
            <input
              id="collection-edit-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional Description..."
            />
          </div>
          {errorMessage && (
            <p className={styles['collection-edit-error']}>{errorMessage}</p>
          )}
          <div className={styles['collection-edit-modal-actions']}>
            <button type="button" className={styles['collection-edit-cancel']} onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className={styles['collection-edit-submit']}
              disabled={!name.trim() || !slug.trim() || mutation.isPending}
            >
              {mutation.isPending ? (isCreate ? 'Creating…' : 'Saving…') : (isCreate ? 'Create' : 'Save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
