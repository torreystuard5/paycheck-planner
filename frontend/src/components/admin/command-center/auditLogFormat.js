import {
  AlertTriangle,
  CheckCircle2,
  Crown,
  Megaphone,
  MessageSquare,
  RefreshCw,
  Settings,
  Shield,
  Trash2,
  User,
  UserMinus,
  UserPlus,
} from 'lucide-react';

export const AUDIT_ACTION_LABELS = {
  enabled_user: 'Enabled user',
  disabled_user: 'Disabled user',
  toggled_admin: 'Toggled admin',
  updated_user_status: 'Updated account status',
  updated_user_email: 'Updated user email',
  initiated_password_reset: 'Sent password reset',
  admin_set_password: 'Set user password',
  force_logout: 'Forced user logout',
  impersonate_user: 'Viewed as user',
  updated_business_access: 'Updated business access',
  created_announcement: 'Created announcement',
  updated_announcement: 'Updated announcement',
  deleted_announcement: 'Deleted announcement',
  toggled_maintenance: 'Toggled maintenance mode',
  updated_setting: 'Updated system setting',
  created_app_update: 'Created app update',
  updated_app_update: 'Updated app update',
  deleted_app_update: 'Deleted app update',
  created_coming_soon: 'Created coming soon item',
  updated_coming_soon: 'Updated coming soon item',
  deleted_coming_soon: 'Deleted coming soon item',
  sent_broadcast: 'Sent broadcast email',
  resubscribed_user: 'Re-subscribed user to emails',
  toggled_active: 'Toggled user active',
  upsert_override: 'Upserted feature override',
  remove_override: 'Removed feature override',
  toggle_global_feature: 'Toggled global feature',
  updated_ticket: 'Updated support ticket',
  replied_to_ticket: 'Replied to support ticket',
  assigned_ticket: 'Assigned support ticket',
  added_ticket_note: 'Added ticket internal note',
  user_unsubscribed: 'User unsubscribed (self-service)',
  updated_subscription_tier: 'Updated user plan tier',
};

const DETAIL_LABELS = {
  email: 'Email',
  old_email: 'Previous email',
  new_email: 'New email',
  old_tier: 'Previous tier',
  new_tier: 'New tier',
  old_value: 'Previous value',
  new_value: 'New value',
  is_admin: 'Admin access',
  is_active: 'Active',
  account_status: 'Status',
  reason: 'Reason',
  subject: 'Subject',
  title: 'Title',
  key: 'Setting',
  audience: 'Audience',
  count: 'Recipients',
  excluded: 'Excluded',
  tier: 'Tier',
  features: 'Features',
  feature_name: 'Feature',
  description: 'Description',
  is_free_for_all: 'Free for all',
};

const ACTION_STYLES = {
  warning: {
    badgeClass: 'bg-amber-100 text-amber-800',
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    Icon: AlertTriangle,
  },
  danger: {
    badgeClass: 'bg-red-100 text-red-700',
    iconBg: 'bg-red-50',
    iconColor: 'text-red-600',
    Icon: Trash2,
  },
  user: {
    badgeClass: 'bg-blue-100 text-blue-700',
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
    Icon: User,
  },
  admin: {
    badgeClass: 'bg-indigo-100 text-indigo-700',
    iconBg: 'bg-indigo-50',
    iconColor: 'text-indigo-600',
    Icon: Shield,
  },
  success: {
    badgeClass: 'bg-green-100 text-green-700',
    iconBg: 'bg-green-50',
    iconColor: 'text-green-600',
    Icon: CheckCircle2,
  },
  support: {
    badgeClass: 'bg-rose-100 text-rose-700',
    iconBg: 'bg-rose-50',
    iconColor: 'text-rose-600',
    Icon: MessageSquare,
  },
  broadcast: {
    badgeClass: 'bg-purple-100 text-purple-700',
    iconBg: 'bg-purple-50',
    iconColor: 'text-purple-600',
    Icon: Megaphone,
  },
  system: {
    badgeClass: 'bg-slate-100 text-slate-700',
    iconBg: 'bg-slate-50',
    iconColor: 'text-slate-600',
    Icon: Settings,
  },
  tier: {
    badgeClass: 'bg-amber-100 text-amber-800',
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    Icon: Crown,
  },
  default: {
    badgeClass: 'bg-gray-100 text-gray-700',
    iconBg: 'bg-gray-50',
    iconColor: 'text-gray-500',
    Icon: RefreshCw,
  },
};

const WARNING_ACTIONS = new Set([
  'toggled_maintenance',
  'deleted_announcement',
  'deleted_app_update',
  'deleted_coming_soon',
  'force_logout',
  'impersonate_user',
]);

const DANGER_ACTIONS = new Set(['disabled_user', 'remove_override', 'user_unsubscribed']);

