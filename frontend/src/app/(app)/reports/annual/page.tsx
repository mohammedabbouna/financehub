'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, apiErrorMessage } from '@/lib/api';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import Glyph from '@/components/ui/Glyph';
import { formatCurrency } from "@/lib/format";

export default function AnnualReportPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['annual-report', year],
    queryFn: () => api.getAnnualReport(year),
  });

  if (isLoading) return <div className="flex justify-center py-20"><Spinner label="جاري تحميل التقرير السنوي..." /></div>;
  if (isError || !data) return <EmptyState icon="📊" title="تعذر تحميل التقرير" description={apiErrorMessage(error)} />;

  const tax = data.tax || {};

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-medium leading-9 text-gray-100">التقرير السنوي (Algeria IRG)</h1>
          <p className="mt-1 text-sm text-gray-400">ملخص سنوي + تقدير ضريبي</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="input w-28" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button type="button" onClick={() => window.print()} className="btn-secondary">🖨️ طباعة</button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="card p-5"><p className="text-xs text-gray-500">الدخل</p><p className="mt-2 text-2xl font-medium tabular-nums text-emerald-400">{formatCurrency(data.total_income, 0)}</p></div>
        <div className="card p-5"><p className="text-xs text-gray-500">الإنفاق</p><p className="mt-2 text-2xl font-medium tabular-nums text-rose-400">{formatCurrency(data.total_expense, 0)}</p></div>
        <div className="card p-5"><p className="text-xs text-gray-500">الصافي</p><p className={`mt-2 text-2xl font-medium tabular-nums ${data.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(data.net, 0)}</p></div>
        <div className="card p-5"><p className="text-xs text-gray-500">معدل الادخار</p><p className="mt-2 text-2xl font-medium tabular-nums text-blue-400">{data.savings_rate}%</p></div>
      </div>

      <div className="card">
        <h3 className="mb-4 text-[15px] font-medium text-gray-100">تقدير الضريبة (IRG + CNAS)</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-sm">
          <div><p className="text-gray-500">الدخل الخاضع للضريبة</p><p className="mt-1 tabular-nums text-gray-200">{formatCurrency(tax.taxable_income, 0)}</p></div>
          <div><p className="text-gray-500">IRG</p><p className="mt-1 tabular-nums text-gray-200">{formatCurrency(tax.irg, 0)}</p></div>
          <div><p className="text-gray-500">مساهمات اجتماعية (CNAS ~9%)</p><p className="mt-1 tabular-nums text-gray-200">{formatCurrency(tax.social_contributions, 0)}</p></div>
          <div><p className="text-gray-500">الإجمالي</p><p className="mt-1 tabular-nums text-rose-400">{formatCurrency(tax.total, 0)}</p></div>
        </div>
        <p className="mt-3 text-xs text-gray-500">المعدل الفعلي: {tax.effective_rate}% · تقدير (استشر محاسباً للحصول على أرقام دقيقة)</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <h3 className="mb-4 text-[15px] font-medium text-gray-100">الدخل حسب المصدر</h3>
          <ul className="divide-y divide-white/[0.06]">
            {(data.income_by_source || []).map((c: any, i: number) => (
              <li key={i} className="flex items-center justify-between py-2 text-sm">
                <span className="flex items-center gap-2 text-gray-300"><Glyph name={c.icon} size={14} className="text-gray-500" />{c.name}</span>
                <span className="tabular-nums text-gray-200">{formatCurrency(c.total, 0)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h3 className="mb-4 text-[15px] font-medium text-gray-100">الإنفاق حسب الفئة</h3>
          <ul className="divide-y divide-white/[0.06]">
            {(data.expense_by_category || []).map((c: any, i: number) => (
              <li key={i} className="flex items-center justify-between py-2 text-sm">
                <span className="flex items-center gap-2 text-gray-300"><Glyph name={c.icon} size={14} className="text-gray-500" />{c.name}</span>
                <span className="tabular-nums text-gray-200">{formatCurrency(c.total, 0)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card">
        <h3 className="mb-4 text-[15px] font-medium text-gray-100">التفصيل الشهري</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500">
              <tr><th className="px-3 py-2 text-right">الشهر</th><th className="px-3 py-2 text-left">الدخل</th><th className="px-3 py-2 text-left">الإنفاق</th><th className="px-3 py-2 text-left">الصافي</th></tr>
            </thead>
            <tbody>
              {(data.monthly || []).map((m: any, i: number) => (
                <tr key={i} className="border-t border-gray-100/[0.04]">
                  <td className="px-3 py-2 font-mono text-gray-400">{m.ym}</td>
                  <td className="px-3 py-2 tabular-nums text-emerald-400">{formatCurrency(m.income, 0)}</td>
                  <td className="px-3 py-2 tabular-nums text-rose-400">{formatCurrency(m.expense, 0)}</td>
                  <td className={`px-3 py-2 tabular-nums ${Number(m.income) - Number(m.expense) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(Number(m.income) - Number(m.expense), 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}