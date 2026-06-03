import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export default function Modal({ isOpen, onClose, title, children }) {
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
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full overflow-x-hidden bg-white shadow-xl border border-gray-200 rounded-t-2xl sm:rounded-lg sm:w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto z-[100]">
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 sm:px-6">
          <h2 className="min-w-0 truncate text-base font-semibold text-gray-900 sm:text-lg">{title}</h2>
          <button
            onClick={onClose}
            className="ml-2 flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600"
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
