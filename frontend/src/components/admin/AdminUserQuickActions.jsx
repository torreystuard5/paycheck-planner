import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Eye,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  MoreHorizontal,
  Settings2,
  Shield,
  UserCog,
} from 'lucide-react';

export default function AdminUserQuickActions({
  user,
  isSelf,
  busy,
  onViewDetails,
  onSendResetEmail,
  onSetPassword,
  onForceLogout,
  onImpersonate,
  onChangeTier,
  onOverride,
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const run = (fn) => (e) => {
    e.stopPropagation();
    setOpen(false);
    fn?.(user);
  };

  const items = [
    { key: 'details', label: 'View details', icon: Eye, onClick: onViewDetails },
    { key: 'reset-email', label: 'Send reset email', icon: Mail, onClick: onSendResetEmail },
    { key: 'set-password', label: 'Set password', icon: KeyRound, onClick: onSetPassword },
    { key: 'tier', label: 'Change tier', icon: Shield, onClick: onChangeTier },
    { key: 'override', label: 'Feature override', icon: Settings2, onClick: onOverride },
    {
      key: 'impersonate',
      label: 'View as user',
      icon: UserCog,
      onClick: onImpersonate,
      disabled: isSelf,
    },
    {
      key: 'force-logout',
      label: 'Force logout',
      icon: LogOut,
      onClick: onForceLogout,
      danger: true,
    },
  ];

  return (
    <div className="relative" ref={menuRef} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${user.email}`}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <MoreHorizontal className="h-3.5 w-3.5" />
        )}
        Actions
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {items.map(({ key, label, icon: Icon, onClick, disabled, danger }) => (
            <button
              key={key}
              type="button"
              role="menuitem"
              disabled={disabled}
              onClick={run(onClick)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                danger
                  ? 'text-red-700 hover:bg-red-50'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
