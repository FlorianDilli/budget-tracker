import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { parseFinancials } from '../domain/config';
import { SAMPLE_FINANCIALS } from '../domain/sample';
import { useSession, type SaveResult } from '../state/session';
import { BudgetInspector } from './BudgetInspector';
import { TomlEditor, type TomlEditorHandle } from './TomlEditor';
import { SectionTabs, useSectionParam, type SectionItem } from './SectionTabs';
import { PageHeader, PreviewNotice } from './common';
import './budget-studio.css';

type View = 'editor' | 'split' | 'budget';
const VIEWS = ['editor', 'split', 'budget'] as const;
const VIEW_ITEMS = [
  { id: 'editor', label: 'Editor' },
  { id: 'split', label: 'Split' },
  { id: 'budget', label: 'Visual Budget' },
] as const satisfies readonly SectionItem<View>[];

export function BudgetPage() {
  const session = useSession();
  const { snapshot, financials, drafts, isSample } = session;
  // Legacy budget always opens in Split so both the TOML editor and the
  // Sankey/visual budget are present. On narrow screens the panels stack
  // (see budget-studio.css) instead of hiding one.
  const [defaultView] = useState<View>('split');
  const [view, setView] = useSectionParam<View>('view', VIEWS, defaultView);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [legacyDraft] = useState(() => {
    try { return localStorage.getItem('moonli_toml_content'); } catch { return null; }
  });
  const [jump, setJump] = useState<{ line: number } | null>(null);
  const editor = useRef<TomlEditorHandle>(null);
  const draft = drafts.financials ?? (isSample ? SAMPLE_FINANCIALS : snapshot?.financialsToml ?? '');
  const parsed = useMemo(() => parseFinancials(draft), [draft]);
  const dirty = draft !== (snapshot?.financialsToml ?? '');
  const display = parsed.ok ? parsed.value : financials;
  const issue = parsed.ok ? null : parsed.issues[0];
  const saveFinancialsRef = useRef(session.saveFinancials);
  saveFinancialsRef.current = session.saveFinancials;
  // The draft text when this page first rendered. Autosave only kicks in
  // after the user actually changes the draft, so the untouched sample
  // (or saved text) is never written back without an edit.
  const initialDraft = useRef(draft);

  useEffect(() => { if (jump && view !== 'budget') editor.current?.jumpToLine(jump.line); }, [jump, view]);
  if (!snapshot) return null;

  // Autosave: no manual Save button. Debounced so typing does not spam writes.
  useEffect(() => {
    if (!dirty || !parsed.ok || draft === initialDraft.current) return;
    setSaving(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const result: SaveResult = await saveFinancialsRef.current(draft);
          setNotice(result.ok ? 'Saved automatically.' : 'Not saved. Fix the errors first.');
        } catch (error) {
          setNotice(`Not saved: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
          setSaving(false);
        }
      })();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [draft, dirty, parsed.ok]);

  const load = async (file: File) => {
    try {
      session.setDraft('financials', await file.text());
      setNotice(`Loaded ${file.name} as an unsaved draft.`);
    } catch {
      setNotice('Could not read the file.');
    }
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) void load(file);
  };
  const discard = () => { session.setDraft('financials', isSample ? SAMPLE_FINANCIALS : snapshot.financialsToml); setNotice('Draft reset to saved budget.'); };
  const actions = (
    <>
      <span className="muted small" role="status">{saving ? 'Saving…' : notice || (dirty && !parsed.ok ? 'Fix the errors above to save.' : 'Budget is saved automatically.')}</span>
      <button type="button" disabled={!dirty || saving} onClick={discard}>Discard changes</button>
    </>
  );
  return <div className={`page budget-page${view === 'editor' ? ' is-editor' : ''}${view === 'budget' ? ' is-budget' : ''}`}>
    <PageHeader title="Budget">
      <SectionTabs items={VIEW_ITEMS} value={view} onChange={setView} label="Budget view" />
    </PageHeader>
    <PreviewNotice isSample={isSample} />
  <section className={`budget-studio${view === 'budget' ? ' is-budget' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={onDrop} aria-label="Budget studio">
    {(!parsed.ok || legacyDraft !== null) && <div className="studio-status" role="status">{!parsed.ok && 'Invalid draft. Showing the saved budget.'}<span className="studio-status-actions">{legacyDraft !== null && <button type="button" onClick={() => { if (window.confirm('Replace this draft with the previous standalone Budget draft? It remains stored separately in plaintext until you remove it from browser storage.')) { session.setDraft('financials', legacyDraft); setView('editor'); setNotice('Previous standalone draft loaded; it will be saved automatically.'); } }}>Recover old draft</button>}</span></div>}
    <div className={`studio-panels studio-${view}`}>
      <div className="studio-editor" hidden={view === 'budget'}>
        <div className="studio-editor-actions" role="group" aria-label="Editor actions">
          {actions}
          <button type="button" onClick={() => session.setDraft('financials', '')}>Clear</button>
          <button type="button" onClick={() => void navigator.clipboard?.writeText(draft)}>Copy</button>
          <button type="button" onClick={() => editor.current?.undo()}>Undo</button>
          <button type="button" onClick={() => editor.current?.redo()}>Redo</button>
          <button type="button" onClick={() => editor.current?.search()}>Search</button>
        </div>
        <TomlEditor ref={editor} value={draft} onChange={(text) => { session.setDraft('financials', text); setNotice(''); }} ariaLabel="financials.toml editor" />
        {issue && <div className="error-banner" role="alert"><span>{issue.line ? `Line ${issue.line}: ` : ''}{issue.message}</span>{issue.line > 0 && <button type="button" onClick={() => editor.current?.jumpToLine(issue.line)}>Jump to line</button>}</div>}
      </div>
      <div className="studio-inspector" hidden={view === 'editor'}>
        {view === 'budget' && (
          <div className="studio-budget-actions" role="group" aria-label="Budget actions">
            {actions}
          </div>
        )}
        <BudgetInspector financials={display} onSourceLineClick={parsed.ok ? (line) => { setView(view === 'split' ? 'split' : 'editor'); setJump({ line }); } : undefined} />
      </div>
    </div>
  </section>
  </div>;
}
