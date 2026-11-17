'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, apiErrorMessage } from '@/lib/api';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import { formatCurrency, formatShortDate } from '@/lib/format';
import type { Debt } from '@/types';

interface DebtsResponse { debts: Debt[]; }

export default function InstallmentsPage() {
  const { data, isLoading, isError, error } = useQuery<DebtsResponse>({
    queryKey: ['debts'],
    queryFn: () => api.getDebts(),
  });
  const debts = data?.debts || [];
  if (isLoading) return <div className="flex justify-center py-20"><Spinner label="جاري تحميل الأقساط..." /></div>;
  if (isError) return <EmptyState icon="📆" title="تعذر تحميل الأقساط" description={apiErrorMessage(error)} />;
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-[28px] font-medium leading-9 text-gray-100">الأقساط</h1>
        <p className="mt-1 text-sm text-gray-400">تتبع الأقساط والديون (أقساط شهرية)</p>
      </div>
      {debts.length === 0 ? (
        <div className="card"><EmptyState icon="📆" title="لا توجد أقساط" description="سُجِّلت الأقساط من صفحة الأشخاص والديون" /></div>
      ) : (
        <div className="card">
          <ul className="divide-y divide-white/[0.06]">
            {debts.map((d: Debt) => (
              <li key={d.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-gray-200">{d.contact_name || d.notes || 'قسط'}</p>
                  <p className="text-xs text-gray-500">{formatShortDate(d.due_date || d.created_at)} · {d.status || ''}</p>
                </div>
                <span className="tabular-nums text-gray-200">{formatCurrency(d.amount ?? d.remaining ?? 0, 0)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}