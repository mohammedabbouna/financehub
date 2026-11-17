import React from 'react';
import AppShell from '@/components/AppShell';

/**
 * Server Component: exports metadata (client pages cannot) and delegates
 * the interactive shell (auth guard + sidebar) to a client component.
 * Per-page titles come from each route's own layout.tsx.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
