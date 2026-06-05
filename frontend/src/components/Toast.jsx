import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { CheckCircle, AlertCircle, X } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div
        className="fixed right-4 z-[150] flex flex-col gap-2 max-sm:left-4 max-sm:right-4"
        style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex min-h-11 items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium shadow-[var(--shadow-card-hover)] animate-[slideUp_0.3s_ease-out] ${
              toast.type === 'success'
                ? 'border-brand-700/30 bg-brand-600 text-white'
                : toast.type === 'error'
                ? 'border-danger-700/30 bg-danger-600 text-white'
                : 'border-border bg-surface text-foreground'
            }`}
          >
            {toast.type === 'success' && <CheckCircle className="w-4 h-4 shrink-0" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              className="ml-2 flex min-h-8 min-w-8 items-center justify-center rounded-lg transition-colors hover:bg-foreground/10"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return () => {};
  }
  return ctx;
}

export default ToastProvider;
