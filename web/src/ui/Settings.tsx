import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { SectionTabs, useSectionParam, type SectionItem } from './SectionTabs';
import { useSession, type SaveResult } from '../state/session';
import { DEFAULT_SETTINGS, parseSettings, serializeSettings, type Settings } from '../domain/config';
import { SAMPLE_SETTINGS } from '../domain/sample';
import { envelopeCreatedAt } from '../crypto/envelope';
import type { Snapshot } from '../domain/snapshot';
import { Card, InfoButton, PageHeader, PreviewNotice } from './common';

const TABS = ['general', 'data'] as const;
type Tab = (typeof TABS)[number];
const TAB_ITEMS = [
  { id: 'general', label: 'General' },
  { id: 'data', label: 'Data' },
] as const satisfies readonly SectionItem<Tab>[];

export function Settings() {
  const { isSample } = useSession();
  const [tab, setTab] = useSectionParam<Tab>('tab', TABS, 'general');
  return (
    <div className="page settings-page">
      <PageHeader title="Settings">
        <SectionTabs items={TAB_ITEMS} value={tab} onChange={setTab} label="Settings sections" />
      </PageHeader>
      <PreviewNotice isSample={isSample} />
      {tab === 'general' && <SettingsForm />}
      {tab === 'data' && <DataTab />}
    </div>
  );
}

// ------------------------------------------------------------------ General

function readSettings(text: string): Settings {
  const parsed = parseSettings(text);
  return parsed.ok ? parsed.value : DEFAULT_SETTINGS;
}

/** Messages that block saving. Import formats live on the Transactions screen and are not edited here. */
function formIssues(form: Settings): string[] {
  const messages: string[] = [];
  if (!form.currencySymbol.trim()) messages.push('Currency symbol is required.');
  return messages;
}

function SettingsForm() {
  const session = useSession();
  const { snapshot, isSample, drafts, setDraft, saveSettings } = session;
  const savedText = snapshot?.settingsToml ?? '';
  const originalText = isSample ? SAMPLE_SETTINGS : savedText;
  const baseText = drafts.settings ?? originalText;
  const [form, setForm] = useState<Settings>(() => readSettings(baseText));
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // The text this form last wrote to the session draft. Anything else means an outside change (discard, reload).
  const pushed = useRef(baseText);
  const initialText = useRef(serializeSettings(readSettings(baseText)));
  const saveSettingsRef = useRef(saveSettings);
  saveSettingsRef.current = saveSettings;

  useEffect(() => {
    if (baseText !== pushed.current) {
      pushed.current = baseText;
      setForm(readSettings(baseText));
    }
  }, [baseText]);

  const stored = parseSettings(savedText);
  const issues = formIssues(form);
  const valid = issues.length === 0;
  const text = serializeSettings(form);
  // Autosave as soon as the user changes anything (skip the untouched initial value).
  const dirty = text !== initialText.current && text !== serializeSettings(readSettings(savedText));

  const update = (next: Settings) => {
    setForm(next);
    setNotice(null);
    const nextText = serializeSettings(next);
    if (parseSettings(nextText).ok && next.currencySymbol.trim()) {
      pushed.current = nextText;
      setDraft('settings', nextText);
    }
  };

  // Auto-save: no manual Save/Apply button. Debounced so typing does not spam writes.
  useEffect(() => {
    if (!valid || !dirty) return;
    setSaving(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const result: SaveResult = await saveSettingsRef.current(text);
          setNotice(result.ok ? 'Saved automatically.' : 'Not saved. Fix the errors to save.');
        } catch {
          setNotice('Not saved. Fix the errors to save.');
        } finally {
          setSaving(false);
        }
      })();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [text, valid, dirty]);

  return (
    <div className="settings-form">
      {!stored.ok && !isSample && <p className="warn">The saved settings could not be read ({stored.issues[0]?.message}). Showing defaults until you save.</p>}
      {issues.length > 0 && (
        <div className="error-banner" role="alert">
          <ul>{issues.map((message) => <li key={message}>{message}</li>)}</ul>
        </div>
      )}

      <Card title="General">
        <div className="settings-grid">
          <label><span className="setting-label">Currency symbol<InfoButton label="Currency symbol" text="The symbol or code shown beside money amounts, such as €, EUR, or $." /></span>
            <input value={form.currencySymbol} maxLength={8} aria-invalid={!form.currencySymbol.trim()} onChange={(e) => update({ ...form, currencySymbol: e.target.value })} />
          </label>
          <label><span className="setting-label">On which day of the month is your total measured?<InfoButton label="On which day of the month is your total measured?" text="For every month we calculate your total money as of this day of the month. Example: with 15, the June total includes transactions up to 15 June; transactions from 16–30 June count towards July. With 31 (end of month), the total is measured on the last day of the month — in a 30-day month that is the 30th (today for the current month)." /></span>
            <input type="number" min={1} max={31} step={1} value={form.totalMoneyAsOfDay} aria-describedby="total-day-help" onChange={(e) => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 1 && n <= 31) update({ ...form, totalMoneyAsOfDay: n }); }} />
            <span className="muted small" id="total-day-help">Day {form.totalMoneyAsOfDay} of each month{form.totalMoneyAsOfDay === 31 ? ' (last day; in shorter months the last day counts)' : ''}: later transactions count towards the next month.</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={form.roundAmounts} onChange={(e) => update({ ...form, roundAmounts: e.target.checked })} />
            <span className="setting-label">Round amounts to whole units<InfoButton label="Round amounts" text="When enabled, displayed totals are rounded to whole currency units instead of showing cents." /></span>
          </label>
        </div>
      </Card>


      <footer className="settings-actions">
        <span className="muted" role="status">{saving ? 'Saving…' : notice ?? (valid ? 'Settings are saved automatically.' : 'Fix the errors above to save.')}</span>
      </footer>
    </div>
  );
}

