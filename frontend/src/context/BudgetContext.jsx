import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';

const BudgetContext = createContext(null);

export function BudgetProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [activeBudget, setActiveBudgetState] = useState(null);
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [budgetVersion, setBudgetVersion] = useState(0);

  const fetchBudgets = useCallback(async () => {
    try {
      const { data } = await api.get('/api/v1/budgets');
      setBudgets(Array.isArray(data) ? data : []);
    } catch {
      setBudgets([]);
    }
  }, []);

  const fetchCurrentBudget = useCallback(async () => {
    try {
      const { data } = await api.get('/api/v1/budgets/current');
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
      setActiveBudgetState(null);
      setBudgets([]);
      setLoading(false);
      return;
    }
    const init = async () => {
      setLoading(true);
      await refreshBudgets();
      setLoading(false);
    };
    init();
  }, [isAuthenticated, refreshBudgets]);

  const setActiveBudget = useCallback(async (budgetId) => {
    try {
      await api.post(`/api/v1/budgets/${budgetId}/set-active`);
      await fetchCurrentBudget();
      await fetchBudgets();
      localStorage.setItem('active_budget_id', budgetId);
      // Bump version so all data-fetching pages refetch
      setBudgetVersion((v) => v + 1);
    } catch (err) {
      throw err;
    }
  }, [fetchCurrentBudget, fetchBudgets]);

  return (
    <BudgetContext.Provider
      value={{
        activeBudget,
        budgets,
        loading,
        budgetVersion,
        refreshBudgets,
        setActiveBudget,
      }}
    >
      {children}
    </BudgetContext.Provider>
  );
}

export function useBudget() {
  const ctx = useContext(BudgetContext);
  if (!ctx) throw new Error('useBudget must be used within a BudgetProvider');
  return ctx;
}
