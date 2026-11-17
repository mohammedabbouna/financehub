'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';

/**
 * App-level error boundary. Catches render/runtime errors anywhere in the
 * subtree and offers a safe recovery path instead of a blank page.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface in the browser console for debugging (never contains secrets).
    console.error('FinanceHub render error:', error);
  }, [error]);

  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center bg-gray-900 p-6">
      <div className="max-w-md w-full text-center space-y-5">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-gray-800 bg-gray-950">
          <TriangleAlert size={22} strokeWidth={1.5} className="text-amber-400" />
        </span>
        <h1 className="text-xl font-medium text-gray-100">حدث خطأ غير متوقع</h1>
        <p className="text-sm text-gray-400 leading-relaxed">
          عذراً، واجه التطبيق خطأ أثناء عرض هذه الصفحة. يمكنك المحاولة مرة أخرى
          أو العودة إلى لوحة التحكم.
        </p>
        {error.digest && (
          <p className="text-xs text-gray-600 font-mono" dir="ltr">
            ref: {error.digest}
          </p>
        )}
        <div className="flex items-center justify-center gap-3 pt-2">
          <button onClick={reset} className="btn-primary text-sm">
            إعادة المحاولة
          </button>
          <Link href="/dashboard" className="btn-secondary text-sm">
            لوحة التحكم
          </Link>
        </div>
      </div>
    </div>
  );
}
