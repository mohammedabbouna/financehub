'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '@/lib/api';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import Glyph from '@/components/ui/Glyph';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatNumber, formatShortDate } from '@/lib/format';
import type { ZakatCalculation, ZakatSnapshot } from '@/types';

const STAT_ROWS: Array<{ key: keyof ZakatCalculation['breakdown']; label: string; icon: string; positive: boolean }> = [
  { key: 'cash', label: 'النقد (المحافظ)', icon: '💵', positive: true },
  { key: 'gold_value', label: 'الذهب', icon: '🥇', positive: true },
  { key: 'investments_value', label: 'الاستثمارات', icon: '📈', positive: true },
  { key: 'receivables', label: 'المستحقات (لقيّ)', icon: '📥', positive: true },
  { key: 'liabilities', label: 'الديون (عليّ)', icon: '📤', positive: false },
];

export default function ZakatPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [notes, setNotes] = useState('');
  const [showSave, setShowSave] = useState(false);

  const calc = useQuery<ZakatCalculation>({
    queryKey: ['zakat', 'calculate'],
    queryFn: () => api.getZakatCalculation(),
  });

  const snapshots = useQuery<{ snapshots: ZakatSnapshot[] }>({
    queryKey: ['zakat', 'snapshots'],
    queryFn: () => api.getZakatSnapshots(),
  });

  const save = useMutation({
    mutationFn: () => api.saveZakatSnapshot(notes.trim() || undefined),
    onSuccess: () => {
      toast.success('تم حفظ لقطة الزكاة');
      setShowSave(false);
      setNotes('');
      queryClient.invalidateQueries({ queryKey: ['zakat'] });
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  if (calc.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner label="جاري حساب الزكاة..." />
      </div>
    );
  }

  if (calc.isError || !calc.data) {
    return <EmptyState icon="⚠️" title="تعذّر حساب الزكاة" description={apiErrorMessage(calc.error)} />;
  }

  const data = calc.data;
  const b = data.breakdown;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-medium leading-9 text-gray-100">الزكاة</h1>
          <p className="mt-1 text-sm text-gray-500">
            حساب الزكاة (2.5%) على أساس ثروتك الحقيقية — نصاب <span className="tabular-nums">85</span>غ ذهب
          </p>
        </div>
        <button onClick={() => setShowSave(true)} className="btn-primary inline-flex items-center gap-2">
          <Glyph name="💾" size={16} />
          حفظ لقطة
        </button>
      </div>

      {/* Zakat due card */}
      <div
        className={`card p-6 ${data.is_due ? 'border-amber-500/40 bg-amber-500/10' : ''}`}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs text-gray-500">{data.is_due ? 'الزكاة المستحقة هذا العام' : 'لا زكاة مستحقة'}</p>
            <p className="mt-2 text-4xl font-medium tabular-nums text-amber-400">{formatCurrency(data.zakat_due, 0)}</p>
            <p className="mt-2 text-xs text-gray-500">
              نسبة 2.5% من صافي الثروة — <span className="font-mono">{formatShortDate(data.as_of)}</span>
            </p>
          </div>
          <div className="text-left">
            <p className="text-xs text-gray-500">صافي الثروة</p>
            <p className="mt-2 text-2xl font-medium leading-8 tabular-nums text-gray-100">
              {formatCurrency(b.net_wealth, 0)}
            </p>
            <p className="mt-2 text-xs text-gray-500">
              النصاب: <span className="tabular-nums">{formatNumber(data.nisab.grams, 0)}</span>غ ذهب ={' '}
              {data.nisab.value !== null ? (
                <span className="tabular-nums">{formatCurrency(data.nisab.value, 0)}</span>
              ) : (
                '—'
              )}
              {data.nisab.reached ? ' ✓' : ' (لم يُبلغ)'}
            </p>
          </div>
        </div>
      </div>

      {/* Breakdown */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {STAT_ROWS.map((row) => (
          <div key={row.key} className="card p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm text-gray-400">
                <span className="flex w-[18px] shrink-0 justify-center">
                  <Glyph name={row.icon} size={18} className="text-gray-500" />
                </span>
                {row.label}
              </span>
              <span
                dir={row.positive ? undefined : 'ltr'}
                className={`text-lg font-medium tabular-nums ${row.positive ? 'text-emerald-400' : 'text-red-400'}`}
              >
                {row.positive ? '' : '−'}
                {formatCurrency(Math.abs(b[row.key]), 0)}
              </span>
            </div>
          </div>
        ))}
        <div className="card p-4 border-blue-500/30 bg-blue-500/10">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm text-gray-400">
              <span className="flex w-[18px] shrink-0 justify-center">
                <Glyph name="🧮" size={18} className="text-gray-500" />
              </span>
              صافي الثروة
            </span>
            <span className="text-lg font-medium tabular-nums text-blue-400">{formatCurrency(b.net_wealth, 0)}</span>
          </div>
        </div>
      </div>

      {/* Gold price note */}
      {data.gold_price && (
        <p className="text-xs text-gray-500">
          سعر الذهب المستخدم:{' '}
          <span className="tabular-nums">{formatCurrency(data.gold_price.price_dzd_gram, 0)}</span> للغرام (
          <span className="font-mono">{data.gold_price.price_date}</span>
          {data.gold_price.is_stale ? (
            <span className="text-amber-400"> — سعر محفوظ (تعذّر التحديث)</span>
          ) : (
            ''
          )}
          )
        </p>
      )}

      {/* Snapshots history */}
      <div className="card p-0">
        <div className="border-b border-gray-100/[0.06] px-5 py-4">
          <h2 className="text-[15px] font-medium text-gray-100">اللقطات المحفوظة</h2>
        </div>
        {snapshots.isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner size="sm" />
          </div>
        ) : (snapshots.data?.snapshots.length ?? 0) === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-500">لا لقطات محفوظة بعد</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100/[0.06] text-right text-xs font-normal text-gray-500">
                  <th className="px-5 py-3">التاريخ</th>
                  <th className="px-5 py-3 text-left">النقد</th>
                  <th className="px-5 py-3 text-left">الذهب</th>
                  <th className="px-5 py-3 text-left">الاستثمارات</th>
                  <th className="px-5 py-3 text-left">صافي الثروة</th>
                  <th className="px-5 py-3 text-left">الزكاة</th>
                  <th className="px-5 py-3">ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.data!.snapshots.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100/[0.06] text-gray-100 last:border-0">
                    <td className="px-5 py-3 font-mono">{formatShortDate(s.snapshot_date)}</td>
                    <td className="px-5 py-3 text-left tabular-nums">{formatCurrency(s.cash, 0)}</td>
                    <td className="px-5 py-3 text-left tabular-nums">{formatCurrency(s.gold_value, 0)}</td>
                    <td className="px-5 py-3 text-left tabular-nums">{formatCurrency(s.investments_value, 0)}</td>
                    <td className="px-5 py-3 text-left font-medium tabular-nums text-gray-100">
                      {formatCurrency(s.net_wealth, 0)}
                    </td>
                    <td className="px-5 py-3 text-left tabular-nums text-amber-400">{formatCurrency(s.zakat_due, 0)}</td>
                    <td className="max-w-[200px] truncate px-5 py-3 text-gray-500">{s.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Save snapshot modal */}
      <Modal open={showSave} onClose={() => setShowSave(false)} title="حفظ لقطة الزكاة">
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            ستُحسب القيم من أرصدتك الحقيقية الآن وتُحفظ كسجل تاريخي (لا يمكن تعديلها لاحقاً).
          </p>
          <div>
            <label className="mb-1 block text-sm text-gray-400">ملاحظات (اختياري)</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: زكاة رمضان 1448"
              className="input"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowSave(false)} className="btn-ghost">
              إلغاء
            </button>
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="btn-primary disabled:opacity-50"
            >
              {save.isPending ? 'جاري الحفظ...' : 'حفظ'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
