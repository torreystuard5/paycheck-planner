/**
 * Converts raw lowercase/snake_case/hyphenated strings to Title Case for display.
 * Examples:
 *   "credit card" → "Credit Card"
 *   "student_loan" → "Student Loan"
 *   "auto-loan" → "Auto Loan"
 *   "other" → "Other"
 *   "mortgage" → "Mortgage"
 *   null/undefined → ""
 */
export function formatLabel(str) {
  if (!str) return '';
  return str
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}
