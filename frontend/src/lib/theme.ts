'use client';

const STORAGE_KEY = 'financehub_theme';

let theme: 'dark' | 'light' = 'dark';
const listeners = new Set<() => void>();

export function getTheme(): 'dark' | 'light' { return theme; }

export function hydrateTheme(): void {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') {
      if (saved !== theme) {
        theme = saved;
        applyTheme();
        notify();
      }
    }
  } catch {
    // ignore
  }
}

export function setTheme(next: 'dark' | 'light'): void {
  if (next === theme) return;
  theme = next;
  try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  applyTheme();
  notify();
}

export function toggleTheme(): void {
  setTheme(theme === 'dark' ? 'light' : 'dark');
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function applyTheme(): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  if (theme === 'light') {
    html.classList.add('light');
    html.classList.remove('dark');
  } else {
    html.classList.add('dark');
    html.classList.remove('light');
  }
}

function notify(): void {
  listeners.forEach((l) => l());
}

// Apply default (dark) on load.
if (typeof document !== 'undefined') {
  applyTheme();
}