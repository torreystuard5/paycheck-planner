import { AlertTriangle, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ImpersonationBanner() {
  const { user, isImpersonating, exitImpersonation } = useAuth();
  const navigate = useNavigate();

  if (!isImpersonating || !user) return null;

  return (
    <div
      role="alert"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <div className="flex min-w-0 items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
        <p>
          <span className="font-semibold">Viewing as user:</span>{' '}
          {user.email} ({user.first_name} {user.last_name})
        </p>
      </div>
      <button
        type="button"
        onClick={async () => {
          await exitImpersonation();
          navigate('/admin/command-center');
        }}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
        Exit view-as
      </button>
    </div>
  );
}
