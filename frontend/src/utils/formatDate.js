export function formatFriendlyDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  const opts = { month: 'short', day: 'numeric' };
  if (!sameYear) opts.year = 'numeric';
  return d.toLocaleDateString('en-US', opts);
}

export function formatDate(dateString, formatPreference, humanReadable = false) {
  if (!dateString) return '';
  const date = new Date(dateString.includes('T') ? dateString : dateString + 'T00:00:00');
  if (isNaN(date.getTime())) return dateString;

  if (humanReadable) {
    return formatFriendlyDate(dateString);
  }

  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();

  switch (formatPreference) {
    case 'DD/MM/YYYY': return `${d}/${m}/${y}`;
    case 'YYYY-MM-DD': return `${y}-${m}-${d}`;
    default: return `${m}/${d}/${y}`;
  }
}

export function formatPaycheckDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  const dow = d.toLocaleDateString('en-US', { weekday: 'short' });
  const rest = formatFriendlyDate(dateStr);
  return `${dow}, ${rest}`;
}

export function getFormatPreview(formatPreference) {
  const now = new Date();
  const d = now.getDate().toString().padStart(2, '0');
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  const y = now.getFullYear();

  switch (formatPreference) {
    case 'DD/MM/YYYY': return `${d}/${m}/${y}`;
    case 'YYYY-MM-DD': return `${y}-${m}-${d}`;
    default: return `${m}/${d}/${y}`;
  }
}
