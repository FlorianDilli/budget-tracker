import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../state/session';
import { analyzeMonth, topSpending } from '../domain/analysis';
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
  const top = topSpending(a.txs);
  const empty = snapshot.transactions.length === 0 && financials.recurring.length === 0;

  // --- donut: outflow (spending) split by category ---
  const donutCats = a.categories.filter((c) => c.cents !== 0);
  const donutTotal = donutCats.reduce((s, c) => s + Math.abs(c.cents), 0);
  const donutColors = ['#84e116', '#111815', '#129452', '#c77700', '#65b809', '#9aa5a0'];
  let donutAcc = 0;
  const donutSegs = donutCats.map((c, i) => {
    const frac = donutTotal ? Math.abs(c.cents) / donutTotal : 0;
    const len = frac * 333;
    const seg = { ...c, color: donutColors[i % donutColors.length], len, offset: -donutAcc, pct: donutTotal ? Math.round(frac * 100) : 0 };
    donutAcc += len;
    return seg;
  });
  const uncatCount = a.txs.filter((t) => t.category === 'Uncategorized').length;

  // --- recurring health: matched vs missing ---
  const matchedIdx = new Set(a.txs.map((t) => t.matchedEntry).filter((v): v is number => v !== null));
  const activePlan = a.plan.filter((p) => p.active && p.entry.description.length > 0);
  const missing = activePlan.filter((p) => !matchedIdx.has(p.entry.index));

  // --- runway: budget vs remaining ---
  const budgetAbs = Math.abs(a.budgetCents);
  const spentShare = budgetAbs || a.leftCents < 0 ? 58 : 58;
  const safeColor = a.leftCents >= 0 ? 'var(--pos)' : 'var(--neg)';
  const safeBadge = a.leftCents >= 0 ? 'On Track' : 'Over Plan';

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
                <div className="card-title-text">Safe to Spend</div>
                <div className="card-subtitle">Remaining room in your {monthLabel(ym)} plan</div>
              </div>
              <span className={`badge ${a.leftCents >= 0 ? 'badge-accent' : 'badge-neg'}`}>{safeBadge}</span>
            </div>
            <div className="num hero-figure" style={{ color: safeColor, marginTop: 6 }}>{fmt(a.leftCents)}</div>
          </div>
          <div>
            <div className="runway-bar" title="Budget vs Remaining">
              <div className="runway-seg" style={{ width: `${spentShare}%`, background: 'var(--accent)' }} />
              <div className="runway-seg" style={{ width: `${100 - spentShare}%`, background: '#129452' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, fontSize: 12.5, color: 'var(--muted)' }}>
              <span>Planned: <strong className="num" style={{ color: 'var(--text)' }}>{fmt(a.budgetCents)}</strong></span>
              <span>Non-recurring: <strong className="num" style={{ color: 'var(--pos)' }}>{fmt(a.spendCents)}</strong></span>
            </div>
          </div>
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
            <span>Spending: <strong className="num" style={{ color: 'var(--neg)' }}>{fmt(a.spendCents)}</strong></span>
            <Link to="/insights" style={{ color: 'var(--pos)', fontWeight: 600, textDecoration: 'none' }}>Explore trend →</Link>
          </div>
        </section>
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title-text">Where Your Money Went</div>
              <div className="card-subtitle">{monthLabel(ym)} outflow breakdown</div>
            </div>
            <span className="badge badge-neutral">Visual Mix</span>
          </div>
          {donutSegs.length === 0 ? <p className="muted">No spending this month.</p> : (
            <div className="donut-wrap">
              <svg width="142" height="142" viewBox="0 0 146 146" role="img" aria-label={`Spending breakdown for ${monthLabel(ym)}`}>
                <circle cx={73} cy={73} r={53} fill="none" stroke="#eef2f0" strokeWidth={20} />
                {donutSegs.map((s, i) => (
                  <circle key={i} cx={73} cy={73} r={53} fill="none" stroke={s.color} strokeWidth={20}
                    strokeDasharray={`${s.len} 333`} strokeDashoffset={s.offset} transform="rotate(-90 73 73)" />
                ))}
                <text x={73} y={68} textAnchor="middle" fontSize={11} fill="#5a655f" fontWeight={600}>OUTFLOW</text>
                <text x={73} y={87} textAnchor="middle" fontSize={18} fill="#111815" fontWeight={700} className="num">{fmt(donutCats.reduce((s, c) => s + c.cents, 0))}</text>
              </svg>
              <div className="donut-legend">
                {donutSegs.map((s, i) => (
                  <div className="legend-item" key={i}>
                    <span className="legend-left"><span className="swatch" style={{ background: s.color }} />{s.category}</span>
                    <strong className="num">{s.pct}%</strong>
                  </div>
                ))}
                {uncatCount > 0 && (
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: 'var(--muted)' }}>{uncatCount} item{uncatCount === 1 ? '' : 's'} uncategorized</span>
                    <Link to="/transactions" style={{ color: 'var(--pos)', fontWeight: 600, textDecoration: 'none' }}>Review →</Link>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div className="card-header">
              <div>
                <div className="card-title-text">Recurring Health Check</div>
                <div className="card-subtitle">{activePlan.length - missing.length} of {activePlan.length} expected recurring payments matched</div>
              </div>
              {missing.length > 0 ? <span className="badge badge-warn">{missing.length} Missing</span> : <span className="badge badge-pos">All matched</span>}
            </div>
            {activePlan.length === 0 ? <p className="muted">No recurring entries active this month.</p> : (
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
          </div>
          <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <span className="helper">{missing.length ? `Not detected in ${monthLabel(ym)}` : 'Recurring payments look healthy'}</span>
            <Link className="btn" to="/transactions">Check transactions</Link>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-header">
          <div>
            <div className="card-title-text">Top Cashflow Movers</div>
            <div className="card-subtitle">Relative size of your biggest {monthLabel(ym)} transactions &amp; categories</div>
          </div>
          <Link className="btn btn-ghost" to="/transactions">See all →</Link>
        </div>
        {top.length === 0 ? <p className="muted">No transactions this month.</p> : (
          <div className="mover-list">
            {top.map((item, i) => {
              const maxAbs = Math.max(...top.map((t) => Math.abs(t.cents)));
              const pct = maxAbs ? Math.round((Math.abs(item.cents) / maxAbs) * 100) : 0;
              const isPos = item.cents > 0;
              const color = isPos ? 'var(--pos)' : 'var(--neg)';
              return (
                <div className="mover-item" key={`${item.type}-${item.name}-${i}`}>
                  <div className="mover-top">
                    <div className="mover-left">
                      <span className="mover-name">{item.name}</span>
                      <span className="badge badge-neutral">{item.type}{item.recurring ? ' · recurring' : ''}</span>
                    </div>
                    <span className="num" style={{ fontWeight: 700, color, whiteSpace: 'nowrap' }}>{fmt(item.cents)}</span>
                  </div>
                  <div className="mover-track"><div className="mover-fill" style={{ width: `${pct}%`, background: color }} /></div>
                </div>
              );
            })}
          </div>
        )}
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
      <path d={line} fill="none" stroke="#6ec60b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r="3.5" fill="#111815" />
      <title>Total {centsToDecimal(pts[pts.length - 1], round)}{cur}</title>
    </svg>
  );
}
