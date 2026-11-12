import { describe, expect, it } from 'vitest';
import { formatDateISO } from './payPeriods';

describe('date-only serialization', () => {
  it('preserves local calendar dates instead of converting to UTC', () => {
    expect(formatDateISO(new Date(2026, 10, 12))).toBe('2026-11-12');
    expect(formatDateISO('2026-11-12')).toBe('2026-11-12');
  });
});
