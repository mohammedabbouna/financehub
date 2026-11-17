'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, apiErrorMessage } from '@/lib/api';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import { formatCurrency, formatCompact, formatShortDate } from '@/lib/format';
import type { NetWorth } from '@/types';
import {
  AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';

export default function NetWorthPage() {
  const { data, isLoading, isError, error } = useQuery<NetWorth>({
    queryKey: ['networth', '180d'],
    queryFn: () => api.getNetWorth(new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10)),
  });
  if (isLoading) return <div className="flex justify-center py-20"><Spinner label="جاري تحميل صافي الثروة..." /></div>;
  if (isError || !data) return <EmptyState icon="🏦" title="تعذر تحميل صافي الثروة" description={apiErrorMessage(error)} />;
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-[28px] font-medium leading-9 text-gray-100">صافي الثروة</h1>
        <p className="mt-1 text-sm text-gray-400">تجميع يومي تراكمي · آخر 180 يوماً</p>
      </div>
      <div className="card">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[15px] font-medium text-gray-100">الأصول</h3>
          <span className={`text-sm tabular-nums ${data.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {data.change >= 0 ? '+' : ''}{formatCurrency(data.change, 0)} ({data.change_percent ?? 0}%)
          </span>
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={data.points} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(237,237,237,0.06)" vertical={false} />
            <XAxis dataKey="date" reversed tick={{ fontSize: 11, fill: '#85858b' }} tickLine={false} axisLine={{ stroke: 'rgba(237,237,237,0.08)' }} tickFormatter={(v: string) => formatShortDate(v).slice(3)} interval="preserveStartEnd" minTickGap={28} />
            <YAxis orientation="right" width={60} tick={{ fontSize: 11, fill: '#85858b' }} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatCompact(v)} />
            <Tooltip contentStyle={{ backgroundColor: '#26262a', border: '1px solid #34343a', borderRadius: '8px' }} formatter={(v: number | string) => [formatCurrency(Number(v), 0), 'صافي الثروة']} labelFormatter={(v: string) => formatShortDate(v)} />
            <Area type="monotone" dataKey="balance" stroke="#3b82f6" strokeWidth={2} fill="url(#nwFill)" dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
          </AreaChart>
        </ResponsiveContainer>
        <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
          <div><p className="text-gray-500">البداية</p><p className="tabular-nums text-gray-200">{formatCurrency(data.start, 0)}</p></div>
          <div><p className="text-gray-500">الحالية</p><p className="tabular-nums text-gray-200">{formatCurrency(data.current, 0)}</p></div>
          <div><p className="text-gray-500">التغيير</p><p className={`tabular-nums ${data.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{data.change >= 0 ? '+' : ''}{formatCurrency(data.change, 0)}</p></div>
        </div>
      </div>
    </div>
  );
}