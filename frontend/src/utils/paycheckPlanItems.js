/** Client-side flags when API omits them (older backend) or for display consistency. */

export function enrichPlanItemFlags(item, periodIndex) {
  const pulled = Boolean(item.pulled_forward || item.is_overridden);
  return {
    ...item,
    pulled_forward: pulled,
    can_pull_forward:
      item.can_pull_forward ??
      (periodIndex >= 1 && !item.is_paid && !item.is_overdue && !pulled),
    can_revert_override:
      item.can_revert_override ??
      (pulled && Boolean(item.natural_period_start || item.original_pay_period_start)),
  };
}

export function augmentPaycheckPlan(plan) {
  if (!plan) return plan;
  if (!plan.paychecks?.length) return plan;
  return {
    ...plan,
    paychecks: plan.paychecks.map((pc, idx) => ({
      ...pc,
      is_next: idx === 1 || pc.is_next,
      assigned_items: (pc.assigned_items || []).map((it) => enrichPlanItemFlags(it, idx)),
    })),
  };
}
