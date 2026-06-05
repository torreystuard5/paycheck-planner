import { DebtInterestPreview } from './DebtInterestPanel';
import { cn } from './ui';

/**
 * Add/Edit Debt modal wrapper — uses shared DebtInterestPreview logic.
 */
export default function DebtFormInterestPreview({ balance, apr, minimumPayment, className }) {
  return (
    <div data-testid="debt-interest-preview">
      <DebtInterestPreview
        balance={balance}
        apr={apr}
        minimumPayment={minimumPayment}
        className={cn('border-2 border-debt-500/40 bg-debt-50 shadow-none', className)}
      />
    </div>
  );
}