const USER_ACTIONS = new Set([
  'enabled_user',
  'updated_user_status',
  'updated_user_email',
  'initiated_password_reset',
  'admin_set_password',
  'updated_business_access',
  'toggled_active',
  'resubscribed_user',
]);

const ADMIN_ACTIONS = new Set(['toggled_admin', 'impersonate_user']);

const SUCCESS_ACTIONS = new Set([
  'enabled_user',
  'created_announcement',
  'created_app_update',
  'created_coming_soon',
  'sent_broadcast',
  'resubscribed_user',
]);

const SUPPORT_ACTIONS = new Set([
  'updated_ticket',
  'replied_to_ticket',
  'assigned_ticket',
  'added_ticket_note',
]);

const SYSTEM_ACTIONS = new Set(['updated_setting', 'toggle_global_feature']);

function isTruthy(value) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return Boolean(value);
}

function formatBool(value) {
  if (value === true || value === 'true') return 'Yes';
  if (value === false || value === 'false') return 'No';
  return String(value);
}

export function parseAuditDetails(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return { _raw: raw };
  }
}

export function formatAuditActionLabel(action) {
  if (!action) return '—';
  if (AUDIT_ACTION_LABELS[action]) return AUDIT_ACTION_LABELS[action];
  return action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTarget(entry) {
  return entry?.target?.trim() || null;
}

function formatEmailFromDetails(d, entry) {
  return d.email || formatTarget(entry);
}

function formatTierChange(d, entry) {
  const who = formatEmailFromDetails(d, entry) || formatTarget(entry);
  if (d.old_tier && d.new_tier) {
    return who
      ? `Changed plan tier for ${who}: ${d.old_tier} → ${d.new_tier}`
      : `Changed plan tier: ${d.old_tier} → ${d.new_tier}`;
  }
  if (d.new_tier) return who ? `Set plan tier to ${d.new_tier} for ${who}` : `Set plan tier to ${d.new_tier}`;
  return who ? `Updated plan tier for ${who}` : 'Updated user plan tier';
}

function formatSettingChange(d) {
  const key = d.key || 'setting';
  const label = key === 'maintenance_mode' ? 'maintenance mode' : key.replace(/_/g, ' ');
  if (d.old_value !== undefined && d.new_value !== undefined) {
    return `Changed ${label}: ${formatBool(d.old_value)} → ${formatBool(d.new_value)}`;
  }
  if (d.new_value !== undefined) return `Set ${label} to ${formatBool(d.new_value)}`;
  return `Updated ${label}`;
}

/** One-line human-readable summary for an audit log entry. */
export function formatAuditActivityMessage(entry) {
  const action = entry?.action || '';
  const d = parseAuditDetails(entry?.details);
  const target = formatTarget(entry);

  switch (action) {
    case 'toggled_maintenance': {
      const on = isTruthy(d.new_value);
      return on ? 'Turned maintenance mode on' : 'Turned maintenance mode off';
    }
    case 'updated_setting':
      return formatSettingChange(d);
    case 'updated_subscription_tier':
      return formatTierChange(d, entry);
    case 'toggled_admin': {
      const who = formatEmailFromDetails(d, entry) || target;
      if (d.is_admin === true) return who ? `Granted admin access to ${who}` : 'Granted admin access';
      if (d.is_admin === false) return who ? `Removed admin access from ${who}` : 'Removed admin access';
      return who ? `Changed admin access for ${who}` : 'Changed admin access';
    }
    case 'toggled_active': {
      const who = formatEmailFromDetails(d, entry) || target;
      if (d.is_active === true || d.new_is_active === true) {
        return who ? `Activated account for ${who}` : 'Activated user account';
      }
      if (d.is_active === false || d.new_is_active === false) {
        return who ? `Deactivated account for ${who}` : 'Deactivated user account';
      }
      return who ? `Toggled active status for ${who}` : 'Toggled user active status';
    }
    case 'enabled_user':
      return target ? `Enabled user ${target}` : 'Enabled user account';
    case 'disabled_user':
      return target ? `Disabled user ${target}` : 'Disabled user account';
    case 'updated_user_email': {
      if (d.old_email && d.new_email) return `Changed email: ${d.old_email} → ${d.new_email}`;
      return target ? `Updated email for ${target}` : 'Updated user email';
    }
    case 'updated_user_status': {
      const who = target || d.email;
      if (d.account_status && who) return `Set ${who} status to ${d.account_status}`;
      if (d.account_status) return `Set account status to ${d.account_status}`;
      return who ? `Updated account status for ${who}` : 'Updated account status';
    }
    case 'initiated_password_reset': {
      const who = formatEmailFromDetails(d, entry) || target;
      return who ? `Sent password reset email to ${who}` : 'Sent password reset email';
    }
    case 'admin_set_password': {
      const who = formatEmailFromDetails(d, entry) || target;
      return who ? `Set password for ${who}` : 'Set user password';
    }
    case 'force_logout': {
      const who = formatEmailFromDetails(d, entry) || target;
      return who ? `Forced logout for ${who}` : 'Forced user logout';
    }
    case 'impersonate_user': {
      const who = formatEmailFromDetails(d, entry) || target;
      return who ? `Viewing app as ${who}` : 'Started view-as session';
    }
    case 'updated_business_access':
      return target ? `Updated business access for ${target}` : 'Updated business access';
    case 'upsert_override':
      return target ? `Updated feature override for ${target}` : 'Updated feature override';
    case 'remove_override':
      return target ? `Removed feature override for ${target}` : 'Removed feature override';
    case 'toggle_global_feature': {
      if (d.feature_label || d.feature_key) {
        const name = d.feature_label || d.feature_key;
        if (d.is_free_for_all === true) return `Made "${name}" free for all users`;
        if (d.is_free_for_all === false) return `Removed free-for-all on "${name}"`;
        return `Toggled global feature "${name}"`;
      }
      return target || 'Toggled global feature';
    }
    case 'created_announcement':
      return d.title ? `Created announcement "${d.title}"` : target || 'Created announcement';
    case 'updated_announcement':
      return d.title ? `Updated announcement "${d.title}"` : target || 'Updated announcement';
    case 'deleted_announcement':
      return d.title ? `Deleted announcement "${d.title}"` : target || 'Deleted announcement';
    case 'sent_broadcast': {
      if (d.subject) {
        const extra = d.count != null ? ` (${d.count} recipients)` : '';
        return `Sent broadcast "${d.subject}"${extra}`;
      }
      return target || 'Sent broadcast email';
    }
    case 'replied_to_ticket':
      return target ? `Replied to ${target}` : 'Replied to support ticket';
    case 'assigned_ticket':
      return target ? `Assigned ${target} to self` : 'Assigned support ticket';
    case 'added_ticket_note':
      return target ? `Added internal note on ${target}` : 'Added ticket internal note';
    case 'updated_ticket':
      return target ? `Updated ${target}` : 'Updated support ticket';
    case 'resubscribed_user':
      return target ? `Re-subscribed ${target} to emails` : 'Re-subscribed user to emails';
    default:
      break;
  }

  if (target) return target;
  return formatAuditDetailsPreview(entry?.details);
}

export function formatAuditDetailsPreview(raw) {
  const d = parseAuditDetails(raw);
  if (d._raw) {
    const text = String(d._raw);
    return text.length > 120 ? `${text.slice(0, 120)}…` : text;
  }

  const parts = Object.entries(d)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => {
      const label = DETAIL_LABELS[k] || k.replace(/_/g, ' ');
      let val = v;
      if (Array.isArray(v)) val = v.join(', ');
      else if (typeof v === 'object') val = JSON.stringify(v);
      else if (k === 'is_admin' || k === 'is_active' || k === 'is_free_for_all') val = formatBool(v);
      return `${label}: ${val}`;
    });

  const line = parts.join(' · ');
  if (!line) return '—';
  return line.length > 120 ? `${line.slice(0, 120)}…` : line;
}

