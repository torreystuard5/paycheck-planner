import { useState, useEffect } from 'react';
import api from '../services/api';

export default function WhatsNewUnseenBadge() {
  const [unseenCount, setUnseenCount] = useState(0);

  useEffect(() => {
    api.get('/api/v1/whats-new-unseen-count')
      .then(({ data }) => setUnseenCount(data.unseen_count || 0))
      .catch(() => {});
  }, []);

  if (unseenCount <= 0) return null;

  return (
    <span
      className="inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-danger-600 px-1.5 text-xs font-bold text-white"
      aria-label={`${unseenCount} unread updates`}
    >
      {unseenCount}
    </span>
  );
}