// ------------------------------------------------------------------ Data

function DataTab() {
  const session = useSession();
  const { snapshot } = session;
  if (!snapshot) return null;
  return (
    <div className="settings-data">
      <section className="settings-group" aria-labelledby="backup-heading">
        <div className="settings-group-heading"><h2 id="backup-heading">Backups</h2><p>Keep a secure copy of your budget or restore one.</p></div>
        <div className="grid-2">
          <ExportCard />
          <RestoreCard localSavedAt={snapshot.savedAt} />
        </div>
      </section>
      <section className="settings-group" aria-labelledby="security-heading">
        <div className="settings-group-heading"><h2 id="security-heading">Security</h2><p>Manage access to your budget on this device.</p></div>
        <div className="grid-2">
          <PasswordCard />
          <Card title="Lock" info="Lock immediately to hide your budget. The app also locks automatically after 10 minutes without interaction.">
            <p className="muted">The app locks automatically after 10 minutes without interaction.</p>
            <button onClick={session.lock}>Lock now</button>
          </Card>
        </div>
      </section>
      <section className="settings-group settings-danger-group" aria-labelledby="data-management-heading">
        <div className="settings-group-heading"><h2 id="data-management-heading">Data management</h2><p>Clear your local data.</p></div>
        <div className="grid-2">
          <ResetCard />
        </div>
      </section>
    </div>
  );
}

