'use client';

/**
 * Privacy mode (وضع الخصوصية): hides every money amount behind ••••.
 *
 * The flag lives in module state so the pure formatters in lib/format.ts
 * can read it without React; persistence is localStorage, and AppShell
 * subscribes so a toggle remounts the tree and repaints every screen.
 *
 * SSR-safe: starts false (server + first client render agree → no
 * hydration mismatch), then hydrates from storage after mount.
 */

const STORAGE_KEY = 'financehub_privacy';

let hidden = false;
const listeners = new Set<() => void>();

export function isPrivacyHidden(): boolean {
  return hidden;
}

/** Call once after mount to apply a previously saved preference. */
export function hydratePrivacy(): void {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY) === '1';
    if (saved !== hidden) {
      hidden = saved;
      notify();
    }
  } catch {
    // Storage unavailable (private mode) — stay visible.
  }
}

export function setPrivacyHidden(next: boolean): void {
  if (next === hidden) return;
  hidden = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
  } catch {
    // Preference is still applied for this session.
  }
  notify();
}

export function togglePrivacy(): void {
  setPrivacyHidden(!hidden);
}

export function subscribePrivacy(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  listeners.forEach((l) => l());
}
