import { useMemo, useRef, useState } from 'react';
import { useSession } from '../state/session';
import { analyzeMonth } from '../domain/analysis';
import { asOfForMonth, totalMoney } from '../domain/totals';
import { currentMonth, monthLabel, monthOf } from '../domain/dates';
import { sumCents, centsToDecimal, type Cents } from '../domain/money';
import { PageHeader, PreviewNotice, currencyOf, dataMonths } from './common';

interface Row {
  ym: string;
  budget: Cents;
  spend: Cents;
  left: Cents;
  total: Cents;
  hasData: boolean;
  hasTx: boolean;
}

export function Insights() {
  const { snapshot, settings, financials, isSample } = useSession();
  const now = useMemo(() => new Date(), []);
  const [mode, setMode] = useState<'rhythm' | 'table'>('rhythm');
  if (!snapshot) return null;
  const cur = currencyOf(settings);
  const cutoff = currentMonth(now);

  const rows: Row[] = useMemo(() => {
    const months = dataMonths(snapshot, financials, now).filter((m) => m <= cutoff);
    return months.map((ym) => {
      const a = analyzeMonth(financials, snapshot.transactions, ym);
      const t = totalMoney(settings, financials, snapshot.transactions, asOfForMonth(ym, settings, now));
      const hasData = a.txs.length > 0 || a.plan.some((p) => p.active);
      return { ym, budget: a.budgetCents, spend: a.spendCents, left: a.leftCents, total: t.totalCents, hasData, hasTx: a.txs.length > 0 };
    });
  }, [snapshot, settings, financials, now, cutoff]);

  const firstTx = rows.findIndex((r) => r.hasTx);
  const chartRows = (firstTx >= 0 ? rows.slice(firstTx) : rows).filter((r) => r.total !== 0 || r.hasData);
  const reportRows = chartRows;
  const withData = reportRows.filter((r) => r.hasData);
  const avg = (key: 'budget' | 'spend' | 'left') => {
    if (!withData.length) return 0;
    return Math.round(sumCents(withData.map((r) => r[key])) / withData.length);
  };
  const round = settings.roundAmounts;
  const fmt = (cents: Cents) => `${centsToDecimal(cents, round)}${cur}`;

  const peak = reportRows.length ? Math.max(...reportRows.map((r) => r.total)) : 0;
  const peakRow = reportRows.find((r) => r.total === peak);
  const currentRow = reportRows[reportRows.length - 1];
  const surplus = reportRows.filter((r) => r.left >= 0).length;
  const deficit = reportRows.filter((r) => r.left < 0).length;

  return (
    <div className="page">
      <PageHeader title="Insights" />
      <PreviewNotice isSample={isSample} />

      <section className="card">
        <div className="card-header" style={{ flexWrap: 'wrap' }}>
          <div>
            <div className="card-title-text">Your Money Journey</div>
            <div className="card-subtitle">Tap or hover any point to see balance and net outcome</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {peakRow && <span className="badge badge-pos">Peak {fmt(peak)} ({monthLabel(peakRow.ym)})</span>}
            {currentRow && <span className="badge badge-neutral">Current {fmt(currentRow.total)}</span>}
          </div>
        </div>
        <TotalChart rows={chartRows} currency={cur} round={round} />
        <p className="muted small">Each point shows your balance on day {settings.totalMoneyAsOfDay} of the month{settings.totalMoneyAsOfDay === 31 ? ' (the last day in shorter months)' : ''}.</p>
      </section>

      <section className="card">
        <div className="card-header" style={{ flexWrap: 'wrap' }}>
          <div>
            <div className="card-title-text">Monthly Rhythm (Surplus vs. Heavy Spend)</div>
            <div className="card-subtitle">See immediately which months grew savings vs. heavy one-off expenses</div>
          </div>
          <div className="segmented">
            <button type="button" className={`seg-btn${mode === 'rhythm' ? ' active' : ''}`} onClick={() => setMode('rhythm')}>Visual Rhythm</button>
            <button type="button" className={`seg-btn${mode === 'table' ? ' active' : ''}`} onClick={() => setMode('table')}>Ledger Table</button>
          </div>
        </div>

        {mode === 'rhythm' && (
          <div>
            {reportRows.length === 0 ? <p className="muted">No months to show yet.</p> : (
              <RhythmGrid rows={reportRows} fmt={fmt} />
            )}
            {withData.length > 0 && (
              <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--muted)' }}>
                  <span><strong style={{ color: 'var(--pos)' }}>{surplus} Surplus months</strong> (avg {fmt(avg('left'))})</span>
                  <span><strong style={{ color: 'var(--neg)' }}>{deficit} Deficit months</strong></span>
                </div>
                <span className="badge badge-accent">{reportRows.length}-month report</span>
              </div>
            )}
          </div>
        )}

        {mode === 'table' && (
          <div className="table-wrap">
            {reportRows.length === 0 ? <p className="muted">No months to show yet.</p> : (
              <table className="ledger-table">
                <thead>
                  <tr><th>Month</th><th className="text-right">Budget</th><th className="text-right">Non-Rec</th><th className="text-right">Net</th><th className="text-right">Total</th></tr>
                </thead>
                <tbody>
                  {reportRows.map((r) => (
                    <tr key={r.ym} className={r.hasData ? '' : 'muted'}>
                      <td style={{ whiteSpace: 'nowrap' }}><strong>{monthLabel(r.ym)}</strong></td>
                      <td className="text-right num">{fmt(r.budget)}</td>
                      <td className="text-right num" style={{ color: r.spend >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{r.spend >= 0 ? '+' : ''}{fmt(r.spend)}</td>
                      <td className="text-right num" style={{ fontWeight: 700, color: r.left >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{r.left >= 0 ? '+' : ''}{fmt(r.left)}</td>
                      <td className="text-right num"><strong>{fmt(r.total)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function RhythmGrid({ rows, fmt }: { rows: Row[]; fmt: (c: Cents) => string }) {
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.left)));
  return (
    <div className="rhythm-grid">
      {rows.map((r) => {
        const isPos = r.left >= 0;
        const pct = Math.max(10, Math.round((Math.abs(r.left) / maxAbs) * 100));
        const col = isPos ? 'var(--pos)' : 'var(--neg)';
        return (
          <div key={r.ym} className={`rhythm-tile ${isPos ? 'surplus' : 'deficit'}`} title={`Budget: ${fmt(r.budget)} | One-off: ${fmt(r.spend)}`}>
            <div className="rhythm-top"><span>{monthLabel(r.ym)}</span><span>{isPos ? 'Surplus' : 'Deficit'}</span></div>
            <div className="rhythm-net num" style={{ color: col }}>{isPos ? '+' : ''}{fmt(r.left)}</div>
            <div className="rhythm-bar"><span style={{ width: `${pct}%`, background: col }} /></div>
          </div>
        );
      })}
    </div>
  );
}

function TotalChart({ rows, currency, round }: { rows: Row[]; currency: string; round?: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);

  if (rows.length < 2) return <p className="muted">Need at least two months to draw the chart.</p>;
  const W = 900, H = 265, padL = 54, padR = 24, padT = 24, padB = 36;
  const cw = W - padL - padR, ch = H - padT - padB;
  const vals = rows.map((r) => r.total);
  const minV = Math.min(...vals, 0);
  const maxV = Math.max(...vals, 0);
  const span = maxV - minV || 1;
  const x = (i: number) => padL + (i * cw) / (rows.length - 1);
  const y = (v: number) => padT + ch - ((v - minV) / span) * ch;
  const linePath = rows.map((r, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(r.total).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${x(rows.length - 1).toFixed(1)} ${padT + ch} L ${x(0).toFixed(1)} ${padT + ch} Z`;

  const niceStep = (raw: number) => {
    const magnitude = 10 ** Math.floor(Math.log10(Math.abs(raw)));
    const normalized = raw / magnitude;
    const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
    return nice * magnitude;
  };
  const tickStep = niceStep(span / 4);
  const ticks: number[] = [];
  if (tickStep > 0) for (let t = Math.ceil(minV / tickStep) * tickStep; t <= maxV; t += tickStep) ticks.push(Math.round(t));
  if (ticks.length === 0) ticks.push(minV, maxV);

  const maxLabels = Math.max(2, Math.floor(cw / 64));
  const step = Math.max(1, Math.ceil(rows.length / maxLabels));
  const showLabel = (i: number) => i === 0 || i === rows.length - 1 || i % step === 0;

  const showTip = (i: number) => {
    const r = rows[i];
    setTip({ x: x(i), y: y(r.total), text: `${monthLabel(r.ym)} · Total: ${centsToDecimal(r.total, round)}${currency} · Outcome: ${centsToDecimal(r.left, round)}${currency}` });
  };

  return (
    <div className="chart-container" ref={wrapRef} onMouseLeave={() => setTip(null)}>
      {tip && (
        <div className="chart-tooltip" ref={tipRef} style={{
          opacity: 1,
          left: Math.max(4, Math.min(W - 180, tip.x - 90)),
          top: Math.max(0, tip.y - 56),
        }}>{tip.text}</div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`Total money from ${monthOf(rows[0].ym)} to ${monthOf(rows[rows.length - 1].ym)}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <defs>
          <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#84e116" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#84e116" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className={t === 0 ? 'axis' : 'grid'} />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="axis-label" fontSize="11" style={{ fill: "var(--th-text)" }}>{centsToDecimal(t, round)}{currency}</text>
          </g>
        ))}
        <path d={areaPath} className="chart-area" />
        <path d={linePath} className="chart-line" />
        {rows.map((r, i) => (
          <g key={r.ym}>
            <circle cx={x(i)} cy={y(r.total)} r={6} className="chart-dot" onMouseEnter={() => showTip(i)} onClick={() => showTip(i)} />
            {showLabel(i) && <text x={x(i)} y={H - 10} textAnchor="middle" fontSize="11" style={{ fill: "var(--th-text)" }}>{r.ym}</text>}
          </g>
        ))}
      </svg>
    </div>
  );
}