function ExportCard() {
  const { exportBackup, setError } = useSession();
  const run = async () => {
    try {
      const { text, filename } = await exportBackup();
      // Prefer the File System Access API: it lets the user confirm the
      // suggested name (budget-backup-YYYY-MM-DD-HHMM.budget) and avoids
      // browsers that drop the download attribute and save the blob URL (a UUID).
      const picker = (window as unknown as { showSaveFilePicker?: (opts: unknown) => Promise<{ createWritable: () => Promise<{ write: (t: string) => Promise<void>; close: () => Promise<void> }> }> }).showSaveFilePicker;
      if (picker) {
        try {
          const handle = await picker({ suggestedName: filename, types: [{ description: 'Budget backup', accept: { 'application/json': ['.budget'] } }] });
          const writable = await handle.createWritable();
          await writable.write(text);
          await writable.close();
          return;
        } catch (e) {
          if (e instanceof DOMException && e.name === 'AbortError') return; // user cancelled
          // fall through to the anchor download below
        }
      }
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      // The anchor must be in the DOM, otherwise some browsers ignore the
      // download attribute and save the file under the blob URL (a UUID).
      // Revoking the object URL immediately can race the download, so
      // clean up only after the browser has had time to start it.
      document.body.appendChild(a);
      try {
        a.click();
      } finally {
        window.setTimeout(() => {
          a.remove();
          URL.revokeObjectURL(url);
        }, 10_000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <Card title="Export backup" info="Downloads an encrypted .budget backup that can be restored in this browser or another browser. It uses your current password.">
      <p className="muted">Encrypted .budget file with the same contents as local data. Original CSVs are not included.</p>
      <button className="primary" onClick={run}>Download .budget</button>
    </Card>
  );
}

function RestoreCard({ localSavedAt }: { localSavedAt: string }) {
  const { readBackup, restoreBackup } = useSession();
  const [text, setText] = useState<string | null>(null);
  const [pw, setPw] = useState('');
  const [backup, setBackup] = useState<Snapshot | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setText(await f.text());
    setBackup(null);
    setError(null);
    setDone(null);
  };

  const open = async (e: FormEvent) => {
    e.preventDefault();
    if (!text) return;
    setError(null);
    try {
      const snap = await readBackup(text, pw);
      setBackup(snap);
      setCreatedAt(envelopeCreatedAt(text));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPw('');
    }
  };

  const restore = async () => {
    if (!backup) return;
    if (!window.confirm('Replace all local data with this backup? This cannot be undone.')) return;
    try {
      await restoreBackup(backup);
      setDone('Backup restored.');
      setBackup(null);
      setText(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const olderWarning = backup !== null && !!backup.savedAt && !!localSavedAt && backup.savedAt < localSavedAt;

  return (
    <Card title="Restore backup" info="Choose an encrypted .budget backup and enter its password to inspect it. Your local data is only replaced after you confirm the restore.">
      <p className="muted">Replaces local data after confirmation. The file is verified before any local data changes.</p>
      <input type="file" accept=".budget,application/json" onChange={onFile} aria-label="Choose .budget file" />
      {text && !backup && (
        <form onSubmit={open} className="stack">
          <label>Password used for this backup
            <input type="password" autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} required />
          </label>
          <button type="submit">Open backup</button>
        </form>
      )}
      {backup && (
        <div className="stack">
          <p>Backup created: <strong>{createdAt ?? 'unknown'}</strong><br />Backup data saved: <strong>{backup.savedAt || 'unknown'}</strong><br />Local data saved: <strong>{localSavedAt || 'never'}</strong></p>
          {olderWarning && <p className="warn">This backup is older than the local data. Restoring will discard newer changes.</p>}
          <button className="danger" onClick={restore}>Replace local data with backup</button>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {done && <p className="ok">{done}</p>}
    </Card>
  );
}

function PasswordCard() {
  const { changePassword } = useSession();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== confirm) return setMsg({ ok: false, text: 'New passwords do not match' });
    try {
      await changePassword(cur, next);
      setMsg({ ok: true, text: 'Password changed.' });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    }
    setCur(''); setNext(''); setConfirm('');
  };
  return (
    <Card title="Change password" info="Enter your current password, then choose and confirm any non-empty new password. Your encrypted data is re-encrypted with it.">
      <form onSubmit={submit} className="stack">
        <input type="password" placeholder="Current password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required />
        <input type="password" placeholder="New password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
        <input type="password" placeholder="Confirm new password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        <button type="submit">Change password</button>
      </form>
      {msg && <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.text}</p>}
    </Card>
  );
}

function ResetCard() {
  const { resetAll } = useSession();
  const [word, setWord] = useState('');
  return (
    <Card title="Reset everything" info="Permanently deletes all encrypted local data in this browser. Download a backup first if you want to keep your budget.">
      <p className="warn">Deletes all encrypted local data in this browser. Download a backup first.</p>
      <div className="reset-controls">
        <input value={word} onChange={(e) => setWord(e.target.value)} placeholder='Type "RESET" to confirm' aria-label="Reset confirmation" />
        <button className="danger" disabled={word !== 'RESET'} onClick={() => void resetAll()}>Reset all data</button>
      </div>
    </Card>
  );
}