export function formatAuditDetailsFull(raw) {
  if (!raw) return '';
  const d = parseAuditDetails(raw);
  if (d._raw) return String(d._raw);
  return JSON.stringify(d, null, 2);
}

export function getAuditActionStyle(action) {
  const key = action || '';

  if (WARNING_ACTIONS.has(key)) return ACTION_STYLES.warning;
  if (DANGER_ACTIONS.has(key)) return ACTION_STYLES.danger;
  if (key === 'updated_subscription_tier') return ACTION_STYLES.tier;
  if (ADMIN_ACTIONS.has(key)) return ACTION_STYLES.admin;
  if (SUPPORT_ACTIONS.has(key)) return ACTION_STYLES.support;
  if (key === 'sent_broadcast') return ACTION_STYLES.broadcast;
  if (SYSTEM_ACTIONS.has(key)) return ACTION_STYLES.system;
  if (SUCCESS_ACTIONS.has(key)) return ACTION_STYLES.success;
  if (USER_ACTIONS.has(key)) return ACTION_STYLES.user;

  const lc = key.toLowerCase();
  if (lc.includes('delete') || lc.includes('disable')) return ACTION_STYLES.danger;
  if (lc.includes('create') || lc.includes('enable')) return ACTION_STYLES.success;
  if (lc.includes('update') || lc.includes('toggle')) return ACTION_STYLES.warning;

  return ACTION_STYLES.default;
}

/** Legacy badge color map for audit table rows */
export function getAuditLegacyBadgeClass(action) {
  return getAuditActionStyle(action).badgeClass;
}

export { UserPlus, UserMinus };
