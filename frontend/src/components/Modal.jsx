import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from './ui/cn';

export default function Modal({ isOpen, onClose, title, children, className, contentClassName, footer }) {
  const scrollPosRef = useRef(0);
  const panelRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      delete document.body.dataset.modalOpen;
      document.body.style.overflow = '';
      window.scrollTo(0, scrollPosRef.current);
      return undefined;
    }
    scrollPosRef.current = window.scrollY;
    document.body.dataset.modalOpen = 'true';
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => closeRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(t);
      delete document.body.dataset.modalOpen;
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="fixed inset-0 bg-foreground/50 backdrop-blur-[2px] transition-opacity animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        className={cn(
          'relative z-[100] flex max-h-[92dvh] w-full flex-col overflow-hidden',
          'rounded-t-2xl border border-border bg-surface shadow-[var(--shadow-card-hover)]',
          'animate-[slideUp_0.28s_ease-out] sm:max-h-[94dvh] sm:w-full sm:max-w-lg sm:rounded-xl',
          'pb-[max(0px,env(safe-area-inset-bottom))]',
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
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="ml-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6', contentClassName)}>
          {children}
        </div>
        {footer}
      </div>
    </div>
  );
}
