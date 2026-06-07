import {
  LayoutDashboard,
  MessageSquare,
  Radio,
  ScrollText,
  Settings,
  Users,
} from 'lucide-react';

export const COMMAND_CENTER_TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, description: 'Overview & metrics' },
  { key: 'users', label: 'Users', icon: Users, description: 'Manage accounts' },
  { key: 'support', label: 'Support', icon: MessageSquare, description: 'Support tickets' },
  { key: 'settings', label: 'Settings', icon: Settings, description: 'System settings' },
  { key: 'audit', label: 'Audit Log', icon: ScrollText, description: 'Admin activity' },
  { key: 'broadcast', label: 'Broadcast', icon: Radio, description: 'Email broadcasts' },
];

export function getTabMeta(key) {
  return COMMAND_CENTER_TABS.find((tab) => tab.key === key) ?? COMMAND_CENTER_TABS[0];
}

/** Group audit log actions for filter chips */
export const AUDIT_ACTION_CATEGORIES = [
  { key: '', label: 'All' },
  { key: 'user', label: 'Users', actions: ['enabled_user', 'disabled_user', 'toggled_admin', 'updated_user_status', 'updated_user_email', 'initiated_password_reset', 'admin_set_password', 'force_logout', 'impersonate_user', 'updated_business_access', 'toggled_active', 'upsert_override', 'remove_override', 'resubscribed_user', 'updated_subscription_tier'] },
  { key: 'system', label: 'System', actions: ['toggled_maintenance', 'updated_setting', 'toggle_global_feature'] },
  { key: 'content', label: 'Content', actions: ['created_announcement', 'updated_announcement', 'deleted_announcement', 'created_app_update', 'updated_app_update', 'deleted_app_update', 'created_coming_soon', 'updated_coming_soon', 'deleted_coming_soon'] },
  { key: 'support', label: 'Support', actions: ['updated_ticket', 'replied_to_ticket', 'assigned_ticket', 'added_ticket_note'] },
  { key: 'broadcast', label: 'Broadcast', actions: ['sent_broadcast', 'user_unsubscribed'] },
];
