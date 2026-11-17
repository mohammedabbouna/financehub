'use client';

import React from 'react';

/** Consistent loading spinner with an optional label. */
export default function Spinner({ label, size = 'md' }: { label?: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-10 h-10' : 'w-8 h-8';
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8" role="status">
      <span
        aria-hidden="true"
        className={`inline-block ${sizeClass} animate-spin rounded-full border-2 border-blue-400 border-t-transparent`}
      />
      <span className="text-sm text-gray-400">{label ?? 'جاري التحميل...'}</span>
    </div>
  );
}
