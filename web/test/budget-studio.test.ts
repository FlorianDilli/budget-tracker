// @vitest-environment jsdom
import { act, createElement, forwardRef, useImperativeHandle, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { parseFinancials, serializeFinancials } from '../src/domain/config';

const mocks = vi.hoisted(() => ({ session: {} as Record<string, unknown>, jump: vi.fn() }));
vi.mock('../src/state/session', () => ({ useSession: () => mocks.session }));
vi.mock('../src/ui/TomlEditor', () => ({
  TomlEditor: forwardRef(function MockEditor(props: { value: string; onChange: (value: string) => void; ariaLabel: string }, ref) {
    useImperativeHandle(ref, () => ({ jumpToLine: mocks.jump, undo: vi.fn(), redo: vi.fn(), search: vi.fn() }));
    return createElement('textarea', { value: props.value, 'aria-label': props.ariaLabel, onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => props.onChange(event.target.value) });
  }),
}));
import { BudgetPage } from '../src/ui/BudgetPage';
import { TopbarHostContext } from '../src/ui/common';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const saved = '[[recurring_transactions]]\ndescription = "Saved rent"\namount = -100\n';
const draft = '# draft\n[[recurring_transactions]]\ndescription = "Draft salary"\namount = 250\n';
const invalid = '[[recurring_transactions]]\ndescription = "Broken"\n';

let container: HTMLDivElement;
let root: Root;
let saveFinancials: ReturnType<typeof vi.fn>;
let setDraft: ReturnType<typeof vi.fn>;

function parsed(text: string) {
  const result = parseFinancials(text);
  if (!result.ok) throw new Error('Invalid test fixture');
  return result.value;
}

async function render(initialDraft: string | null = null, isSample = false, settings: Record<string, unknown> = {}, titleHost?: HTMLElement) {
  function Harness() {
    const [savedText, setSavedText] = useState(saved);
    const [draftText, setDraftText] = useState(initialDraft);
    setDraft.mockImplementation((_kind: string, text: string) => setDraftText(text));
    saveFinancials.mockImplementation(async (text: string) => {
      setSavedText(text);
      return { ok: true };
    });
    mocks.session = {
      snapshot: { financialsToml: savedText }, financials: parsed(savedText),
      settings: { currencySymbol: 'USD', roundAmounts: false, ...settings },
      drafts: { financials: draftText, settings: null }, isSample, setDraft, saveFinancials,
    };
    const page = createElement('div', null, createElement(BudgetPage), createElement('output', { 'data-testid': 'shared' }, parsed(savedText).recurring[0]?.description));
    return createElement(MemoryRouter, null, titleHost ? createElement(TopbarHostContext.Provider, { value: { titleControl: titleHost, subnav: null } }, page) : page);
  }
  await act(async () => root.render(createElement(Harness)));
}

function button(text: string) {
  const result = Array.from(container.querySelectorAll('button')).find((element) => element.textContent?.trim() === text || element.getAttribute('aria-label') === text);
  if (!result) throw new Error(`Button not found: ${text}`);
  return result;
}

function input(label: string) {
  const el = Array.from(container.querySelectorAll('label')).find((l) => l.textContent?.includes(label));
  const found = el?.querySelector('input') as HTMLInputElement | undefined;
  if (!found) throw new Error(`Input not found: ${label}`);
  return found;
}

async function click(element: HTMLElement) {
  await act(async () => element.click());
}

async function typeInto(el: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
}

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  saveFinancials = vi.fn();
  setDraft = vi.fn();
  mocks.jump.mockReset();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('budget form (fields instead of TOML)', () => {
  it('renders saved entries as designed input fields', async () => {
    await render();
    expect(button('Form').getAttribute('aria-pressed')).toBe('true');
    expect(input('Description').value).toBe('Saved rent');
    expect(input('Purpose (Verwendungszweck)')).not.toBeNull();
    expect(input('Amount').value).toBe('-100.00');
    expect(container.querySelector('.budget-inspector')?.textContent).toContain('Saved rent');
    expect(container.querySelector('.studio-form')).not.toBeNull();
  });

  it('edits a field and autosaves the serialized TOML without a manual save button', async () => {
    vi.useFakeTimers();
    try {
      await render();
      await typeInto(input('Description'), 'New salary');
      expect(setDraft).toHaveBeenCalledWith('financials', expect.stringContaining('description = "New salary"'));
      expect(container.querySelector('.budget-inspector')?.textContent).toContain('New salary');
      expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Save')).toBe(false);
      await act(async () => { vi.advanceTimersByTime(800); });
      expect(saveFinancials).toHaveBeenCalled();
      const savedText = saveFinancials.mock.calls[0][0] as string;
      expect(parsed(savedText).recurring[0].description).toBe('New salary');
    } finally {
      vi.useRealTimers();
    }
  });

  it('adds and removes entries via the form', async () => {
    await render();
    await click(button('Add entry'));
    expect(container.querySelectorAll('.budget-entry')).toHaveLength(2);
    await click(button('Remove')),
      expect(container.querySelectorAll('.budget-entry')).toHaveLength(1);
  });

  it('imports an old TOML file straight into the form fields', async () => {
    await render();
    const toml = '[[recurring_transactions]]\ndescription = "Old rent"\npurpose = "Monthly rent"\namount = -850\nrecurrence_months = 1\n';
    const fileInput = container.querySelector<HTMLInputElement>('input[aria-label="Import old TOML file"]')!;
    const file = new File([toml], 'financials.toml', { type: 'text/plain' });
    Object.defineProperty(file, 'text', { value: async () => toml });
    Object.defineProperty(fileInput, 'files', { value: [file] });
    await act(async () => { fileInput.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(input('Description').value).toBe('Old rent');
    expect(input('Purpose (Verwendungszweck)').value).toBe('Monthly rent');
    expect(input('Amount').value).toBe('-850.00');
    expect(container.textContent).toContain('Imported financials.toml');
    // And the serialized draft round-trips back to the same values.
    expect(describe(serializeFinancials(parsed(toml)))).toBe('Old rent');
    function describe(_t: string) { return parsed(_t).recurring[0].description; }
  });

  it('rejects an invalid TOML import without changing the fields', async () => {
    await render();
    const bad = '[[recurring_transactions]]\ndescription = "Broken"\n';
    const fileInput = container.querySelector<HTMLInputElement>('input[aria-label="Import old TOML file"]')!;
    const file = new File([bad], 'bad.toml', { type: 'text/plain' });
    Object.defineProperty(file, 'text', { value: async () => bad });
    Object.defineProperty(fileInput, 'files', { value: [file] });
    await act(async () => { fileInput.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(container.querySelector('[role=status]')?.textContent).toContain('Could not import "bad.toml"');
    expect(input('Description').value).toBe('Saved rent');
  });

  it('keeps the TOML tab as an advanced escape hatch and jumps from the visual budget', async () => {
    await render(draft);
    await click(button('Visual Budget'));
    expect(container.querySelector<HTMLElement>('.studio-form')).toBeNull();
    await click(container.querySelector<HTMLButtonElement>('.bi-row')!);
    expect(button('TOML').getAttribute('aria-pressed')).toBe('true');
    expect(mocks.jump).toHaveBeenCalledWith(2);
    expect(container.querySelector('.studio-editor-actions')?.textContent).toBe('ClearCopyUndoRedoSearch');
  });

  it('applies round_amounts and no-space-currency format in the visual budget', async () => {
    await render(draft, false, { roundAmounts: true });
    expect(container.querySelector('.budget-inspector')?.textContent).toContain('+250USD');
  });

  it('uses the shared preview notice for the sample', async () => {
    await render(null, true);
    expect(container.querySelector('.sample-notice')?.textContent).toContain('Preview data is being shown.');
  });
});
