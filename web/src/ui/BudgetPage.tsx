import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { parseFinancials, serializeFinancials, type Financials } from '../domain/config';
import { SAMPLE_FINANCIALS } from '../domain/sample';
import { useSession, type SaveResult } from '../state/session';
import { BudgetInspector } from './BudgetInspector';
import { BudgetForm } from './BudgetForm';
import { TomlEditor, type TomlEditorHandle } from './TomlEditor';
import { SectionTabs, useSectionParam, type SectionItem } from './SectionTabs';
import { PageHeader, PreviewNotice } from './common';
import './budget-studio.css';

type View = 'form' | 'budget' | 'toml';
const VIEWS = ['form', 'budget', 'toml'] as const;
const VIEW_ITEMS = [
  { id: 'form', label: 'Form' },
  { id: 'budget', label: 'Visual Budget' },
  { id: 'toml', label: 'TOML' },
] as const satisfies readonly SectionItem<View>[];

function readFinancials(text: string, fallback: Financials): Financials {
  const parsed = parseFinancials(text);
  return parsed.ok ? parsed.value : fallback;
}

export function BudgetPage() {
  const session = useSession();
  const { snapshot, financials, drafts, isSample } = session;
  const [view, setView] = useSectionParam<View>('view', VIEWS, 'form');
  const [notice, setNotice] = useState('');
  const [legacyDraft] = useState(() => {
    try { return localStorage.getItem('moonli_toml_content'); } catch { return null; }
  });
  const [jump, setJump] = useState<{ line: number } | null>(null);
  const editor = useRef<TomlEditorHandle>(null);
  const draft = drafts.financials ?? (isSample ? SAMPLE_FINANCIALS : snapshot?.financialsToml ?? '');
  const parsed = useMemo(() => parseFinancials(draft), [draft]);
  const issue = parsed.ok ? null : parsed.issues[0];
  const saveFinancialsRef = useRef(session.saveFinancials);
  saveFinancialsRef.current = session.saveFinancials;

  // The form is edited as structured fields; the TOML text is its storage
  // representation (serializeFinancials). Editing either side re-syncs the
  // other through the session draft.
  const [form, setForm] = useState<Financials>(() => readFinancials(draft, financials));
  const pushed = useRef(draft);
  const initialText = useRef(serializeFinancials(readFinancials(draft, financials)));
  useEffect(() => {
    if (draft !== pushed.current) {
      pushed.current = draft;
      const next = parseFinancials(draft);
      if (next.ok) setForm(next.value);
    }
  }, [draft]);

  const text = serializeFinancials(form);
  const formParsed = parseFinancials(text);
  const savedText = serializeFinancials(readFinancials(snapshot?.financialsToml ?? '', financials));
  const valid = parseFinancials(text).ok;
  const dirty = text !== initialText.current && text !== savedText;
  const display: Financials = valid && view !== 'toml' ? form : parsed.ok ? parsed.value : financials;

  useEffect(() => { if (jump && view === 'toml') editor.current?.jumpToLine(jump.line); }, [jump, view]);
  if (!snapshot) return null;

  // Autosave: no manual Save button. Debounced so typing does not spam writes.
  useEffect(() => {
    if (!dirty || !valid) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const result: SaveResult = await saveFinancialsRef.current(text);
          setNotice(result.ok ? '' : 'Not saved. Fix the errors first.');
        } catch (error) {
          setNotice(`Not saved: ${error instanceof Error ? error.message : String(error)}`);
        }
      })();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [text, dirty, valid]);

  const updateForm = (next: Financials) => {
    setForm(next);
    setNotice('');
    const nextText = serializeFinancials(next);
    if (parseFinancials(nextText).ok) {
      pushed.current = nextText;
      session.setDraft('financials', nextText);
    }
  };

  // Import an old financials.toml file: parse it and write the result
  // directly into the new form fields (via the serialized draft).
  const importTomlText = (tomlText: string, filename: string) => {
    const result = parseFinancials(tomlText);
    if (!result.ok) {
      setNotice(`Could not import "${filename}": ${result.issues[0]?.message ?? 'invalid TOML'}`);
      return;
    }
    updateForm(result.value);
    setView('form');
    setNotice(`Imported ${filename}: ${result.value.recurring.length} recurring entr${result.value.recurring.length === 1 ? 'y' : 'ies'} and ${result.value.cash.length} cash entr${result.value.cash.length === 1 ? 'y' : 'ies'} written into the form fields.`);
  };
  const load = async (file: File) => {
    try {
      importTomlText(await file.text(), file.name);
    } catch {
      setNotice('Could not read the file.');
    }
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) void load(file);
  };
  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void load(file);
  };

  return <div className={`page budget-page${view === 'toml' ? ' is-editor' : ''}${view === 'budget' ? ' is-budget' : ''}`}>
    <PageHeader title="Budget">
      <SectionTabs items={VIEW_ITEMS} value={view} onChange={setView} label="Budget view" />
    </PageHeader>
    <PreviewNotice isSample={isSample} />
    {notice && <p className="muted small" role="status">{notice}</p>}
    <section className={`budget-studio${view === 'budget' ? ' is-budget' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={onDrop} aria-label="Budget studio">
      {view !== 'budget' && (
        <div className="studio-budget-actions">
          <label className="import-toml">
            <span>Import old TOML file</span>
            <input type="file" accept=".toml,text/plain" onChange={onFile} aria-label="Import old TOML file" />
          </label>
          <span className="muted small">Imports a previous financials.toml and fills the form fields. Or drop it anywhere on this page.</span>
        </div>
      )}
      {(!parsed.ok || legacyDraft !== null) && <div className="studio-status" role="status">{!parsed.ok && 'Invalid draft. Showing the saved budget.'}<span className="studio-status-actions">{legacyDraft !== null && <button type="button" onClick={() => { if (window.confirm('Replace this draft with the previous standalone Budget draft? It remains stored separately in plaintext until you remove it from browser storage.')) { session.setDraft('financials', legacyDraft); setView('toml'); setNotice('Previous standalone draft loaded; it will be saved automatically.'); } }}>Recover old draft</button>}</span></div>}
      <div className={`studio-panels studio-${view}`}>
        {view === 'toml' && (
          <div className="studio-editor">
            <div className="studio-editor-actions" role="group" aria-label="Editor actions">
              <button type="button" onClick={() => session.setDraft('financials', '')}>Clear</button>
              <button type="button" onClick={() => void navigator.clipboard?.writeText(draft)}>Copy</button>
              <button type="button" onClick={() => editor.current?.undo()}>Undo</button>
              <button type="button" onClick={() => editor.current?.redo()}>Redo</button>
              <button type="button" onClick={() => editor.current?.search()}>Search</button>
            </div>
            <TomlEditor ref={editor} value={draft} onChange={(text) => { session.setDraft('financials', text); setNotice(''); }} ariaLabel="financials.toml editor" />
            {issue && <div className="error-banner" role="alert"><span>{issue.line ? `Line ${issue.line}: ` : ''}{issue.message}</span>{issue.line > 0 && <button type="button" onClick={() => editor.current?.jumpToLine(issue.line)}>Jump to line</button>}</div>}
          </div>
        )}
        {view === 'form' && (
          <div className="studio-form">
            <BudgetForm value={form} onChange={updateForm} />
            {!formParsed.ok && <div className="error-banner" role="alert"><span>{formParsed.issues[0]?.message}</span></div>}
          </div>
        )}
        <div className="studio-inspector" hidden={view === 'toml'}>
          <BudgetInspector financials={display} onSourceLineClick={parsed.ok ? (line) => { setView('toml'); setJump({ line }); } : undefined} />
        </div>
      </div>
    </section>
  </div>;
}
