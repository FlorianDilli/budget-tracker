// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { applyTheme, getThemePreference, resolveTheme, setThemePreference } from '../src/theme';

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.head.innerHTML = '<meta name="theme-color" content="#f4f6f5" />';
  });

  it('defaults to system preference', () => {
    expect(getThemePreference()).toBe('system');
  });

  it('persists explicit preference and applies data-theme', () => {
    setThemePreference('dark');
    expect(getThemePreference()).toBe('dark');
    expect(localStorage.getItem('moonli-theme')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#0d0f0d');
  });

  it('system preference clears storage and resolves from media query', () => {
    setThemePreference('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    setThemePreference('system');
    expect(localStorage.getItem('moonli-theme')).toBeNull();
    expect(document.documentElement.dataset.theme).toBe(resolveTheme('system'));
  });

  it('applyTheme returns resolved theme', () => {
    expect(applyTheme('dark')).toBe('dark');
    expect(applyTheme('light')).toBe('light');
  });
});
