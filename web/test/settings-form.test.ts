// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../src/state/session', () => ({ useSession: () => session.value }));
import { Settings } from '../src/ui/Settings';
import { parseSettings } from '../src/domain/config';
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

async function render() {
  function Harness() {
    const [drafts, setDrafts] = useState<{ settings: string | null; financials: string | null }>({ settings: null, financials: null });
    session.value = {
      snapshot: { settingsToml: SAMPLE_SETTINGS, financialsToml: '' },
      isSample: false,
      drafts,
      setDraft: (kind: 'settings' | 'financials', text: string) => setDrafts((old) => ({ ...old, [kind]: text })),
      saveSettings,
    };
    return createElement(MemoryRouter, null, createElement(Settings));
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

it('edits settings through the form and saves valid generated TOML', async () => {
  await render();
  expect(container.querySelector('textarea')).toBeNull();
  expect(button('Save').disabled).toBe(true);

  await typeInto(field('Currency symbol'), 'USD');
  expect(button('Save').disabled).toBe(false);
  await act(async () => button('Save').click());

  const text = saveSettings.mock.calls[0][0] as string;
  const parsed = parseSettings(text);
  expect(parsed.ok).toBe(true);
  if (parsed.ok) {
    expect(parsed.value.currencySymbol).toBe('USD');
    expect(parsed.value.formats[0].name).toBe('Demo Bank');
    expect(parsed.value.formats[0].balanceSnapshot).toBe(100000);
  }
});

it('blocks saving while a required import column is empty', async () => {
  await render();
  await typeInto(field('Date column'), '   ');
  expect(button('Save').disabled).toBe(true);
  expect(field('Date column').closest('label')?.querySelector('.field-error')?.textContent).toBe('Date column is required.');
  expect(container.querySelector('[role=alert]')).toBeNull();
  await typeInto(field('Date column'), 'Booking Date');
  expect(field('Date column').closest('label')?.querySelector('.field-error')).toBeNull();
  expect(button('Save').disabled).toBe(true);
});

it('lets an opening balance be edited as natural decimal text', async () => {
  await render();
  const balance = field('Balance');
  expect(balance.type).toBe('text');
  expect(balance.inputMode).toBe('decimal');

  await typeInto(balance, '123.');
  expect(balance.value).toBe('123.');
  await act(async () => balance.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(balance.value).toBe('123.00');
  await act(async () => button('Save').click());

  const parsed = parseSettings(saveSettings.mock.calls[0][0] as string);
  expect(parsed.ok).toBe(true);
  if (parsed.ok) expect(parsed.value.formats[0].balanceSnapshot).toBe(12300);
});

it('offers human-readable date formats and saves the selected pattern', async () => {
  await render();
  const dateFormat = field('Date format') as HTMLSelectElement;
  expect(Array.from(dateFormat.options).map((option) => option.textContent)).toContain('Day/month/year (17/03/2025)');

  await act(async () => {
    dateFormat.value = '%d/%m/%Y';
    dateFormat.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await act(async () => button('Save').click());

  const parsed = parseSettings(saveSettings.mock.calls[0][0] as string);
  expect(parsed.ok).toBe(true);
  if (parsed.ok) expect(parsed.value.formats[0].dateFormat).toBe('%d/%m/%Y');
});

it('adds an import format and reports the missing columns until it is complete', async () => {
  await render();
  expect(container.querySelectorAll('.format-card')).toHaveLength(1);
  await act(async () => button('Add format').click());
  expect(container.querySelectorAll('.format-card')).toHaveLength(2);
  expect(button('Save').disabled).toBe(true);
  const newFormat = container.querySelectorAll<HTMLElement>('.format-card')[1];
  expect(container.querySelector('[role=alert]')).toBeNull();
  expect(newFormat.querySelectorAll('.field-error')).toHaveLength(3);
  expect(newFormat.querySelector('#format-1-date-column-error')?.textContent).toBe('Date column is required.');
  expect(newFormat.querySelector('#format-1-amount-column-error')?.textContent).toBe('Amount column is required.');
  expect(newFormat.querySelector('#format-1-description-or-reference-error')?.textContent).toBe('Enter a description or reference column.');
  expect(newFormat.querySelector('input[aria-describedby="format-1-date-column-error"]')).not.toBeNull();
  expect(newFormat.querySelectorAll(`input[aria-describedby="format-1-description-or-reference-error"]`)).toHaveLength(2);
});
