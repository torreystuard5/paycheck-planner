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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl border border-gray-200 w-[calc(100%-2rem)] sm:w-full sm:max-w-lg max-h-[90vh] overflow-y-auto z-[100]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  );
}
