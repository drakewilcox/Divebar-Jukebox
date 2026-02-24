import clsx from 'clsx';
import styles from './ConfirmModal.module.css';

export interface ConfirmModalProps {
  isOpen: boolean;
  message: string;
  cancelButtonText: string;
  confirmButtonText: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirmVariant?: 'default' | 'danger';
}

export default function ConfirmModal({
  isOpen,
  message,
  cancelButtonText,
  confirmButtonText,
  onCancel,
  onConfirm,
  confirmVariant = 'default',
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className={styles['modal-overlay']}
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-message"
    >
      <div
        className={styles['modal-content']}
        onClick={(e) => e.stopPropagation()}
      >
        <p id="confirm-modal-message" className={styles['modal-message']}>
          {message}
        </p>
        <div className={styles['modal-footer']}>
          <button
            type="button"
            className={styles['cancel-button']}
            onClick={onCancel}
          >
            {cancelButtonText}
          </button>
          <button
            type="button"
            className={clsx(
              styles['confirm-button'],
              confirmVariant === 'danger' && styles['confirm-button-danger']
            )}
            onClick={onConfirm}
          >
            {confirmButtonText}
          </button>
        </div>
      </div>
    </div>
  );
}
