'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, apiErrorMessage } from '@/lib/api';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import { formatShortDate } from '@/lib/format';

interface AuditEntry { id: number; action: string; entity: string; entity_id: number | null; diff: string | null; ip: string | null; created_at: string; }

export default function AuditPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['audit'],
    queryFn: () => api.getAuditLog(),
  });
  const logs: AuditEntry[] = data?.logs || [];
  if (isLoading) return <div className="flex justify-center py-20"><Spinner label="جاري تحميل سجل التدقيق..." /></div>;
  if (isError) return <EmptyState icon="📜" title="تعذر تحميل السجل" description={apiErrorMessage(error)} />;
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-[28px] font-medium leading-9 text-gray-100">سجل التدقيق (Audit Log)</h1>
        <p className="mt-1 text-sm text-gray-400">آخر 200 عملية</p>
      </div>
      {logs.length === 0 ? (
        <div className="card"><EmptyState icon="📜" title="لا توجد سجلات" description="العمليات ستظهر هنا" /></div>
      ) : (
        <div className="card">
          <ul className="divide-y divide-white/[0.06]">
            {logs.map((l) => (
              <li key={l.id} className="py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-200">{l.action} · {l.entity}{l.entity_id ? ` #${l.entity_id}` : ''}</span>
                  <span className="text-xs text-gray-500 font-mono">{formatShortDate(l.created_at)}</span>
                </div>
                {l.diff && <p className="mt-1 text-xs text-gray-500 font-mono truncate">{l.diff}</p>}
                {l.ip && <p className="text-xs text-gray-600">IP: {l.ip}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}