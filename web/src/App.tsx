import { useMemo, useState } from 'react';
import { Link, NavLink, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { SessionProvider, useSession } from './state/session';
import { SetupScreen, UnlockScreen } from './ui/Gate';
import { Overview } from './ui/Overview';
import { Transactions } from './ui/Transactions';
import { Insights } from './ui/Insights';
import { Settings } from './ui/Settings';
import { BudgetPage } from './ui/BudgetPage';
import { analyzeMonth } from './domain/analysis';
import { lastDataMonth } from './ui/common';

export function App() {
  return (
    <SessionProvider>
      <Gate />
    </SessionProvider>
  );
}

function Gate() {
  const { status } = useSession();
  if (status === 'loading') return <main className="gate"><p className="muted">Loading…</p></main>;
  if (status === 'setup') return <SetupScreen />;
  if (status === 'locked') return <UnlockScreen />;
  return <Shell />;
}

const NAV = [
  { to: '/', label: 'Overview', icon: 'overview' },
  { to: '/budget', label: 'Budget', icon: 'budget' },
  { to: '/insights', label: 'Insights', icon: 'insights' },
  { to: '/transactions', label: 'Transactions', icon: 'transactions' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
] as const;

function Shell() {
  const { lock, error, setError, snapshot, financials } = useSession();
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  // Sidebar badge: number of alerts in the most recent data month (as in the mock).
  const alertCount = useMemo(() => {
    if (!snapshot) return 0;
    const ym = lastDataMonth(snapshot, new Date());
    return analyzeMonth(financials, snapshot.transactions, ym).alerts.length;
  }, [snapshot, financials]);

  return (
    <div className={`shell app-shell${collapsed ? ' collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-head">
          <div className="brand">
            <span className="brand-icon"><img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" width={20} height={20} /></span>
            <span className="brand-name">Budget Tracker</span>
          </div>
          <button type="button" className="collapse-btn" onClick={() => setCollapsed((v) => !v)} title="Collapse or expand menu" aria-label="Toggle sidebar" aria-expanded={!collapsed}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
        </div>
        <nav className="nav-list" aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} title={n.label} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <NavIcon name={n.icon} />
              <span className="nav-label">{n.label}</span>
              {n.label === 'Overview' && alertCount > 0 && <span className="nav-badge">{alertCount}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="privacy-pill" title="Data is encrypted locally in your browser">
            <span className="dot-live" />
            <span className="privacy-text">Encrypted locally</span>
          </div>
        </div>
      </aside>

      <div className="main-wrap">
        <header className="topbar">
          <div className="topbar-row">
            <div className="topbar-left">
              <span className="mobile-brand-badge" aria-hidden="true">
                <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" width={16} height={16} />
              </span>
            </div>
            <div className="topbar-actions">
              <Link className="btn btn-primary" to="/transactions?tab=import"><span aria-hidden="true">+</span><span className="btn-label">Import CSV</span></Link>
              <button type="button" className="btn" onClick={lock} title="Lock app">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                <span className="btn-label">Lock</span>
              </button>
            </div>
          </div>
        </header>
        <main className="content">
          {error && (
            <p className="error" role="alert">
              {error} <button onClick={() => setError(null)}>Dismiss</button>
            </p>
          )}
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<Overview />} />
            <Route path="/budget" element={<BudgetPage />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `mobile-nav-btn${isActive ? ' active' : ''}`}>
            {n.label === 'Overview' && alertCount > 0 && <span className="mobile-dot-badge" aria-hidden="true" />}
            <NavIcon name={n.icon} iconClassName="mobile-nav-icon" />
            <span>{n.label === 'Transactions' ? 'Activity' : n.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function NavIcon({ name, iconClassName = 'nav-icon' }: { name: string; iconClassName?: string }) {
  return (
    <svg className={iconClassName} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {name === 'overview' && <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>}
      {name === 'transactions' && <><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="3.5" cy="6" r="1" /><circle cx="3.5" cy="12" r="1" /><circle cx="3.5" cy="18" r="1" /></>}
      {name === 'insights' && <><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></>}
      {name === 'budget' && <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8" /><path d="M8 17h8" /></>}
      {name === 'settings' && <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>}
    </svg>
  );
}
