import { useState, useEffect } from 'react';
import { X, Info, AlertTriangle, CheckCircle, AlertCircle, Rocket } from 'lucide-react';
import api from '../services/api';

const TYPE_STYLES = {
  info: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-800', icon: Info, iconColor: 'text-blue-500' },
  warning: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800', icon: AlertTriangle, iconColor: 'text-amber-500' },
  success: { bg: 'bg-green-50 border-green-200', text: 'text-green-800', icon: CheckCircle, iconColor: 'text-green-500' },
  error: { bg: 'bg-red-50 border-red-200', text: 'text-red-800', icon: AlertCircle, iconColor: 'text-red-500' },
  coming_soon: { bg: 'bg-purple-50 border-purple-200', text: 'text-purple-800', icon: Rocket, iconColor: 'text-purple-500' },
};

export default function AnnouncementBanner() {
  const [announcements, setAnnouncements] = useState([]);
  const [dismissed, setDismissed] = useState(new Set());

  useEffect(() => {
    const fetchAnnouncements = async () => {
      try {
        const { data } = await api.get('/api/v1/announcements/active');
        setAnnouncements(Array.isArray(data) ? data : []);
      } catch {
        // silent fail
      }
    };
    fetchAnnouncements();
  }, []);

  const dismiss = (id) => {
    setDismissed((prev) => new Set([...prev, id]));
  };

  const visible = announcements.filter((a) => !dismissed.has(a.id) && a.type !== 'coming_soon');
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {visible.map((a) => {
        const style = TYPE_STYLES[a.type] || TYPE_STYLES.info;
        const Icon = style.icon;
        return (
          <div
            key={a.id}
            className={`flex items-start gap-3 p-3 rounded-lg border ${style.bg}`}
          >
            <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${style.iconColor}`} />
            <div className="flex-1 min-w-0">
              {a.title && (
                <p className={`text-sm font-semibold ${style.text}`}>{a.title}</p>
              )}
              <p className={`text-sm ${style.text}`}>{a.message}</p>
            </div>
            <button
              onClick={() => dismiss(a.id)}
              className="p-1 text-gray-400 hover:text-gray-600 shrink-0"
              aria-label="Dismiss announcement"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
