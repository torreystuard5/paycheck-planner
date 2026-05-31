import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import PaystubSuspiciousWarning from './PaystubSuspiciousWarning';

describe('PaystubSuspiciousWarning', () => {
  it('renders nothing for a normal paystub', () => {
    const { container } = render(
      <PaystubSuspiciousWarning isSuspicious={false} sanityErrors={[]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the warning copy and reasons when suspicious', () => {
    render(
      <PaystubSuspiciousWarning
        isSuspicious
        sanityErrors={['gross_too_large_vs_net', 'gross_exceeds_max']}
      />,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByText(
        /These numbers look unusual\. Please double-check before confirming\./i,
      ),
    ).toBeVisible();
    expect(
      screen.getByText('Gross is implausibly large compared to net pay'),
    ).toBeVisible();
    expect(screen.getByText('Gross exceeds the maximum plausible amount')).toBeVisible();
  });

  it('shows the warning when sanity_errors is non-empty even if is_suspicious is falsy', () => {
    render(<PaystubSuspiciousWarning isSuspicious={false} sanityErrors={['net_is_zero']} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Net pay is zero')).toBeVisible();
  });
});
