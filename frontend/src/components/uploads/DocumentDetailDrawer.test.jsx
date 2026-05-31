import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: [] })) },
  getDocument: vi.fn(),
  getBusinessDocument: vi.fn(() => Promise.resolve({ data: {} })),
  linkDocument: vi.fn(() => Promise.resolve({ data: {} })),
  linkBusinessDocument: vi.fn(() => Promise.resolve({ data: {} })),
  createBillFromOcr: vi.fn(() => Promise.resolve({ data: {} })),
  confirmPaystubFromDocument: vi.fn(() => Promise.resolve({ data: {} })),
}));

vi.mock('../../context/BudgetContext', () => ({
  useBudget: () => ({ activeBudget: { id: 'budget-1' } }),
}));

vi.mock('../Toast', () => ({
  useToast: () => () => {},
}));

import DocumentDetailDrawer from './DocumentDetailDrawer';
import { getDocument, confirmPaystubFromDocument } from '../../services/api';

const suspiciousDoc = {
  id: 'doc-1',
  document_type: 'paystub',
  original_filename: 'paystub.pdf',
  status: 'completed',
  parsed_json: {
    employer_name: 'TinyCo',
    pay_date: '2026-01-01',
    gross_amount: '18000.00',
    net_amount: '200.00',
    is_suspicious: true,
    sanity_errors: ['gross_too_large_vs_net'],
  },
};

const normalDoc = {
  ...suspiciousDoc,
  parsed_json: {
    employer_name: 'Contoso LLC',
    pay_date: '2026-03-01',
    gross_amount: '3500.00',
    net_amount: '2450.00',
    is_suspicious: false,
    sanity_errors: [],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DocumentDetailDrawer — suspicious paystub warning', () => {
  it('shows the warning for a suspicious paystub and still allows editing + confirming', async () => {
    getDocument.mockResolvedValue({ data: suspiciousDoc });

    render(
      <DocumentDetailDrawer
        documentId="doc-1"
        initialDoc={suspiciousDoc}
        scope="personal"
        onClose={() => {}}
        onUpdated={() => {}}
      />,
    );

    // Warning is visible
    expect(
      await screen.findByText(
        /These numbers look unusual\. Please double-check before confirming\./i,
      ),
    ).toBeVisible();
    expect(
      screen.getByText('Gross is implausibly large compared to net pay'),
    ).toBeVisible();

    // Amounts remain editable
    const netInput = screen.getByPlaceholderText('Net pay');
    expect(netInput).toBeEnabled();
    fireEvent.change(netInput, { target: { value: '250.00' } });

    // Confirm is not blocked
    const confirmBtn = screen.getByRole('button', { name: /Confirm paycheck entry/i });
    expect(confirmBtn).toBeEnabled();
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(confirmPaystubFromDocument).toHaveBeenCalledTimes(1);
    });
    const [docId, payload] = confirmPaystubFromDocument.mock.calls[0];
    expect(docId).toBe('doc-1');
    expect(payload.net_amount).toBe(250);
    expect(payload.source_name).toBe('TinyCo');
  });

  it('does not show the warning for a normal paystub', async () => {
    getDocument.mockResolvedValue({ data: normalDoc });

    render(
      <DocumentDetailDrawer
        documentId="doc-1"
        initialDoc={normalDoc}
        scope="personal"
        onClose={() => {}}
      />,
    );

    // The confirm form renders...
    expect(await screen.findByPlaceholderText('Net pay')).toBeInTheDocument();
    // ...but no warning.
    expect(
      screen.queryByText(/These numbers look unusual/i),
    ).not.toBeInTheDocument();
  });
});
