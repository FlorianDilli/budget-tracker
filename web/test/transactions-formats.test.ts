// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../src/state/session', () => ({ useSession: () => session.value }));
import { ImportFormatsSection } from '../src/ui/ImportFormats';
import { Transactions } from '../src/ui/Transactions';
import { parseSettings, EMPTY_FINANCIALS } from '../src/domain/config';
import { SAMPLE_SETTINGS } from '../src/domain/sample';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let container: HTMLDivElement;
let root: Root;
let saveSettings: ReturnType<typeof vi.fn>;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  saveSettings = vi.fn(async () => ({ ok: true }));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function renderFormats() {
  function Harness() {
    const [drafts, setDrafts] = useState<{ settings: string | null; financials: string | null }>({ settings: null, financials: null });
    session.value = {
      snapshot: { settingsToml: SAMPLE_SETTINGS, financialsToml: '', transactions: [] },
      settings: parseSettings(SAMPLE_SETTINGS).ok ? (parseSettings(SAMPLE_SETTINGS) as { ok: true; value: unknown }).value : undefined,
      financials: EMPTY_FINANCIALS,
      isSample: false,
      drafts,
      setDraft: (kind: 'settings' | 'financials', text: string) => setDrafts((old) => ({ ...old, [kind]: text })),
      saveSettings,
      previewImport: vi.fn(),
      commitImport: vi.fn(),
      deleteMonth: vi.fn(),
    };
    return createElement(MemoryRouter, null, createElement(ImportFormatsSection));
  }
  await act(async () => root.render(createElement(Harness)));
}

async function renderTransactions(initialEntry: string) {
  function Harness() {
    const [drafts, setDrafts] = useState<{ settings: string | null; financials: string | null }>({ settings: null, financials: null });
    const parsed = parseSettings(SAMPLE_SETTINGS);
    session.value = {
      snapshot: { settingsToml: SAMPLE_SETTINGS, financialsToml: '', transactions: [] },
      settings: parsed.ok ? parsed.value : undefined,
      financials: EMPTY_FINANCIALS,
      isSample: false,
      drafts,
      setDraft: (kind: 'settings' | 'financials', text: string) => setDrafts((old) => ({ ...old, [kind]: text })),
      saveSettings,
      previewImport: vi.fn(),
      commitImport: vi.fn(),
      deleteMonth: vi.fn(),
    };
    return createElement(MemoryRouter, { initialEntries: [initialEntry] }, createElement(Transactions));
  }
  await act(async () => root.render(createElement(Harness)));
}

const button = (label: string) => Array.from(container.querySelectorAll('button')).find((el) => el.textContent === label) as HTMLButtonElement;
const field = (label: string) => {
  const wrapper = Array.from(container.querySelectorAll('label')).find((el) => el.querySelector('.setting-label')?.firstChild?.textContent === label);
  if (!wrapper) throw new Error(`No field "${label}"`);
  return wrapper.querySelector('input, select') as HTMLInputElement;
};

async function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

it('blocks saving while a required import column is empty', async () => {
  await renderFormats();
  await typeInto(field('Date column'), '   ');
  await act(async () => { await new Promise((r) => setTimeout(r, 500)); });
  expect(saveSettings).not.toHaveBeenCalled();
  expect(field('Date column').closest('label')?.querySelector('.field-error')?.textContent).toBe('Date column is required.');
  expect(container.querySelector('[role=alert]')).toBeNull();
  await typeInto(field('Date column'), 'Booking Date');
  await act(async () => { await new Promise((r) => setTimeout(r, 500)); });
  expect(field('Date column').closest('label')?.querySelector('.field-error')).toBeNull();
  // Reverting to the saved value means there is nothing new to save.
  expect(saveSettings).not.toHaveBeenCalled();
});

it('lets an opening balance be edited as natural decimal text', async () => {
  await renderFormats();
  const balance = field('Balance');
  expect(balance.type).toBe('text');
  expect(balance.inputMode).toBe('decimal');

  await typeInto(balance, '123.');
  expect(balance.value).toBe('123.');
  await act(async () => balance.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(balance.value).toBe('123.00');
  await act(async () => { await new Promise((r) => setTimeout(r, 500)); });

  const parsed = parseSettings(saveSettings.mock.calls[0][0] as string);
  expect(parsed.ok).toBe(true);
  if (parsed.ok) expect(parsed.value.formats[0].balanceSnapshot).toBe(12300);
});

it('offers human-readable date formats and saves the selected pattern', async () => {
  await renderFormats();
  const dateFormat = field('Date format') as HTMLSelectElement;
  expect(Array.from(dateFormat.options).map((option) => option.textContent)).toContain('Day/month/year (17/03/2025)');
  expect(Array.from(dateFormat.options).map((option) => option.textContent)).toContain('Year.month.day (2025.03.17)');

  await act(async () => {
    dateFormat.value = '%Y.%m.%d';
    dateFormat.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 500)); });

  const parsed = parseSettings(saveSettings.mock.calls[0][0] as string);
  expect(parsed.ok).toBe(true);
  if (parsed.ok) expect(parsed.value.formats[0].dateFormat).toBe('%Y.%m.%d');
});

it('adds an import format and reports the missing columns until it is complete', async () => {
  await renderFormats();
  expect(container.querySelectorAll('.format-card')).toHaveLength(1);
  await act(async () => button('Add format').click());
  await act(async () => { await new Promise((r) => setTimeout(r, 500)); });
  expect(container.querySelectorAll('.format-card')).toHaveLength(2);
  expect(saveSettings).not.toHaveBeenCalled();
  const newFormat = container.querySelectorAll<HTMLElement>('.format-card')[1];
  expect(container.querySelector('[role=alert]')).toBeNull();
  expect(newFormat.querySelectorAll('.field-error')).toHaveLength(3);
  expect(newFormat.querySelector('#format-1-date-column-error')?.textContent).toBe('Date column is required.');
  expect(newFormat.querySelector('#format-1-amount-column-error')?.textContent).toBe('Amount column is required.');
  expect(newFormat.querySelector('#format-1-description-or-reference-error')?.textContent).toBe('Enter a description or reference column.');
  expect(newFormat.querySelector('input[aria-describedby="format-1-date-column-error"]')).not.toBeNull();
  expect(newFormat.querySelectorAll(`input[aria-describedby="format-1-description-or-reference-error"]`)).toHaveLength(2);
});

it('shows import and formats in their own Transactions tabs', async () => {
  await renderTransactions('/transactions?tab=import');
  expect(container.querySelector('.import-panel')).not.toBeNull();
  expect(container.querySelector('.format-card')).toBeNull();

  await act(async () => { await root.unmount(); });
  container.remove();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  await renderTransactions('/transactions?tab=formats');
  expect(container.querySelector('.format-card')).not.toBeNull();
  expect(container.querySelector('.import-panel')).toBeNull();
});
