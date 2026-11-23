import type { Financials, RecurringEntry } from './config';
import { planForMonth, planBudgetCents, priceAt, type PlanLine } from './plan';
import { monthFirst, monthLast, monthOf, type YearMonth } from './dates';
import type { Cents } from './money';
import type { Tx } from './snapshot';

export type Flag = 'VERIFIED' | 'AMOUNT_MISMATCH' | 'WRONG_MONTH';

export interface TxAnalysis {
  tx: Tx;
  /** Some recurring entry's description occurs in this transaction's description. */
  recurring: boolean;
  matchedEntry: number | null;
  flags: Flag[];
}

export interface MonthAnalysis {
  ym: YearMonth;
  plan: PlanLine[];
  /** Monthly plan net (Soll): sum of recurring entries only. Never changed by bookings. */
  budgetCents: Cents;
  txs: TxAnalysis[];
  alerts: string[];
}

/**
 * Verification only (Prüfung): entries with a description are checked against
 * bookings (description-contains, priceAt, perfect-match fallback).
 * A matched booking contributes NOTHING to any budget/spending figure —
 * the budget number is planBudgetCents alone. Entries without a description
 * are plan-only: never matched, never alerted.
 * Missing-payment alerts cover every verifiable (description-bearing) active
 * entry that is due this month: monthly entries every month, multi-month
 * entries only in their payment months.
 */
export function analyzeMonth(financials: Financials, txs: Tx[], ym: YearMonth): MonthAnalysis {
  const plan = planForMonth(financials, ym);
  const budgetCents = planBudgetCents(plan);
  const activeByIndex = new Map(plan.map((l) => [l.entry.index, l.active]));
  const configs = financials.recurring.filter((e) => e.description.length > 0);
  const first = monthFirst(ym);
  const last = monthLast(ym);
  const month = Number(ym.slice(5, 7));
  const monthTxs = txs.filter((t) => t.date >= first && t.date <= last).sort(byDateThenDesc);

  const contains = (tx: Tx, e: RecurringEntry) => tx.description.toLowerCase().includes(e.description.toLowerCase());
  const activeConfigs = (tx: Tx) => configs.filter((e) => activeByIndex.get(e.index) && contains(tx, e));

  // Smart fallback: entries that have a perfect (amount-equal) match somewhere this month.
  const perfect = new Set<number>();
  for (const tx of monthTxs) {
    for (const e of activeConfigs(tx)) {
      if (priceAt(e, tx.date) === tx.cents) perfect.add(e.index);
    }
  }

  const alerts: string[] = [];
  const matched = new Set<number>();

  const analyses: TxAnalysis[] = monthTxs.map((tx) => {
    const isRecurring = configs.some((e) => contains(tx, e));
    const out: TxAnalysis = { tx, recurring: isRecurring, matchedEntry: null, flags: [] };
    const potential = activeConfigs(tx);

    if (!isRecurring || potential.length === 0) {
      return out;
    }

    const priceFor = (e: RecurringEntry) => priceAt(e, tx.date);
    const chosen: RecurringEntry | undefined =
      potential.find((e) => priceFor(e) === tx.cents && (e.paymentMonths.length === 0 || e.paymentMonths.includes(month))) ??
      potential.find((e) => priceFor(e) === tx.cents) ??
      potential.find((e) => !perfect.has(e.index));

    if (!chosen) {
      return out;
    }

    out.matchedEntry = chosen.index;
    matched.add(chosen.index);
    const defined = priceFor(chosen);

    if (chosen.recurrence === 1) {
      if (defined === null) {
        return out;
      }
      const diff = tx.cents - defined;
      if (diff !== 0) {
        out.flags.push('AMOUNT_MISMATCH');
        alerts.push(`Amount mismatch for "${tx.description}": expected ${fmt(defined)}, got ${fmt(tx.cents)}`);
      } else out.flags.push('VERIFIED');
      return out;
    }

    const paymentMonths = chosen.paymentMonths;
    if (paymentMonths.length === 0) {
      // No payment month defined: the budget already reserves the monthly share.
      return out;
    }
    if (paymentMonths.includes(month)) {
      if (defined === null) {
        return out;
      }
      const diff = tx.cents - defined;
      if (diff !== 0) {
        out.flags.push('AMOUNT_MISMATCH');
        alerts.push(`Amount mismatch for "${tx.description}": expected ${fmt(defined)}, got ${fmt(tx.cents)}`);
      } else out.flags.push('VERIFIED');
    } else {
      out.flags.push('WRONG_MONTH');
      alerts.push(`Recurring payment "${tx.description}" detected in wrong month (expected ${paymentMonths.join(', ')})`);
    }
    return out;
  });

  for (const e of configs) {
    const due = e.recurrence === 1 || (e.paymentMonths.length > 0 && e.paymentMonths.includes(month));
    if (due && activeByIndex.get(e.index) && !matched.has(e.index)) {
      alerts.push(`Expected recurring payment for "${e.description}" not found`);
    }
  }

  return {
    ym,
    plan,
    budgetCents,
    txs: analyses,
    alerts,
  };
}

/** Transactions dated in a month, sorted by date (newest first). */
export function txsInMonth(txs: Tx[], ym: YearMonth): Tx[] {
  return txs.filter((t) => monthOf(t.date) === ym);
}

function byDateThenDesc(a: Tx, b: Tx): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return a.description < b.description ? -1 : a.description > b.description ? 1 : 0;
}

function fmt(cents: Cents | null): string {
  return cents === null ? 'n/a' : (cents / 100).toFixed(2);
}
