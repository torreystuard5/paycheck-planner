import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BudgetProvider } from './BudgetContext';
import { useBudget } from './useBudget';
import { BusinessAccessProvider } from './BusinessAccessContext';
import { useBusinessAccess } from './useBusinessAccess';

const { auth, get } = vi.hoisted(() => ({ auth: { current: null }, get: vi.fn() }));
vi.mock('./useAuth', () => ({ useAuth: () => auth.current }));
vi.mock('../services/api', () => ({ default: { get } }));

function BudgetView() {
  const { activeBudget, budgets } = useBudget();
  return <output>{activeBudget?.name || 'none'}:{budgets.map((b) => b.name).join(',')}</output>;
}
function AccessView() {
  const { canWrite, can } = useBusinessAccess();
  return <output>{String(canWrite)}:{String(can('manage_sales'))}</output>;
}
function login(id) {
  auth.current = { user: { id }, isAuthenticated: true, subscription: {} };
}

beforeEach(() => { get.mockReset(); localStorage.clear(); login('alice'); });

describe('authenticated provider isolation', () => {
  it('clears budgets on logout before another request can complete', async () => {
    get.mockImplementation((url) => Promise.resolve({ data: url.endsWith('/current') ? { name: 'Alice', id: 'a' } : [{ name: 'Alice' }] }));
    const view = render(<BudgetProvider><BudgetView /></BudgetProvider>);
    await screen.findByText('Alice:Alice');
    auth.current = { user: null, isAuthenticated: false };
    view.rerender(<BudgetProvider><BudgetView /></BudgetProvider>);
    expect(screen.getByText('none:')).toBeInTheDocument();
  });

  it('does not publish an old user budget response into the next session', async () => {
    const pending = [];
    get.mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
    const view = render(<BudgetProvider><BudgetView /></BudgetProvider>);
    await waitFor(() => expect(pending).toHaveLength(2));
    login('bob');
    view.rerender(<BudgetProvider><BudgetView /></BudgetProvider>);
    await waitFor(() => expect(pending).toHaveLength(4));
    await act(async () => { pending[0]({ data: [{ name: 'Alice' }] }); pending[1]({ data: { name: 'Alice', id: 'a' } }); });
    expect(screen.getByText('none:')).toBeInTheDocument();
    // Old responses must not overwrite the active budget used by API calls.
    expect(localStorage.getItem('active_budget_id')).toBeNull();
  });

  it('fails closed while business permissions are loading or unavailable', async () => {
    get.mockRejectedValue(new Error('offline'));
    render(<BusinessAccessProvider><AccessView /></BusinessAccessProvider>);
    expect(screen.getByText('false:false')).toBeInTheDocument();
    await waitFor(() => expect(get).toHaveBeenCalledOnce());
    expect(screen.getByText('false:false')).toBeInTheDocument();
  });

  it('does not share business requests across account switches', async () => {
    const pending = [];
    get.mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
    const view = render(<BusinessAccessProvider><AccessView /></BusinessAccessProvider>);
    await waitFor(() => expect(pending).toHaveLength(1));
    login('bob');
    view.rerender(<BusinessAccessProvider><AccessView /></BusinessAccessProvider>);
    await waitFor(() => expect(pending).toHaveLength(2));
    await act(async () => pending[0]({ data: { can_write_business: true, team_role: 'owner' } }));
    expect(screen.getByText('false:false')).toBeInTheDocument();
    await act(async () => pending[1]({ data: { can_write_business: true, team_role: 'employee', team_permissions: { manage_sales: false } } }));
    expect(screen.getByText('true:false')).toBeInTheDocument();
  });
});
