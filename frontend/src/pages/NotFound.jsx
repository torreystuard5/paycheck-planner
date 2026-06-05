import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';
import { Card } from '../components/ui';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-subtle px-4">
      <Card className="max-w-md p-8 text-center">
        <p className="text-6xl font-bold text-muted/40">404</p>
        <h1 className="text-title mt-4">Page Not Found</h1>
        <p className="text-body mt-2">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <Link
          to="/dashboard"
          className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-700"
        >
          <Home className="h-4 w-4" />
          Back to Dashboard
        </Link>
      </Card>
    </div>
  );
}
