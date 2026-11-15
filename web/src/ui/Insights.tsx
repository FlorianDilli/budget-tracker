import { Fragment, useMemo } from 'react';
import { useSession } from '../state/session';
import { analyzeMonth } from '../domain/analysis';
import { asOfForMonth, totalMoney } from '../domain/totals';
import { currentMonth, monthLabel, monthOf } from '../domain/dates';
import { sumCents, centsToDecimal, type Cents } from '../domain/money';
import { Card, Money, PreviewNotice, currencyOf, dataMonths } from './common';

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

  // Chart starts at the first month with transactions, not where the budget plan starts.
  const firstTx = rows.findIndex((r) => r.hasTx);
  const chartRows = firstTx >= 0 ? rows.slice(firstTx) : rows;
  // The monthly report below the plot starts at the same month as the plot.
  const reportRows = chartRows;
  const withData = reportRows.filter((r) => r.hasData);
  const avg = (key: 'budget' | 'spend' | 'left') => {
    if (!withData.length) return 0;
    return Math.round(sumCents(withData.map((r) => r[key])) / withData.length);
  };
  const round = settings.roundAmounts;

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-heading">
          <h1>Insights</h1>
          <p>See how your total money, budgets and spending develop over time.</p>
        </div>
      </header>
      <PreviewNotice isSample={isSample} />

      <Card title="Total money over time" wide>
        <TotalChart rows={chartRows.filter((r) => r.total !== 0 || r.hasData)} currency={cur} round={round} />
        <p className="muted small">Each point shows your balance on day {settings.totalMoneyAsOfDay} of the month{settings.totalMoneyAsOfDay === 31 ? ' (the last day in shorter months)' : ''}.</p>
      </Card>

      <Card title="Months at a glance" wide>
        {reportRows.length === 0 ? <p className="muted">No months to show yet.</p> : (
          <table className="tx-table">
            <thead>
              <tr><th>Month</th><th className="num">Budget</th><th className="num">Non recurring</th><th className="num">Left</th><th className="num">Total money</th></tr>
            </thead>
            <tbody>
              {reportRows.map((r, i) => {
                const year = r.ym.slice(0, 4);
                const newYear = i === 0 || reportRows[i - 1].ym.slice(0, 4) !== year;
                return (
                  <Fragment key={r.ym}>
                    {newYear && (
                      <tr className="year-row"><td colSpan={5}>{year}</td></tr>
                    )}
                    <tr className={r.hasData ? '' : 'muted'}>
                      <td>{monthLabel(r.ym)}</td>
                      <td className="num"><Money cents={r.budget} currency={cur} /></td>
                      <td className="num"><Money cents={r.spend} currency={cur} /></td>
                      <td className="num"><Money cents={r.left} currency={cur} /></td>
                      <td className="num"><Money cents={r.total} currency={cur} /></td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
            {withData.length > 0 && (
              <tfoot>
                <tr>
                  <td>Average</td>
                  <td className="num">{centsToDecimal(avg('budget'), round)} {cur}</td>
                  <td className="num">{centsToDecimal(avg('spend'), round)} {cur}</td>
                  <td className="num">{centsToDecimal(avg('left'), round)} {cur}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </Card>
    </div>
  );
}

function TotalChart({ rows, currency, round }: { rows: Row[]; currency: string; round?: boolean }) {
  if (rows.length < 2) return <p className="muted">Need at least two months to draw the chart.</p>;
  const W = 640;
  const H = 260;
  const pad = 72;
  const padTop = 28;
  const padBottom = 64; // room for rotated x labels
  const vals = rows.map((r) => r.total);
  const min = Math.min(...vals, 0);
  const max = Math.max(...vals, 0);
  const span = max - min || 1;
  const plotW = W - pad * 2;
  const plotH = H - padTop - padBottom;
  const x = (i: number) => pad + (i * plotW) / (rows.length - 1);
  const y = (v: number) => H - padBottom - ((v - min) / span) * plotH;
  const points = rows.map((r, i) => `${x(i).toFixed(1)},${y(r.total).toFixed(1)}`).join(' ');
  // Thinning: every shown label keeps ~48px of horizontal room; extra months
  // are skipped instead of overlapping. Rotated -45° labels stay readable.
  const maxLabels = Math.max(2, Math.floor(plotW / 48));
  const step = Math.max(1, Math.ceil(rows.length / maxLabels));
  const showLabel = (i: number) => i === 0 || i === rows.length - 1 || i % step === 0;
  const labelY = H - padBottom + 14;
  // Horizontal gridlines with nice value ticks so large values are easy to estimate.
  const niceStep = (raw: number) => {
    const magnitude = 10 ** Math.floor(Math.log10(Math.abs(raw)));
    const normalized = raw / magnitude;
    const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
    return nice * magnitude;
  };
  const tickStep = niceStep(span / 4);
  const ticks: number[] = [];
  if (tickStep > 0) {
    for (let t = Math.ceil(min / tickStep) * tickStep; t <= max; t += tickStep) {
      ticks.push(Math.round(t));
    }
  }
  if (ticks.length === 0) ticks.push(min, max);
  const maxVal = Math.max(...vals);
  const minVal = Math.min(...vals);
  const maxIdx = vals.indexOf(maxVal);
  const minIdx = vals.indexOf(minVal);
  const pointAnchor = (i: number) => (i === 0 ? 'start' : i === rows.length - 1 ? 'end' : 'middle');
  const pointDx = (i: number) => (i === 0 ? 6 : i === rows.length - 1 ? -6 : 0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`Total money from ${monthOf(rows[0].ym)} to ${monthOf(rows[rows.length - 1].ym)}`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad} x2={W - pad} y1={y(t)} y2={y(t)} className={t === 0 ? 'axis' : 'grid'} />
          <text x={4} y={y(t) + 4} className="axis-label">{centsToDecimal(t, round)} {currency}</text>
        </g>
      ))}
      {ticks.every((t) => t !== 0) && <line x1={pad} x2={W - pad} y1={y(0)} y2={y(0)} className="axis" />}
      <polyline points={points} className="series" fill="none" />
      {rows.map((r, i) => (
        <g key={r.ym}>
          <circle cx={x(i)} cy={y(r.total)} r={3} className={i === maxIdx || i === minIdx ? 'extremum' : undefined} />
          {showLabel(i) && (
            <text x={x(i)} y={labelY} textAnchor="end" transform={`rotate(-45 ${x(i)} ${labelY})`}>{r.ym}</text>
          )}
        </g>
      ))}
      <text x={x(maxIdx) + pointDx(maxIdx)} y={y(maxVal) - 10} textAnchor={pointAnchor(maxIdx)} className="point-label">{centsToDecimal(maxVal, round)} {currency}</text>
      {minIdx !== maxIdx && (
        <text x={x(minIdx) + pointDx(minIdx)} y={y(minVal) + 20} textAnchor={pointAnchor(minIdx)} className="point-label">{centsToDecimal(minVal, round)} {currency}</text>
      )}
    </svg>
  );
}
