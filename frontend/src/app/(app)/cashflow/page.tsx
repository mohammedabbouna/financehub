'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, apiErrorMessage } from '@/lib/api';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import { formatCurrency, formatShortDate } from '@/lib/format';
import type { Forecast } from '@/types';

export default function CashflowPage() {
  const { data, isLoading, isError, error } = useQuery<Forecast>({
    queryKey: ['forecast'],
    queryFn: () => api.getForecast(),
  });
  if (isLoading) return <div className="flex justify-center py-20"><Spinner label="جاري تحميل التدفقات المتوقعة..." /></div>;
  if (isError || !data) return <EmptyState icon="📈" title="تعذر تحميل التدفقات" description={apiErrorMessage(error)} />;
  const f = data;
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-[28px] font-medium leading-9 text-gray-100">التدفقات المتوقعة</h1>
        <p className="mt-1 text-sm text-gray-400">توقع الرصيد خلال 30 يوماً</p>
      </div>
      <div className="card">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div><p className="text-xs text-gray-500">الرصيد الحالي</p><p className="mt-1 tabular-nums text-gray-200">{formatCurrency(f.current_balance, 0)}</p></div>
          <div><p className="text-xs text-gray-500">متوسط صافي يومي</p><p className="mt-1 tabular-nums text-gray-200">{formatCurrency(f.avg_daily_net, 0)}</p></div>
          <div><p className="text-xs text-gray-500">فواتير قادمة</p><p className="mt-1 tabular-nums text-gray-200">{formatCurrency(f.upcoming_bills, 0)}</p></div>
          <div><p className="text-xs text-gray-500">أيام حتى نفاد</p><p className="mt-1 tabular-nums text-gray-200">{f.estimated_runway != null ? f.estimated_runway : '—'}</p></div>
        </div>
      </div>
      {f.forecast && f.forecast.length > 0 && (
        <div className="card">
          <h3 className="mb-4 text-[15px] font-medium text-gray-100">التوقع اليومي</h3>
          <ul className="divide-y divide-white/[0.06]">
            {f.forecast.slice(0, 15).map((d, i: number) => (
              <li key={i} className="flex items-center justify-between py-2 text-sm">
                <span className="font-mono text-gray-400">{formatShortDate(d.date)}</span>
                <span className="tabular-nums text-gray-200">{formatCurrency(d.projected_balance, 0)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}