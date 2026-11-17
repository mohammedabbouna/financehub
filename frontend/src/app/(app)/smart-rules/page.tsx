'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, apiErrorMessage } from '@/lib/api';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import type { AllocationRule } from '@/types';

interface RulesResponse { rules: AllocationRule[]; }

export default function SmartRulesPage() {
  const { data, isLoading, isError, error } = useQuery<RulesResponse>({
    queryKey: ['allocation-rules'],
    queryFn: () => api.getAllocationRules(),
  });
  const rules = data?.rules || [];
  if (isLoading) return <div className="flex justify-center py-20"><Spinner label="جاري تحميل القواعد الذكية..." /></div>;
  if (isError) return <EmptyState icon="⚙️" title="تعذر تحميل القواعد" description={apiErrorMessage(error)} />;
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-[28px] font-medium leading-9 text-gray-100">القواعد الذكية</h1>
        <p className="mt-1 text-sm text-gray-400">قواعد التخصيص التلقائي للدخل</p>
      </div>
      {rules.length === 0 ? (
        <div className="card"><EmptyState icon="⚙️" title="لا توجد قواعد" description="أضف قواعد من صفحة الإعدادات" /></div>
      ) : (
        <div className="card">
          <ul className="divide-y divide-white/[0.06]">
            {rules.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-gray-200">{r.target_type} #{r.target_id}</p>
                  <p className="text-xs text-gray-500">{r.allocation_type} · {r.allocation_value}{r.allocation_type === 'percentage' ? '%' : ''}</p>
                </div>
                <span className="badge bg-gray-800 text-gray-400">أولوية {r.priority}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}