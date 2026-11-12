import { useContext } from 'react';
import { BudgetContext } from './BudgetContextValue';

export function useBudget() {
  const ctx = useContext(BudgetContext);
  if (!ctx) throw new Error('useBudget must be used within a BudgetProvider');
  return ctx;
}
