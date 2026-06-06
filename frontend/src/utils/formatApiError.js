/**
 * Normalize FastAPI / Axios error payloads to a single string safe for React text nodes.
 * FastAPI 422 responses use detail: [{ loc, msg, type }, ...] which must not be rendered raw.
 */
export function formatApiError(err) {
  const d = err?.response?.data?.detail;
  if (d == null || d === '') {
    if (err?.code === 'ECONNABORTED') {
      return 'Request timed out. Try again in a moment.';
    }
    if (err?.message === 'Network Error') {
      return 'Could not reach the server. Check your connection or try again shortly.';
    }
    return err?.message || 'Something went wrong. Please try again.';
  }
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) {
    return d
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && item.msg) {
          const loc = Array.isArray(item.loc) ? item.loc.filter((x) => x !== 'body').join('.') : '';
          return loc ? `${loc}: ${item.msg}` : item.msg;
        }
        try {
          return JSON.stringify(item);
        } catch {
          return '';
        }
      })
      .filter(Boolean)
      .join(' ');
  }
  if (typeof d === 'object') {
    if (d.message) return String(d.message);
    if (d.msg) return String(d.msg);
  }
  try {
    return JSON.stringify(d);
  } catch {
    return 'Request failed.';
  }
}
