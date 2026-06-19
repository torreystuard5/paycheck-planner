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

function recomputePaycheckAssignedStats(paycheck) {
  const items = paycheck.assigned_items || [];
  const paidItems = items.filter((i) => i.is_paid);
  const paidCount = paidItems.length;
  const totalItems = items.length;
  const totalAmount = items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const paidAmount = paidItems.reduce((s, i) => s + (Number(i.amount) || 0), 0);

  return {
    ...paycheck,
    assigned_items: items,
    assigned_paid_count: paidCount,
    assigned_total_count: totalItems,
    assigned_total_amount: totalAmount,
    assigned_paid_amount: paidAmount,
    assigned_still_owed: totalAmount - paidAmount,
    assigned_progress_percent: totalItems > 0 ? (paidCount / totalItems) * 100 : 0,
  };
}

function itemOccurrenceDate(item) {
  return item?.occurrence_due_date || item?.due_date || null;
}

/** Update is_paid on a current-period assigned item without refetching the full plan. */
export function patchPaycheckPlanItemPaid(plan, itemType, itemId, isPaid, occurrenceDueDate = null) {
  if (!plan) return plan;
  const matchId = String(itemId);
  const matchOccurrence = occurrenceDueDate ? String(occurrenceDueDate).slice(0, 10) : null;

  const patchItems = (items) =>
    (items || []).map((it) => {
      const id = String(it.id ?? it.item_id);
      const occurrence = itemOccurrenceDate(it);
      const sameOccurrence = !matchOccurrence || (occurrence && String(occurrence).slice(0, 10) === matchOccurrence);
      if (it.item_type === itemType && id === matchId && sameOccurrence) {
        return { ...it, is_paid: isPaid };
      }
      return it;
    });

  const patchPaycheck = (pc) => {
    if (!pc) return pc;
    return recomputePaycheckAssignedStats({
      ...pc,
      assigned_items: patchItems(pc.assigned_items),
    });
  };

  const next = { ...plan };
  if (next.current_paycheck) {
    next.current_paycheck = patchPaycheck(next.current_paycheck);
  }
  if (next.paychecks?.length) {
    next.paychecks = next.paychecks.map((pc, idx) => (idx === 0 ? patchPaycheck(pc) : pc));
  }
  return next;
}
