import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from './ui/cn';

export default function Modal({ isOpen, onClose, title, children, className }) {
  const scrollPosRef = useRef(0);

  useEffect(() => {
    if (isOpen) {
      scrollPosRef.current = window.scrollY;
      document.body.dataset.modalOpen = 'true';
      document.body.style.overflow = 'hidden';
    } else {
      delete document.body.dataset.modalOpen;
      document.body.style.overflow = '';
      window.scrollTo(0, scrollPosRef.current);
    }
    return () => {
      delete document.body.dataset.modalOpen;
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="fixed inset-0 bg-foreground/40" onClick={onClose} aria-hidden />
      <div
        className={cn(
          'relative z-[100] max-h-[92dvh] w-full overflow-x-hidden overflow-y-auto',
          'rounded-t-2xl border border-border bg-surface shadow-[var(--shadow-card-hover)]',
          'sm:w-full sm:max-w-lg sm:rounded-xl',
          className,
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-4 sm:px-6">
          <h2 id="modal-title" className="min-w-0 truncate text-title sm:text-lg">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="ml-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-subtle hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-4 py-4 sm:px-6">{children}</div>
      </div>
    </div>
  );
}
