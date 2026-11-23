import { useEffect, useState } from 'react';
import type { Financials, RecurringEntry } from '../domain/config';
import { centsToDecimal, parseDecimalToCents, type Cents } from '../domain/money';
import { todayIso } from '../domain/dates';
import { Card, InfoButton } from './common';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function blankEntry(index: number): RecurringEntry {
  return {
    index, line: 1, label: `Recurring entry ${index + 1}`, description: '', purpose: undefined,
    baseCents: 0, history: [], recurrence: 1, paymentMonths: [], start: undefined, end: undefined,
    intuitiveName: undefined, category: undefined,
  };
}

function reindex(entries: RecurringEntry[]): RecurringEntry[] {
  return entries.map((e, i) => ({ ...e, index: i, line: 1, label: `Recurring entry ${i + 1}${e.description ? ` "${e.description}"` : ''}` }));
}

export function BudgetForm({ value, onChange }: { value: Financials; onChange: (next: Financials) => void }) {
  const patchEntry = (index: number, patch: Partial<RecurringEntry>) =>
    onChange({ ...value, recurring: reindex(value.recurring.map((e, i) => (i === index ? { ...e, ...patch } : e))) });
  const removeEntry = (index: number) => onChange({ ...value, recurring: reindex(value.recurring.filter((_, i) => i !== index)) });
  const addEntry = () => onChange({ ...value, recurring: reindex([...value.recurring, blankEntry(value.recurring.length)]) });

  const patchCash = (index: number, patch: Partial<Financials['cash'][number]>) =>
    onChange({ ...value, cash: value.cash.map((c, i) => (i === index ? { ...c, ...patch } : c)) });
  const removeCash = (index: number) => onChange({ ...value, cash: value.cash.filter((_, i) => i !== index) });
  const addCash = () => onChange({ ...value, cash: [...value.cash, { date: todayIso(new Date()), cents: 0 }] });

  return (
    <div className="budget-form">
      <Card title="Recurring entries" info="Plan your monthly budget with input fields. Leave the description empty for plan-only entries that are never checked against bookings.">
        <p className="muted small">Each entry is one recurring payment. Positive amounts are income, negative amounts are expenses.</p>
        {value.recurring.length === 0 && (
          <div className="format-empty">
            <div className="format-empty-copy">
              <span className="format-empty-icon" aria-hidden="true">§</span>
              <div>
                <strong>No recurring entries yet</strong>
                <p className="muted small">Add your salary, rent, subscriptions and other recurring payments.</p>
              </div>
            </div>
            <button type="button" className="primary" onClick={addEntry}>Add entry</button>
          </div>
        )}
        {value.recurring.map((entry, index) => (
          <section className="budget-entry" key={index} aria-label={`Recurring entry ${index + 1}`}>
            <header className="budget-entry-head">
              <strong>{entry.description || entry.intuitiveName || `Entry ${index + 1}`}</strong>
              <button type="button" onClick={() => removeEntry(index)} aria-label={`Remove entry ${index + 1}`}>Remove</button>
            </header>
            <div className="settings-grid">
              <label><span className="setting-label">Description<InfoButton label="Description" text="Text matched against imported bookings (payee name). Leave empty for plan-only entries that are never checked." /></span>
                <input value={entry.description} placeholder="e.g. Salary, Netflix" onChange={(e) => patchEntry(index, { description: e.target.value })} />
              </label>
              <label><span className="setting-label">Purpose (Verwendungszweck)<InfoButton label="Purpose" text="Optional. Finer than the description: when the same person appears with different purposes, only bookings containing this purpose match this entry." /></span>
                <input value={entry.purpose ?? ''} placeholder="Optional, e.g. Rent January" onChange={(e) => patchEntry(index, { purpose: e.target.value || undefined })} />
              </label>
              <label><span className="setting-label">Display name<InfoButton label="Display name" text="Optional friendly name shown in the visual budget instead of the description." /></span>
                <input value={entry.intuitiveName ?? ''} placeholder="Optional" onChange={(e) => patchEntry(index, { intuitiveName: e.target.value || undefined })} />
              </label>
              <label><span className="setting-label">Category<InfoButton label="Category" text="Optional grouping label used in the visual budget (e.g. Housing, Food)." /></span>
                <input value={entry.category ?? ''} placeholder="Optional" onChange={(e) => patchEntry(index, { category: e.target.value || undefined })} />
              </label>
              <label><span className="setting-label">Amount<InfoButton label="Amount" text="Monthly amount. Negative for expenses, positive for income. Use the amount history below if the amount changed over time." /></span>
                <AmountField cents={entry.baseCents} onChange={(cents) => patchEntry(index, { baseCents: cents })} ariaLabel={`Amount for entry ${index + 1}`} />
              </label>
              <label><span className="setting-label">Recurrence (months)<InfoButton label="Recurrence" text="Every how many months this entry occurs. 1 = monthly, 12 = yearly." /></span>
                <input type="number" min={1} step={1} value={entry.recurrence} onChange={(e) => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 1) patchEntry(index, { recurrence: n }); }} />
              </label>
              <label><span className="setting-label">Start date<InfoButton label="Start date" text="Optional first date this entry is active." /></span>
                <input type="date" value={entry.start ?? ''} onChange={(e) => patchEntry(index, { start: e.target.value ? (e.target.value as RecurringEntry['start']) : undefined })} />
              </label>
              <label><span className="setting-label">End date<InfoButton label="End date" text="Optional last date this entry is active." /></span>
                <input type="date" value={entry.end ?? ''} onChange={(e) => patchEntry(index, { end: e.target.value ? (e.target.value as RecurringEntry['end']) : undefined })} />
              </label>
            </div>
            <fieldset className="payment-months">
              <legend className="setting-label">Payment months<InfoButton label="Payment months" text="For multi-month entries: the months in which the payment is actually due. Leave empty for monthly entries." /></legend>
              <div className="month-chips">
                {MONTHS.map((label, i) => {
                  const month = i + 1;
                  const active = entry.paymentMonths.includes(month);
                  return <button type="button" key={label} aria-pressed={active} className={`month-chip${active ? ' active' : ''}`} onClick={() => patchEntry(index, { paymentMonths: active ? entry.paymentMonths.filter((m) => m !== month) : [...entry.paymentMonths, month].sort((a, b) => a - b) })}>{label}</button>;
                })}
              </div>
            </fieldset>
            <div className="amount-history">
              <span className="setting-label">Amount history<InfoButton label="Amount history" text="Optional price changes over time: from a date on, the new amount applies." /></span>
              {entry.history.map((h, hi) => (
                <div className="history-row" key={hi}>
                  <input type="date" aria-label={`History ${hi + 1} from`} value={h.from} onChange={(e) => { if (e.target.value) patchEntry(index, { history: entry.history.map((x, j) => (j === hi ? { ...x, from: e.target.value as typeof x.from } : x)) }); }} />
                  <AmountField cents={h.cents} onChange={(cents) => patchEntry(index, { history: entry.history.map((x, j) => (j === hi ? { ...x, cents } : x)) })} ariaLabel={`History ${hi + 1} amount`} />
                  <button type="button" onClick={() => patchEntry(index, { history: entry.history.filter((_, j) => j !== hi) })} aria-label={`Remove history ${hi + 1}`}>Remove</button>
                </div>
              ))}
              <button type="button" onClick={() => patchEntry(index, { history: [...entry.history, { from: entry.start ?? todayIso(new Date()), cents: entry.baseCents ?? 0 }] })}>Add price change</button>
            </div>
          </section>
        ))}
        {value.recurring.length > 0 && <div className="format-add"><button type="button" onClick={addEntry}>Add entry</button></div>}
      </Card>

      <Card title="Cash" info="One-off cash amounts with a date. The latest cash entry up to the selected month is shown as your cash snapshot.">
        {value.cash.length === 0 && <p className="muted small">No cash entries. Add one if you track a cash balance separately from imported transactions.</p>}
        {value.cash.map((c, i) => (
          <div className="history-row" key={i}>
            <input type="date" aria-label={`Cash entry ${i + 1} date`} value={c.date} onChange={(e) => { if (e.target.value) patchCash(i, { date: e.target.value as typeof c.date }); }} />
            <AmountField cents={c.cents} onChange={(cents) => patchCash(i, { cents })} ariaLabel={`Cash entry ${i + 1} amount`} />
            <button type="button" onClick={() => removeCash(i)} aria-label={`Remove cash entry ${i + 1}`}>Remove</button>
          </div>
        ))}
        <div className="format-add"><button type="button" onClick={addCash}>Add cash entry</button></div>
      </Card>
    </div>
  );
}

export function AmountField({ cents, onChange, ariaLabel }: { cents: Cents | null; onChange: (cents: Cents) => void; ariaLabel?: string }) {
  const [draft, setDraft] = useState(() => (cents === null ? '' : centsToDecimal(cents)));
  useEffect(() => { setDraft(cents === null ? '' : centsToDecimal(cents)); }, [cents]);
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const normalized = draft.trim().replace(',', '.').replace(/\.$/, '.0');
        try {
          const parsed = parseDecimalToCents(normalized);
          onChange(parsed);
          setDraft(centsToDecimal(parsed));
        } catch {
          setDraft(cents === null ? '' : centsToDecimal(cents));
        }
      }}
    />
  );
}
