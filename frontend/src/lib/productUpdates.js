/**
 * Merges static redesign notes (src/data/updates.json) with live API changelog.
 * See src/data/README.md and frontend/DESIGN_SYSTEM.md for handover context.
 */
import updatesData from '../data/updates.json';

export const whatsNew = updatesData.whatsNew;
export const staticChangelogEntries = updatesData.entries ?? [];

/** Merge API changelog with static entries (static only if description not already present). */
export function mergeChangelogEntries(apiEntries = []) {
  const api = Array.isArray(apiEntries) ? apiEntries : [];
  const seen = new Set(api.map((e) => (e.description || '').trim().toLowerCase()));
  const extra = staticChangelogEntries.filter((e) => {
    const key = (e.description || '').trim().toLowerCase();
    return key && !seen.has(key);
  });
  return [...api, ...extra].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}
