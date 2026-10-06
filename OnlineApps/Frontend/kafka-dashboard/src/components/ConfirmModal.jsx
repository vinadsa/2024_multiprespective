import { useEffect, useRef } from 'react';
import { Info, Trash2 } from 'lucide-react';

/**
 * Accessible Cupertino Native confirmation modal dialog.
 * Features blurred backdrop, spring animation, keyboard accessibility (Esc/Enter), and focus management.
 */
export default function ConfirmModal({
  isOpen = false,
  title = 'Clear Stream Alerts?',
  description = 'Are you sure you want to clear all alerts from your local view? Real-time stream events will continue to be monitored.',
  note = 'Trace logs and graph replay states in Neo4j remain intact.',
  confirmText = 'Clear Alerts',
  cancelText = 'Cancel',
  confirmTone = 'danger',
  Icon = Trash2,
  onConfirm,
  onCancel,
}) {
  const cancelBtnRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    // Focus cancel button on open for safe keyboard defaults
    cancelBtnRef.current?.focus();

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onCancel?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="modal-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="modal-dialog-title"
        aria-describedby="modal-dialog-desc"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon Bubble */}
        <div className={`modal-icon-bubble modal-icon-bubble--${confirmTone}`} aria-hidden="true">
          <Icon size={24} strokeWidth={2.2} />
        </div>

        {/* Title */}
        <h3 id="modal-dialog-title" className="modal-title">
          {title}
        </h3>

        {/* Description */}
        <p id="modal-dialog-desc" className="modal-desc">
          {description}
        </p>

        {/* Informative Note */}
        {note && (
          <div className="modal-note">
            <Info size={14} className="modal-note__icon" aria-hidden="true" />
            <span className="modal-note__text">{note}</span>
          </div>
        )}

        {/* Dialog Actions */}
        <div className="modal-actions">
          <button
            ref={cancelBtnRef}
            type="button"
            className="modal-btn modal-btn--cancel"
            onClick={onCancel}
          >
            {cancelText}
          </button>

          <button
            type="button"
            className={`modal-btn modal-btn--${confirmTone}`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
