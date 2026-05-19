import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';

/**
 * Pull-forward / revert controls for paycheck plan assigned items.
 */
export default function PaycheckPlanItemActions({
  item,
  busy,
  onPullForward,
  onRevert,
  compact = false,
}) {
  const canRevert = Boolean(
    item?.can_revert_override || item?.pulled_forward || item?.is_overridden,
  );
  const canPull = Boolean(item?.can_pull_forward);

  if (!canPull && !canRevert) {
    return null;
  }

  const btnClass = compact
    ? 'shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors disabled:opacity-50'
    : 'shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border transition-colors disabled:opacity-50';

  if (canRevert) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => onRevert(item)}
        className={`${btnClass} border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100`}
        title="Return to original paycheck"
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowLeft className="w-3 h-3" />}
        {!compact && <span>Move back</span>}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onPullForward(item)}
      className={`${btnClass} border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100`}
      title="Pull into current paycheck"
    >
      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
      {!compact && <span>Pull here</span>}
    </button>
  );
}
