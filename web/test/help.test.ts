// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Help } from '../src/ui/Help';

describe('Help page', () => {
  it('renders all sections describing plan, check and balance workflow', () => {
    const html = renderToStaticMarkup(createElement(Help));
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const text = doc.body.textContent!;
    expect(text).toContain('Overview');
    expect(text).toContain('Step 1: Plan your budget');
    expect(text).toContain('Import old TOML file');
    expect(text).toContain('purpose');
    expect(text).toContain('Step 2: Import CSV');
    expect(text).toContain('Step 3: Check whether payments happened');
    expect(text).toContain('Lump-sum payment partner');
    expect(text).toContain('What this app deliberately does NOT do');
    expect(text).toContain('No transaction categories');
    expect(text).toContain('No Splitwise reconciliation');
    expect(text).toContain('No remaining budget');
    expect(text).toContain('Reading the balance curve');
    expect(text).toContain('balance change (delta)');
    expect(text).toContain('Why does an entry report');
    expect(text).toContain('Why does it say');
    expect(text).toContain('Why does my household share never appear as a booking?');
    expect(text).not.toContain('Safe to Spend');
  });
});
