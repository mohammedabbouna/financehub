import React from 'react';

/** Route-level suspense fallback shown while a page chunk streams in. */
export default function Loading() {
  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="flex flex-col items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-block w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"
        />
        <p className="text-gray-500 text-sm">جاري التحميل…</p>
      </div>
    </div>
  );
}
