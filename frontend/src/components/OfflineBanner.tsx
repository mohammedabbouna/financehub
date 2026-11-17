'use client';

import { useOnline } from '@/lib/useOnline';

export default function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-[90] -translate-x-1/2 rounded-lg border border-amber-500/40 bg-amber-500/15 px-4 py-2 text-sm text-amber-300 shadow-lg backdrop-blur"
    >
      ⚠️ أنت غير متصل — يتم عرض البيانات المخزّنة. سيتم المزامنة عند عودة الاتصال.
    </div>
  );
}