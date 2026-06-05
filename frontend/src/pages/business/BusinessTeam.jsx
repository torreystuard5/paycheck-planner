import { useEffect, useState } from 'react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { formatApiError } from '../../utils/formatApiError';
import BusinessPageShell from '../../components/business/BusinessPageShell';
import { useBusinessWrite } from '../../hooks/useBusinessWrite';
import { useBusinessAccess } from '../../hooks/useBusinessAccess';
import { useToast } from '../../components/Toast';
import { businessEdition } from '../../services/businessApi';
import { Badge, Button, Card, cn } from '../../components/ui';

const ROLE_LABELS = {
  owner: 'Owner',
  manager: 'Manager',
  employee: 'Employee',
};

const PERM_LABELS = {
  view_dashboard: 'View dashboard',
  manage_sales: 'Manage sales',
  manage_deductions: 'Manage deductions',
  manage_staff_pay: 'Staff pay',
  manage_funds: 'Manage funds',
  view_tax_prep: 'Tax prep',
  manage_team: 'Manage team',
  manage_subscription: 'Billing',
};

const STATUS_VARIANT = {
  active: 'success',
  pending: 'warning',
  removed: 'neutral',
};

export default function BusinessTeam() {
  const write = useBusinessWrite('manage_team');
  const { teamRole } = useBusinessAccess();
  const toast = useToast();

  const [members, setMembers] = useState([]);
  const [matrix, setMatrix] = useState(null);
  const [auditLog, setAuditLog] = useState([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('employee');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [inviting, setInviting] = useState(false);
  const [revokingId, setRevokingId] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);

  const load = async () => {
    setError(null);
    try {
      const [teamRes, matrixRes, auditRes] = await Promise.all([
        businessEdition.listTeam(),
        businessEdition.getPermissionsMatrix().catch(() => ({ data: null })),
        businessEdition.getTeamAuditLog(30).catch(() => ({ data: [] })),
      ]);
      setMembers(Array.isArray(teamRes.data) ? teamRes.data : []);
      setMatrix(matrixRes.data);
      setAuditLog(Array.isArray(auditRes.data) ? auditRes.data : []);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const invite = async (e) => {
    e.preventDefault();
    if (!write.allowed) return;
    setInviting(true);
    try {
      await businessEdition.inviteTeam({ email, role });
      setEmail('');
      toast('Invitation sent.', 'success');
      await load();
    } catch (err) {
      toast(formatApiError(err), 'error');
    } finally {
      setInviting(false);
    }
  };

  const revoke = async (memberId) => {
    if (!write.allowed) return;
    setRevokingId(memberId);
    try {
      await businessEdition.revokeTeamMember(memberId);
      toast('Team member removed.', 'success');
      await load();
    } catch (err) {
      toast(formatApiError(err), 'error');
    } finally {
      setRevokingId(null);
    }
  };

  const changeRole = async (memberId, newRole) => {
    if (!write.allowed) return;
    setUpdatingId(memberId);
    try {
      await businessEdition.updateTeamMember(memberId, { role: newRole });
      toast('Role updated.', 'success');
      await load();
    } catch (err) {
      toast(formatApiError(err), 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const permissions = matrix?.permissions || Object.keys(PERM_LABELS);
  const roles = matrix?.roles || ['owner', 'manager', 'employee'];
  const roleMatrix = matrix?.matrix || {};

  return (
    <BusinessPageShell
      title="Team & Permissions"
      description="Invite managers and employees. Role changes are audit-logged."
      loading={loading}
      error={error}
      teamRole={teamRole}
      maxWidth="max-w-4xl"
    >
      {!write.allowed && (
        <Card className="border-warning-200 bg-warning-50 p-4">
          <p className="text-sm text-warning-800">
            Only the business owner can invite or manage team members.
          </p>
        </Card>
      )}

      <Card className="p-4 sm:p-5">
        <form onSubmit={invite} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor="team-email" className="form-label">Email</label>
            <input
              id="team-email"
              type="email"
              required
              placeholder="teammate@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={write.disabled || inviting}
              className="form-input"
            />
          </div>
          <div className="sm:w-40">
            <label htmlFor="team-role" className="form-label">Role</label>
            <select
              id="team-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={write.disabled || inviting}
              className="form-input"
            >
              <option value="manager">Manager</option>
              <option value="employee">Employee</option>
            </select>
          </div>
          <Button
            type="submit"
            disabled={write.disabled || inviting}
            className="bg-purple-600 text-white hover:bg-purple-700 sm:shrink-0"
          >
            {inviting ? 'Sending…' : 'Invite'}
          </Button>
        </form>
      </Card>

      <Card className="divide-y divide-border p-0">
        {members.length === 0 && (
          <p className="p-4 text-body">No team members yet.</p>
        )}
        {members.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">
                {m.invited_email || m.member_user_id || 'Member'}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Badge variant="purple" className="normal-case">
                  {ROLE_LABELS[m.role] || m.role}
                </Badge>
                <Badge variant={STATUS_VARIANT[m.status] || 'neutral'} className="normal-case">
                  {m.status}
                </Badge>
              </div>
            </div>
            {write.allowed && m.status !== 'removed' && m.role !== 'owner' && (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={m.role}
                  disabled={updatingId === m.id}
                  onChange={(e) => changeRole(m.id, e.target.value)}
                  className="form-input min-h-9 w-auto py-1 text-sm"
                  aria-label="Change role"
                >
                  <option value="manager">Manager</option>
                  <option value="employee">Employee</option>
                </select>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={revokingId === m.id}
                  onClick={() => revoke(m.id)}
                  className={cn('text-danger-600 hover:text-danger-700')}
                >
                  {revokingId === m.id ? 'Removing…' : 'Remove'}
                </Button>
              </div>
            )}
          </div>
        ))}
      </Card>

      {matrix && (
        <Card className="overflow-x-auto p-0">
          <div className="p-4 sm:p-5">
            <h2 className="text-title">Permission matrix</h2>
            <p className="text-body mt-1">What each role can do in your workspace.</p>
          </div>
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-surface-subtle text-left">
              <tr>
                <th className="px-4 py-2.5 font-medium text-muted">Permission</th>
                {roles.map((r) => (
                  <th key={r} className="px-4 py-2.5 font-medium text-muted capitalize">{ROLE_LABELS[r] || r}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {permissions.map((perm) => (
                <tr key={perm}>
                  <td className="px-4 py-2.5 text-foreground">{PERM_LABELS[perm] || perm}</td>
                  {roles.map((r) => (
                    <td key={r} className="px-4 py-2.5 text-center">
                      {roleMatrix[r]?.[perm] ? (
                        <span className="text-brand-600" aria-label="Allowed">✓</span>
                      ) : (
                        <span className="text-muted" aria-label="Denied">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {auditLog.length > 0 && (
        <Card className="p-4 sm:p-5">
          <h2 className="text-title mb-3">Recent activity</h2>
          <ul className="space-y-2 text-sm">
            {auditLog.map((entry) => (
              <li key={entry.id} className="flex flex-wrap justify-between gap-2 border-b border-border pb-2 last:border-0">
                <span className="text-foreground capitalize">
                  {entry.action?.replace(/_/g, ' ')}
                  {entry.details?.email && ` · ${entry.details.email}`}
                  {entry.details?.role && ` → ${entry.details.role}`}
                </span>
                <span className="text-caption shrink-0">
                  {entry.created_at
                    ? formatDistanceToNow(parseISO(entry.created_at), { addSuffix: true })
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </BusinessPageShell>
  );
}
