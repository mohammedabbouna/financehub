'use client';

import { useEffect } from 'react';

/**
 * Registers the FinanceHub service worker for offline/PWA support.
 * Registered once on mount; safe to call multiple times (browser dedupes).
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    // Avoid registering in dev to prevent stale caches during HMR.
    if (process.env.NODE_ENV !== 'production') return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Registration failure is non-fatal; the app still works online.
    });
  }, []);
  return null;
}