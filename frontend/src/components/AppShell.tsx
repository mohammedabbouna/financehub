'use client';

import React, { useEffect, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { hydratePrivacy, subscribePrivacy, isPrivacyHidden } from '@/lib/privacy';
import Sidebar from '@/components/ui/Sidebar';
import CommandPalette from '@/components/CommandPalette';
import Onboarding from '@/components/Onboarding';
import CacheSync from '@/components/CacheSync';
import OfflineBanner from '@/components/OfflineBanner';

/** Shared spinner so neither auth branch ever paints an empty (black) screen. */
function BootSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="flex flex-col items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-block w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"
        />
        <p className="text-sm text-gray-500">جاري التحميل...</p>
      </div>
    </div>
  );
}

/**
 * Client shell for every authenticated screen:
 *  - waits for the auth bootstrap
 *  - redirects to /login when the session is missing or expired
 *  - renders the persistent Sidebar + page padding
 *
 * Rendered by (app)/layout.tsx so the URL structure stays clean:
 * /dashboard, /wallets, /actions, ... all share this shell.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  // Privacy mode: hydrate the saved flag after mount (SSR-safe), then let a
  // toggle remount the tree via `key` so every amount repaints masked.
  const privacyHidden = useSyncExternalStore(subscribePrivacy, isPrivacyHidden, () => false);
  useEffect(() => {
    hydratePrivacy();
  }, []);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      // Stale `financehub_session` cookie (cookies are shared across ports,
      // so a login on :80 leaves one behind for :3000) would make the
      // middleware bounce /login back to /dashboard — an endless loop that
      // renders a black screen. Clear the marker FIRST so the redirect sticks.
      api.clearAuth();
      router.replace('/login');
    }
  }, [loading, isAuthenticated, router]);

  if (loading) return <BootSpinner />;

  // Redirect is in flight (cookie cleared above) — show the spinner rather
  // than a black screen during the round-trip to /login.
  if (!isAuthenticated) return <BootSpinner />;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-900">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        {/* key flips with the privacy flag → full remount → masked amounts */}
        <div key={privacyHidden ? 'hidden' : 'shown'} className="mx-auto w-full max-w-[1440px]">
          {children}
        </div>
      </main>
      {/* Global ⌘K quick-entry palette — listens for its own keybinding. */}
      <CommandPalette />
      {/* First-run wizard: wallet → salary → budgets (auto-skips if a wallet exists). */}
      <Onboarding />
      {/* Offline cache sync + banner. */}
      <CacheSync />
      <OfflineBanner />
    </div>
  );
}
