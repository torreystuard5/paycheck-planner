/**
 * Client-side plan tier helpers (mirrors backend tier_access rules).
 * Source of truth for subscription is user.subscription_tier from /auth/me.
 */

export function normalizePlanTier(raw) {
  const r = String(raw || 'early_access').toLowerCase().trim();
  if (!r || r === 'free' || r === 'none') return 'early_access';
  if (r === 'lifetime') return 'pro';
  if (['early_access', 'pro', 'business', 'bundle'].includes(r)) return r;
  return 'early_access';
}

export function hasPersonalHomeAccess(tier) {
  const t = normalizePlanTier(tier);
  return t === 'early_access' || t === 'pro' || t === 'bundle';
}

export function hasBusinessDashboardAccess(tier) {
  const t = normalizePlanTier(tier);
  return t === 'business' || t === 'bundle';
}

export function hasProSurfaceAccess(tier) {
  const t = normalizePlanTier(tier);
  return t === 'pro' || t === 'bundle';
}

export function canSwitchAppMode(tier) {
  return normalizePlanTier(tier) === 'bundle';
}
