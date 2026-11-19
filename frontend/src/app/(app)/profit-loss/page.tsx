'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, apiErrorMessage } from '@/lib/api';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import { formatCurrency } from '@/lib/format';

export default function ProfitLossPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['annual-report', year],
    queryFn: () => api.getAnnualReport(year),
  });
  if (isLoading) return <div className="flex justify-center py-20"><Spinner label="جاري التحميل..." /></div>;
  if (isError || !data) return <EmptyState icon="📊" title="تعذر تحميل P&L" description={apiErrorMessage(error)} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-medium leading-9 text-gray-100">الأرباح والخسائر (P&L)</h1>
          <p className="mt-1 text-sm text-gray-400">ملخص سنوي</p>
        </div>
        <select className="input w-28" value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card p-5"><p className="text-xs text-gray-500">الإيرادات</p><p className="mt-2 text-2xl font-medium tabular-nums text-emerald-400">{formatCurrency(data.total_income, 0)}</p></div>
        <div className="card p-5"><p className="text-xs text-gray-500">المصاريف</p><p className="mt-2 text-2xl font-medium tabular-nums text-rose-400">{formatCurrency(data.total_expense, 0)}</p></div>
        <div className="card p-5"><p className="text-xs text-gray-500">صافي الربح</p><p className={`mt-2 text-2xl font-medium tabular-nums ${data.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(data.net, 0)}</p></div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <h3 className="mb-4 text-[15px] font-medium text-gray-100">الإيرادات حسب المصدر</h3>
          <ul className="divide-y divide-white/[0.06]">
            {(data.income_by_source || []).map((c: any, i: number) => (
              <li key={i} className="flex items-center justify-between py-2 text-sm">
                <span className="text-gray-300">{c.icon} {c.name}</span>
                <span className="tabular-nums text-gray-200">{formatCurrency(c.total, 0)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h3 className="mb-4 text-[15px] font-medium text-gray-100">المصاريف حسب الفئة</h3>
          <ul className="divide-y divide-white/[0.06]">
            {(data.expense_by_category || []).map((c: any, i: number) => (
              <li key={i} className="flex items-center justify-between py-2 text-sm">
                <span className="text-gray-300">{c.icon} {c.name}</span>
                <span className="tabular-nums text-gray-200">{formatCurrency(c.total, 0)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}