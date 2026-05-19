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

/** Paid Business or Bundle subscription tier. */
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

/**
 * Business feature access (trial, early access, paid business, admin grant).
 * Prefer subscription payload from GET /subscriptions/status when available.
 */
export function hasBusinessAccess(user, subscription) {
  if (subscription?.has_business_access != null) return Boolean(subscription.has_business_access);
  const tier = normalizePlanTier(user?.subscription_tier);
  if (tier === 'business' || tier === 'bundle') return true;
  if (tier === 'early_access') return true;
  return false;
}

export function canWriteBusiness(subscription) {
  if (subscription?.can_write_business != null) return Boolean(subscription.can_write_business);
  return true;
}

export function canStartBusinessTrial(subscription) {
  return Boolean(subscription?.can_start_trial);
}

/** Home Pro feature keys (B/C/D and related). */
export const PRO_FEATURE_KEYS = {
  household_overview: 'household_overview',
  tax_prep: 'tax_prep',
  receipt_ocr: 'receipt_ocr',
};

/**
 * Whether the user can access a gated Home Pro feature in the UI.
 * Early access users bypass the paywall until transitioned off early_access.
 */
export function hasProFeatureAccess(user, subscription, featureKey) {
  const tier = normalizePlanTier(user?.subscription_tier);
  if (tier === 'early_access') return true;
  if (hasProSurfaceAccess(tier)) return true;
  const granted = subscription?.granted_features;
  if (Array.isArray(granted) && granted.includes(featureKey)) return true;
  return false;
}
