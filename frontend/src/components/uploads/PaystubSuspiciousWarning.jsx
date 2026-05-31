import { AlertTriangle } from 'lucide-react';

const SANITY_ERROR_LABELS = {
  gross_less_than_net: 'Gross is less than net pay',
  net_is_zero: 'Net pay is zero',
  gross_too_large_vs_net: 'Gross is implausibly large compared to net pay',
  gross_exceeds_max: 'Gross exceeds the maximum plausible amount',
  net_nonpositive: 'Net pay is not a positive amount',
};

function friendlyError(code) {
  return SANITY_ERROR_LABELS[code] || code;
}

/**
 * Advisory warning shown when OCR-parsed paystub amounts look implausible.
 * It never blocks the user — they can still edit the amounts and confirm.
 * Renders nothing unless `isSuspicious` is set or `sanityErrors` is non-empty.
 */
export default function PaystubSuspiciousWarning({ isSuspicious, sanityErrors }) {
  const errors = Array.isArray(sanityErrors) ? sanityErrors : [];
  if (!isSuspicious && errors.length === 0) return null;

  return (
    <div
      role="alert"
      className="bg-yellow-50 border border-yellow-100 text-yellow-800 rounded-lg p-3 text-sm"
    >
      <p className="font-medium flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        These numbers look unusual. Please double-check before confirming.
      </p>
      {errors.length > 0 && (
        <ul className="mt-2 list-disc ml-5 text-xs">
          {errors.map((e) => (
            <li key={e}>{friendlyError(e)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
