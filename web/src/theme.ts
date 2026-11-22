import { useCallback, useEffect, useState } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'moonli-theme';
const EVENT = 'moonli:themechange';

export function getThemePreference(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    return 'system';
  }
}

function darkMediaQuery(): MediaQueryList | null {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;
  } catch {
    return null;
  }
}

export function systemPrefersDark(): boolean {
  return !!darkMediaQuery()?.matches;
}

export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  return pref === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : pref;
}

/** Resolved theme currently applied to <html data-theme>, falling back to system. */
export function currentTheme(): ResolvedTheme {
  if (typeof document !== 'undefined') {
    const t = document.documentElement.dataset.theme;
    if (t === 'dark' || t === 'light') return t;
  }
  return systemPrefersDark() ? 'dark' : 'light';
}

export function isDarkTheme(): boolean {
  return currentTheme() === 'dark';
}

export function applyTheme(pref: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(pref);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = resolved === 'dark' ? '#0d0f0d' : '#f4f6f5';
  window.dispatchEvent(new Event(EVENT));
  return resolved;
}

export function setThemePreference(pref: ThemePreference): void {
  try {
    if (pref === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    /* storage unavailable (private mode) — theme still applies for the session */
  }
  applyTheme(pref);
}

export function initTheme(): void {
  applyTheme(getThemePreference());
}

/** React hook: current preference + resolved theme, kept in sync with system changes and toggles. */
export function useTheme() {
  const [pref, setPref] = useState<ThemePreference>(() => getThemePreference());
  const [resolved, setResolved] = useState<ResolvedTheme>(() => currentTheme());

  useEffect(() => {
    const onChange = () => {
      setPref(getThemePreference());
      setResolved(currentTheme());
    };
    const mq = darkMediaQuery();
    window.addEventListener(EVENT, onChange);
    mq?.addEventListener?.('change', () => {
      if (getThemePreference() === 'system') applyTheme('system');
      onChange();
    });
    return () => {
      window.removeEventListener(EVENT, onChange);
    };
  }, []);

  const cycle = useCallback(() => {
    // Visible toggle: flip the *resolved* theme (system follows OS until user picks).
    const next: ThemePreference = resolved === 'dark' ? 'light' : 'dark';
    setThemePreference(next);
    setPref(next);
    setResolved(currentTheme());
  }, [resolved]);

  const choose = useCallback((p: ThemePreference) => {
    setThemePreference(p);
    setPref(p);
    setResolved(currentTheme());
  }, []);

  return { pref, resolved, cycle, choose };
}
