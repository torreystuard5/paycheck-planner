import { useEffect, useRef, useState, useCallback } from 'react';
import api from '../services/api';
import { useAuth } from './useAuth';

import { BudgetContext } from './BudgetContextValue';

export function BudgetProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  return <BudgetSession key={user?.id ?? 'signed-out'} isAuthenticated={isAuthenticated}>{children}</BudgetSession>;
}

function BudgetSession({ children, isAuthenticated }) {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const [activeBudget, setActiveBudgetState] = useState(null);
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(isAuthenticated);
  const [budgetVersion, setBudgetVersion] = useState(0);

  const fetchBudgets = useCallback(async () => {
    try {
      const { data } = await api.get('/api/v1/budgets');
      if (mounted.current) setBudgets(Array.isArray(data) ? data : []);
    } catch {
      setBudgets([]);
    }
  }, []);

  const fetchCurrentBudget = useCallback(async () => {
    try {
      const { data } = await api.get('/api/v1/budgets/current');
      if (!mounted.current) return;
      setActiveBudgetState(data);
      if (data?.id) {
        localStorage.setItem('active_budget_id', data.id);
      }
    } catch {
      setActiveBudgetState(null);
    }
  }, []);

  const refreshBudgets = useCallback(async () => {
    await Promise.all([fetchBudgets(), fetchCurrentBudget()]);
  }, [fetchBudgets, fetchCurrentBudget]);

  // Load budgets on auth
  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    const init = async () => {
      setLoading(true);
      await refreshBudgets();
      setLoading(false);
    };
    init();
  }, [isAuthenticated, refreshBudgets]);

  const bumpBudgetVersion = useCallback(() => {
    setBudgetVersion((v) => v + 1);
  }, []);

  const setActiveBudget = useCallback(async (budgetId) => {
    await api.post(`/api/v1/budgets/${budgetId}/set-active`);
    await fetchCurrentBudget();
    await fetchBudgets();
    if (!mounted.current) return;
    localStorage.setItem('active_budget_id', budgetId);
    // Bump version so all data-fetching pages refetch.
    setBudgetVersion((v) => v + 1);
  }, [fetchCurrentBudget, fetchBudgets]);

  return (
    <BudgetContext.Provider
      value={{
        activeBudget,
        budgets,
        loading,
        budgetVersion,
        bumpBudgetVersion,
        refreshBudgets,
        setActiveBudget,
      }}
    >
      {children}
    </BudgetContext.Provider>
  );
}
