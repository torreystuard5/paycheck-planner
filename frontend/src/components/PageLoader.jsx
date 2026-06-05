import { Loader2 } from 'lucide-react';

export default function PageLoader({ label = 'Loading page' }) {
  return (
    <div
      className="flex min-h-[40vh] flex-col items-center justify-center gap-3 py-16"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 className="h-8 w-8 animate-spin text-brand-600" aria-hidden />
      <span className="text-caption">{label}</span>
    </div>
  );
}
