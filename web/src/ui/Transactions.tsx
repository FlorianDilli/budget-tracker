import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useSession, type ImportPreview } from '../state/session';
import { analyzeMonth, type TxAnalysis } from '../domain/analysis';
import { currentMonth, fullMonthLabel, type YearMonth } from '../domain/dates';
import { Card, Money, MonthSelect, PageHeader, PreviewNotice, currencyOf, lastDataMonth, txMonths } from './common';
import { readCsv } from '../domain/csv';
import type { ImportFormat } from '../domain/config';
import { Link } from 'react-router-dom';
import { SectionTabs, useSectionParam, type SectionItem } from './SectionTabs';
import { ImportFormatsSection } from './ImportFormats';

const TABS = ['transactions', 'import', 'formats'] as const;
type Tab = (typeof TABS)[number];
const TAB_ITEMS = [
  { id: 'transactions', label: 'Transactions' },
  { id: 'import', label: 'Import' },
  { id: 'formats', label: 'Formats' },
] as const satisfies readonly SectionItem<Tab>[];

const FLAG_LABEL: Record<string, string> = {
  VERIFIED: 'verified',
  AMOUNT_MISMATCH: 'amount mismatch',
  WRONG_MONTH: 'wrong month',
};

export function Transactions() {
  const { snapshot, settings, financials, isSample, previewImport, commitImport } = useSession();
  const now = useMemo(() => new Date(), []);
  // Only months with imported (CSV) transactions are suggested here —
  // budget/recurring plan months are not transaction months.
  const months = useMemo(() => (snapshot ? txMonths(snapshot) : []), [snapshot]);
  // Default to the most recent month that actually has transactions,
  // not the current (often empty) month.
  const initialMonth = useMemo<YearMonth>(() => (snapshot ? lastDataMonth(snapshot, now) : ''), [snapshot, now]);
  const [ym, setYm] = useState<YearMonth>(() => initialMonth);
  const userPickedMonth = useRef(false);
  // Snapshot may only arrive after first render (unlock); follow it until the user picks a month.
  useEffect(() => {
    if (!userPickedMonth.current && snapshot && initialMonth) setYm(initialMonth);
  }, [snapshot, initialMonth]);
  // Keep the selected month inside the actual transaction months
  // (e.g. after an import or a month deletion).
  useEffect(() => {
    if (months.length && !months.includes(ym)) setYm(months[months.length - 1]);
  }, [months, ym]);
  const [tab, setTab] = useSectionParam<Tab>('tab', TABS, 'transactions');
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [txFilter, setTxFilter] = useState<'all' | 'uncat' | 'verified'>('all');
  if (!snapshot) return null;
  const hasTransactions = snapshot.transactions.length > 0;
  const cur = currencyOf(settings);
  const a = analyzeMonth(financials, snapshot.transactions, ym);
  const selectedTx: TxAnalysis | undefined = a.txs.find((t) => t.tx.hash === selected);
  const q = query.trim().toLowerCase();
  const filtered = a.txs.filter((t) => {
    if (txFilter === 'uncat' && t.category !== 'Uncategorized') return false;
    if (txFilter === 'verified' && !t.flags.includes('VERIFIED')) return false;
    if (q && !t.tx.description.toLowerCase().includes(q) && !t.category.toLowerCase().includes(q)) return false;
    return true;
  });
  const inCents = filtered.filter((t) => t.tx.cents > 0).reduce((s, t) => s + t.tx.cents, 0);
  const outCents = filtered.filter((t) => t.tx.cents < 0).reduce((s, t) => s + t.tx.cents, 0);
  const uncatCount = a.txs.filter((t) => t.category === 'Uncategorized').length;
  const verifiedCount = a.txs.filter((t) => t.flags.includes('VERIFIED')).length;

  return (
    <div className="page transactions-page">
      <PageHeader title="Transactions">
        <SectionTabs items={TAB_ITEMS} value={tab} onChange={setTab} label="Transactions sections" />
      </PageHeader>
      {tab === 'transactions' && hasTransactions && (
        <div className="transactions-controls">
          <MonthSelect months={months} value={ym} onChange={(m) => { userPickedMonth.current = true; setYm(m); setSelected(null); }} label="Month" />
        </div>
      )}
      {hasTransactions && <PreviewNotice isSample={isSample} />}

      {tab === 'import' && (
        <ImportPanel
          formats={settings.formats}
          onPreview={previewImport}
          onCommit={commitImport}
        />
      )}

      {tab === 'formats' && <ImportFormatsSection />}

      {tab === 'transactions' && hasTransactions && <section className="card wide" aria-label={fullMonthLabel(ym)}>
        <div className="card-header">
          <div>
            <div className="card-title-text">{fullMonthLabel(ym)}</div>
          </div>
        </div>
        <div className="tx-toolbar">
          <div className="search-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search merchant or category..." aria-label="Search transactions" />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="segmented" role="group" aria-label="Transaction filter">
              <button type="button" className={`seg-btn${txFilter === 'all' ? ' active' : ''}`} onClick={() => setTxFilter('all')}>All ({a.txs.length})</button>
              <button type="button" className={`seg-btn${txFilter === 'uncat' ? ' active' : ''}`} onClick={() => setTxFilter('uncat')}>Uncat ({uncatCount})</button>
              <button type="button" className={`seg-btn${txFilter === 'verified' ? ' active' : ''}`} onClick={() => setTxFilter('verified')}>Verified ({verifiedCount})</button>
            </div>
            <span className="badge badge-pos num">+<Money cents={inCents} currency={cur} /> in</span>
            <span className="badge badge-neg num"><Money cents={outCents} currency={cur} /> out</span>
          </div>
        </div>
        {a.txs.length === 0 ? <div className="transactions-empty">
          <span className="transactions-empty-mark" aria-hidden="true">—</span>
          <div><h3>No transactions this month</h3><p>Import a bank CSV in the Import tab to add activity for this month.</p></div>
        </div> : filtered.length === 0 ? <p className="muted">No transactions match this search.</p> : (
          <div className="table-wrap">
            <table className="tx-table">
              <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Flags</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.tx.hash} className={selected === t.tx.hash ? 'selected' : ''} onClick={() => setSelected(t.tx.hash)}>
                    <td className="tx-date num" style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{t.tx.date}</td>
                    <td className="tx-desc"><strong>{t.tx.description}</strong></td>
                    <td className="tx-cat"><span className={`badge ${t.category === 'Uncategorized' ? 'badge-warn' : 'badge-neutral'}`}>{t.category}</span></td>
                    <td className="tx-status">{t.flags.map((f) => <span key={f} className={`flag ${f.toLowerCase()}`}>{FLAG_LABEL[f]}</span>)}</td>
                    <td className="tx-amt num" style={{ fontWeight: 700 }}><Money cents={t.tx.cents} currency={cur} /></td>
                    <td className="tx-mobile-meta">
                      <span className="num">{t.tx.date}</span>
                      <span>·</span>
                      <span className={`badge ${t.category === 'Uncategorized' ? 'badge-warn' : 'badge-neutral'}`} style={{ padding: '2px 8px', fontSize: 11 }}>{t.category}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>}

      {tab === 'transactions' && selectedTx && (
        <Card title="Detail" wide>
          <dl className="detail">
            <dt>Date</dt><dd>{selectedTx.tx.date}</dd>
            <dt>Description</dt><dd>{selectedTx.tx.description}</dd>
            <dt>Account</dt><dd>{selectedTx.tx.account}</dd>
            <dt>Category</dt><dd>{selectedTx.category}</dd>
            <dt>Recurring match</dt><dd>{selectedTx.matchedEntry !== null ? financials.recurring[selectedTx.matchedEntry]?.label : 'none'}</dd>
            <dt>Effect on spending</dt><dd><Money cents={selectedTx.spendCents} currency={cur} /></dd>
            <dt>Duplicate key</dt><dd className="mono small">{selectedTx.tx.hash.slice(0, 16)}…</dd>
          </dl>
        </Card>
      )}

      {tab === 'transactions' && hasTransactions && <DeleteMonthCard months={months} />}
    </div>
  );
}

function DeleteMonthCard({ months }: { months: YearMonth[] }) {
  const { deleteMonth } = useSession();
  const [ym, setYm] = useState<YearMonth>(months[months.length - 1] ?? currentMonth(new Date()));
  const [msg, setMsg] = useState<string | null>(null);
  const run = async () => {
    if (!window.confirm(`Delete all imported transactions in ${ym}? Recurring entries are kept.`)) return;
    const n = await deleteMonth(ym);
    setMsg(`Deleted ${n} transaction(s) for ${ym}.`);
  };
  return (
    <section className="card wide danger-card" aria-label="Delete a month">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <div className="card-title-text" style={{ color: 'var(--neg)' }}>Delete Month Transactions</div>
          <div className="card-subtitle">Removes imported transactions for one month without changing settings or budget rules.</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <MonthSelect months={months} value={ym} onChange={setYm} label="Month" />
          <button className="danger" onClick={run}>Delete month</button>
        </div>
      </div>
      {msg && <p className="ok">{msg}</p>}
    </section>
  );
}

function ImportPanel({
  formats,
  onPreview,
  onCommit,
}: {
  formats: ImportFormat[];
  onPreview: (text: string, filename: string, format?: ImportFormat) => Promise<{ ok: true; preview: ImportPreview } | { ok: false; error: string; rowErrors?: string[] }>;
  onCommit: (p: ImportPreview) => Promise<number>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<{ text: string; filename: string } | null>(null);
  const [mapping, setMapping] = useState<ImportFormat | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);

  const chooseFormat = (format: ImportFormat, text: string) => {
    setMapping(format);
    try { setHeaders(readCsv(text, format.delimiter).headers); }
    catch { setHeaders([]); }
  };

  const runImport = async (text: string, filename: string, format?: ImportFormat) => {
    setError(null);
    setRowErrors([]);
    setBusy(true);
    try {
      const res = await onPreview(text, filename, format);
      if (!res.ok) { setError(res.error); setRowErrors(res.rowErrors ?? []); }
      else {
        const count = await onCommit(res.preview);
        setDone(`${filename}: ${count} new transaction(s) added, ${res.preview.duplicates} duplicate(s) skipped.`);
        setSource(null);
        setMapping(null);
        setHeaders([]);
      }
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setRowErrors([]);
    setDone(null);
    setSource(null);
    setMapping(null);
    if (!formats.length) {
      setError('Define an importer format first (Formats tab on this page).');
      return;
    }
    if (file.size > 10_000_000) return setError('File is larger than 10 MB');
    try {
      const text = await file.text();
      setSource({ text, filename: file.name });
      chooseFormat(formats[0], text);
      await runImport(text, file.name);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };

  return (
    <section className="import-panel card wide" aria-labelledby="import-title">
      <div className="import-panel-heading">
        <div>
          <h2 id="import-title">Add transactions from a CSV</h2>
          <p>Upload a bank CSV and its transactions will be added automatically. Duplicates are skipped.</p>
          {formats.length > 0
            ? <p className="import-formats"><strong>Configured formats:</strong> {formats.map((format) => format.name).join(', ')}</p>
            : <p className="import-setup-note">Before importing, <Link to="/transactions?tab=formats">set up a bank CSV format</Link>.</p>}
        </div>
        <span className="import-format-mark" aria-hidden="true">CSV</span>
      </div>
      <div className="import-panel-body">
        <label className={`csv-picker${busy ? ' is-busy' : ''}${formats.length === 0 ? ' is-disabled' : ''}`}>
          <span className="csv-picker-icon" aria-hidden="true">+</span>
          <span className="csv-picker-copy"><strong>{source ? 'Choose another CSV' : 'Select a CSV file'}</strong><small>{source ? source.filename : formats.length ? 'CSV file · up to 10 MB' : 'Set up an import format to continue'}</small></span>
          <input type="file" accept=".csv,text/csv" onChange={onFile} disabled={busy || formats.length === 0} aria-label="Choose CSV file" />
        </label>
      </div>
      {source && mapping && error && <fieldset className="mapping-controls" disabled={busy}>
        <p className="muted small">Column mapping for {source.filename}. Changes apply to this import only.</p>
        <label>Format <select value={mapping.name} onChange={(e) => { const format = formats.find((f) => f.name === e.target.value); if (format) chooseFormat(format, source.text); }}>{formats.map((f, i) => <option key={`${f.name}-${i}`} value={f.name}>{f.name}</option>)}</select></label>
        {(['dateColumn', 'amountColumn', 'descriptionColumn', 'referenceColumn'] as const).map((field) => <label key={field}>{field === 'dateColumn' ? 'Date' : field === 'amountColumn' ? 'Amount' : field === 'descriptionColumn' ? 'Description' : 'Reference'} <select value={mapping[field] ?? ''} onChange={(e) => { setMapping({ ...mapping, [field]: e.target.value || undefined }); }}><option value="">Select column</option>{headers.map((h, i) => <option key={`${h}-${i}`} value={h}>{h}</option>)}</select></label>)}
        <button type="button" disabled={busy} onClick={() => void runImport(source.text, source.filename, mapping)}>Import with this mapping</button>
      </fieldset>}
      {error && <p className="error" role="alert">{error}</p>}
      {rowErrors.length > 0 && <ul className="errors">{rowErrors.slice(0, 20).map((r, i) => <li key={i}>{r}</li>)}</ul>}
      {done && <p className="ok">{done}</p>}
    </section>
  );
}
