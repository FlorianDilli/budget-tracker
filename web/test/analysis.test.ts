import { describe, expect, it } from 'vitest';
import { parseFinancials } from '../src/domain/config';
import { analyzeMonth } from '../src/domain/analysis';
import type { Tx } from '../src/domain/snapshot';

const FIN = `
[[recurring_transactions]]
description = "Netflix"
amount = -9.99
recurrence_months = 1

[[recurring_transactions]]
description = "Insurance"
amount = -240
recurrence_months = 12
payment_month = [1, 7]

[[recurring_transactions]]
description = "Salary"
amount = 2000
`;

function fin() {
  const r = parseFinancials(FIN);
  if (!r.ok) throw new Error('bad fixture');
  return r.value;
}

const tx = (hash: string, date: string, description: string, cents: number): Tx => ({ hash, date, description, cents, account: 'A' });

describe('analyzeMonth verification (no spending math)', () => {
  it('verifies a matching monthly payment and reports a mismatch', () => {
    const txs = [
      tx('h1', '2025-03-03', 'NETFLIX.COM', -999),
      tx('h2', '2025-03-05', 'PAYPAL *NETFLIX', -1099),
    ];
    const a = analyzeMonth(fin(), txs, '2025-03');
    expect(a.txs[0].flags).toEqual(['VERIFIED']);
    // Smart fallback: Netflix already has a perfect match this month,
    // so the second payment is not force-matched.
    expect(a.txs[1].flags).toEqual([]);
    expect(a.txs[1].matchedEntry).toBeNull();

    const solo = analyzeMonth(fin(), [tx('h6', '2025-04-05', 'PAYPAL *NETFLIX', -1099)], '2025-04');
    expect(solo.txs[0].flags).toEqual(['AMOUNT_MISMATCH']);
    expect(solo.alerts.some((m) => m.includes('Amount mismatch'))).toBe(true);
  });

  it('verifies a yearly payment in its month and flags wrong-month payments', () => {
    const good = analyzeMonth(fin(), [tx('h1', '2025-07-02', 'INSURANCE CO', -24000)], '2025-07');
    expect(good.txs[0].flags).toEqual(['VERIFIED']);
    expect(good.budgetCents).toBe(197001);

    const wrong = analyzeMonth(fin(), [tx('h2', '2025-03-02', 'INSURANCE CO', -24000)], '2025-03');
    expect(wrong.txs[0].flags).toEqual(['WRONG_MONTH']);
    expect(wrong.alerts.some((m) => m.includes('wrong month'))).toBe(true);
  });

  it('alerts when expected monthly payments are missing (all verifiable entries)', () => {
    const a = analyzeMonth(fin(), [tx('h3', '2025-01-10', 'Cinema', -1500)], '2025-01');
    // Monthly entries (Netflix, Salary) and multi-month Insurance (due in Jan) all alert.
    expect(a.alerts).toContain('Expected recurring payment for "Insurance" not found');
    expect(a.alerts).toContain('Expected recurring payment for "Netflix" not found');
    expect(a.alerts).toContain('Expected recurring payment for "Salary" not found');
  });

  it('budget number never changes through individual bookings and has no spending math', () => {
    const empty = analyzeMonth(fin(), [], '2025-02');
    const withTx = analyzeMonth(fin(), [tx('h4', '2025-02-10', 'Lidl', -4000)], '2025-02');
    // Plan: Netflix -9.99, Salary +2000.00, Insurance -20.00 monthly share.
    expect(empty.budgetCents).toBe(-999 + 200000 + -2000);
    expect(withTx.budgetCents).toBe(empty.budgetCents);
    expect(withTx).not.toHaveProperty('spendCents');
    expect(withTx).not.toHaveProperty('leftCents');
    expect(withTx).not.toHaveProperty('categories');
    expect(withTx.txs[0]).not.toHaveProperty('category');
    expect(withTx.txs[0]).not.toHaveProperty('spendCents');
  });

  it('never matches or alerts plan-only entries without a description', () => {
    const r = parseFinancials('[[recurring_transactions]]\namount = -5\n');
    if (!r.ok) throw new Error('bad');
    const a = analyzeMonth(r.value, [tx('h5', '2025-01-02', 'anything', -500)], '2025-01');
    expect(a.txs[0].matchedEntry).toBeNull();
    expect(a.alerts).toEqual([]);
    expect(a.budgetCents).toBe(-500); // still counted in the plan
  });

  it('checks a lump-sum payment as a single item without a breakdown', () => {
    const r = parseFinancials('[[recurring_transactions]]\ndescription = "Lump-sum payment partner"\namount = 45.00\n');
    if (!r.ok) throw new Error('bad fixture');
    const ok = analyzeMonth(r.value, [tx('h1', '2025-03-01', 'Lump-sum payment partner', 4500)], '2025-03');
    expect(ok.txs[0].flags).toEqual(['VERIFIED']);
    expect(ok.alerts).toEqual([]);
    const missing = analyzeMonth(r.value, [], '2025-03');
    expect(missing.alerts).toContain('Expected recurring payment for "Lump-sum payment partner" not found');
  });

  it('separates same-payee transactions by purpose (Verwendungszweck)', () => {
    const r = parseFinancials(`
[[recurring_transactions]]
description = "Max Mustermann"
purpose = "Rent January"
amount = -850
[[recurring_transactions]]
description = "Max Mustermann"
purpose = "Rent February"
amount = -850
`);
    if (!r.ok) throw new Error('bad fixture');
    const t = (hash: string, purpose: string): Tx => ({ hash, date: '2025-02-03', description: 'Max Mustermann', purpose, cents: -85000, account: 'A' });
    const a = analyzeMonth(r.value, [t('h1', 'Rent January'), t('h2', 'Rent February')], '2025-02');
    expect(a.txs[0].matchedEntry).toBe(0);
    expect(a.txs[1].matchedEntry).toBe(1);
    expect(a.txs.every((x) => x.flags.includes('VERIFIED'))).toBe(true);
    expect(a.alerts).toEqual([]);
    // A booking with an unknown purpose matches neither entry.
    const other = analyzeMonth(r.value, [t('h3', 'Something else')], '2025-02');
    expect(other.txs[0].matchedEntry).toBeNull();
    expect(other.alerts).toHaveLength(2);
  });

  it('uses transaction-date pricing while the plan uses month-end pricing', () => {
    const r = parseFinancials('[[recurring_transactions]]\ndescription="Service"\namount=-10\nstart_date="2025-01-01"\namount_history=[{from=2025-03-20, amount=-15}]');
    if (!r.ok) throw new Error('bad fixture');
    const result = analyzeMonth(r.value, [tx('h', '2025-03-10', 'Service', -1000)], '2025-03');
    expect(result.budgetCents).toBe(-1500);
    expect(result.txs[0].flags).toEqual(['VERIFIED']);
  });
});
