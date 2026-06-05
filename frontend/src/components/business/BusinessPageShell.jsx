import LoadingSpinner from '../LoadingSpinner';
import { useBusinessProfile } from '../../hooks/useBusinessProfile';
import { Badge, Card, PageHeader, cn } from '../ui';

/**
 * Shared layout for Business Edition pages — design-system tokens + purple accent.
 */
export default function BusinessPageShell({
  title,
  description,
  actions,
  children,
  loading = false,
  error = null,
  maxWidth = 'max-w-6xl',
  teamRole = null,
  businessName = null,
  className,
}) {
  const { businessName: profileName, businessTagline } = useBusinessProfile();
  const workspaceName = businessName || profileName;

  const roleBadge = teamRole && teamRole !== 'owner' ? (
    <Badge variant="purple" className="mt-2 normal-case">
      Team · {teamRole}
    </Badge>
  ) : null;

  return (
    <div className={cn('page-container min-w-0 space-y-6', maxWidth, className)}>
      <div
        className="h-1 w-full rounded-full bg-gradient-to-r from-purple-600 via-purple-500 to-purple-400/50"
        aria-hidden
      />

      <PageHeader
        eyebrow={workspaceName || undefined}
        title={title}
        description={description || businessTagline || undefined}
        actions={actions}
      >
        {roleBadge}
      </PageHeader>

      {error && (
        <Card className="flex items-start gap-3 border-danger-200 bg-danger-50 p-4" role="alert">
          <p className="text-sm text-danger-700">{error}</p>
        </Card>
      )}

      {loading ? (
        <LoadingSpinner label="Loading dashboard" />
      ) : (
        children
      )}
    </div>
  );
}
