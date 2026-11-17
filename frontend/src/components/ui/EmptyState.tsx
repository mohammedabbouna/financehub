'use client';

import React from 'react';
import Glyph from '@/components/ui/Glyph';

interface EmptyStateProps {
  /** Emoji key or alias resolved by <Glyph />. */
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

/** Shared empty/error state used by every list view. */
export default function EmptyState({ icon = '📭', title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-800 bg-gray-900/60">
        <Glyph name={icon} size={18} className="text-gray-500" />
      </span>
      <p className="text-sm font-medium text-gray-300">{title}</p>
      {description && <p className="max-w-sm text-sm leading-6 text-gray-500">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
