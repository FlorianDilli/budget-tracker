import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../state/session';
import { analyzeMonth } from '../domain/analysis';
import { asOfForMonth, totalMoney } from '../domain/totals';
import type { YearMonth } from '../domain/dates';
import { monthLabel, shortDateLabel } from '../domain/dates';
import { centsToDecimal } from '../domain/money';
import { MonthSelect, PageHeader, PreviewNotice, currencyOf, dataMonths, lastDataMonth } from './common';

export function Overview() {
  const { snapshot, settings, financials, isSample } = useSession();
  const now = useMemo(() => new Date(), []);
  const months = useMemo(() => (snapshot ? dataMonths(snapshot, financials, now) : []), [snapshot, financials, now]);
  const initialMonth = useMemo<YearMonth>(() => (snapshot ? lastDataMonth(snapshot, now) : ''), [snapshot, now]);
  const [ym, setYm] = useState<YearMonth>(() => initialMonth);
  const userPickedMonth = useRef(false);
  useEffect(() => {
    if (!userPickedMonth.current && snapshot && initialMonth) setYm(initialMonth);
  }, [snapshot, initialMonth]);
  if (!snapshot) return null;
  const cur = currencyOf(settings);
  const round = settings.roundAmounts;
  const fmt = (cents: number) => `${centsToDecimal(cents, round)}${cur}`;

  const a = analyzeMonth(financials, snapshot.transactions, ym);
  const total = totalMoney(settings, financials, snapshot.transactions, asOfForMonth(ym, settings, now));
  const empty = snapshot.transactions.length === 0 && financials.recurring.length === 0;

  // --- verification: matched vs missing (only description-bearing entries) ---
  const matchedIdx = new Set(a.txs.map((t) => t.matchedEntry).filter((v): v is number => v !== null));
  const activePlan = a.plan.filter((p) => p.active && p.entry.description.length > 0);
  const missing = activePlan.filter((p) => !matchedIdx.has(p.entry.index));

  return (
    <div className="page">
      <PageHeader title="Overview" titleControl={<MonthSelect months={months} value={ym} onChange={(m) => { userPickedMonth.current = true; setYm(m); }} label="Month" />} />
      <PreviewNotice isSample={isSample} />
      {empty && <p className="hint">No data yet. Add recurring entries in Budget and import a CSV in Transactions.</p>}

      <div className="grid-2">
        <section className="card card-hero" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div className="card-header" style={{ marginBottom: 8 }}>
              <div>
                <div className="card-title-text">Planned (Plan-Net)</div>
                <div className="card-subtitle">Plan for {monthLabel(ym)} — sum of recurring entries only</div>
              </div>
              <span className="badge badge-neutral">Plan only</span>
            </div>
            <div className="num hero-figure" style={{ marginTop: 6 }}>{fmt(a.budgetCents)}</div>
          </div>
          <p className="muted small" style={{ marginTop: 12 }}>Individual bookings never change this number. Verification (below) is informational only.</p>
        </section>

        <section className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div className="card-header" style={{ marginBottom: 8 }}>
            <div>
              <div className="card-title-text">Total Balance</div>
              <div className="card-subtitle">As of {shortDateLabel(total.asOf)}</div>
            </div>
          </div>
          <div className="balance-spark-row">
            <div className="num hero-figure">{fmt(total.totalCents)}</div>
            <Sparkline snapshot={snapshot} financials={financials} settings={settings} now={now} cur={cur} round={round} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, fontSize: 12.5, color: 'var(--muted)', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <span>Account balance over time</span>
            <Link to="/insights" style={{ color: 'var(--pos)', fontWeight: 600, textDecoration: 'none' }}>Explore trend →</Link>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-header">
          <div>
            <div className="card-title-text">Verification (Health Check)</div>
            <div className="card-subtitle">{activePlan.length - missing.length} of {activePlan.length} verifiable recurring payments matched in {monthLabel(ym)}</div>
          </div>
          {missing.length > 0 ? <span className="badge badge-warn">{missing.length} Missing</span> : <span className="badge badge-pos">All matched</span>}
        </div>
        {activePlan.length === 0 ? <p className="muted">No verifiable recurring entries (with description) active this month.</p> : (
          <div className="check-pills">
            {activePlan.map((p) => {
              const ok = matchedIdx.has(p.entry.index);
              return <span key={p.entry.index} className={`check-pill${ok ? '' : ' missing'}`}>{ok ? '✓' : '!'} {p.entry.description}</span>;
            })}
          </div>
        )}
        {a.alerts.length > 0 && (
          <ul className="alerts" style={{ marginTop: 14 }}>{a.alerts.map((m, i) => <li key={i}>{m}</li>)}</ul>
        )}
        <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <span className="helper">{missing.length ? `Not detected in ${monthLabel(ym)}` : 'Recurring payments look healthy'}</span>
          <Link className="btn" to="/transactions">Check transactions</Link>
        </div>
      </section>
    </div>
  );
}

/** 6-month balance sparkline (same totals math as Insights, last 6 data months). */
function Sparkline({ snapshot, financials, settings, now, cur, round }: { snapshot: import('../domain/snapshot').Snapshot; financials: import('../domain/config').Financials; settings: import('../domain/config').Settings; now: Date; cur: string; round?: boolean }) {
  const pts = useMemo(() => {
    const months = dataMonths(snapshot, financials, now).slice(-6);
    return months.map((m) => totalMoney(settings, financials, snapshot.transactions, asOfForMonth(m, settings, now)).totalCents);
  }, [snapshot, financials, settings, now]);
  if (pts.length < 2) return null;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const W = 160, H = 54, pad = 4;
  const coords = pts.map((v, i) => {
    const x = pad + (i * (W - pad * 2)) / (pts.length - 1);
    const y = H - pad - ((v - min) / span) * (H - pad * 2);
    return { x, y };
  });
  const line = coords.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const last = coords[coords.length - 1];
  return (
    <svg width={150} height={50} viewBox={`0 0 ${W} ${H}`} aria-label="6 month balance sparkline" role="img">
      <defs><linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#84e116" stopOpacity="0.35" /><stop offset="100%" stopColor="#84e116" stopOpacity="0" /></linearGradient></defs>
      <path d={`${line} L${last.x},${H} L${coords[0].x},${H} Z`} fill="url(#sparkGrad)" />
      <path d={line} fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: 'var(--accent)' }} />
      <circle cx={last.x} cy={last.y} r="3.5" style={{ fill: 'var(--on-dark)' }} />
      <title>Total {centsToDecimal(pts[pts.length - 1], round)}{cur}</title>
    </svg>
  );
}
