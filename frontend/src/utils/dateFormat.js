import { format, parseISO } from 'date-fns';

const FORMAT_MAP = {
  'MM/DD/YYYY': 'MM/dd/yyyy',
  'DD/MM/YYYY': 'dd/MM/yyyy',
  'YYYY-MM-DD': 'yyyy-MM-dd',
};

const HUMAN_FORMAT_MAP = {
  'MM/DD/YYYY': 'MMM d, yyyy',
  'DD/MM/YYYY': 'd MMM yyyy',
  'YYYY-MM-DD': 'yyyy-MM-dd',
};

export function formatDate(dateString, formatPreference = 'MM/DD/YYYY', humanReadable = true) {
  if (!dateString) return '\u2014';
  try {
    const date = typeof dateString === 'string' ? parseISO(dateString) : dateString;
    const fmtMap = humanReadable ? HUMAN_FORMAT_MAP : FORMAT_MAP;
    return format(date, fmtMap[formatPreference] || fmtMap['MM/DD/YYYY']);
  } catch {
    return dateString;
  }
}

export function getFormatPreview(formatPreference) {
  return formatDate(new Date().toISOString(), formatPreference, false);
}
