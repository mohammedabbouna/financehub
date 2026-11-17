'use client';

import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '@/lib/api';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatNumber, formatShortDate } from '@/lib/format';
import type { GoldHoldingsResponse, GoldPrice } from '@/types';

export default function GoldPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const price = useQuery<GoldPrice>({
    queryKey: ['gold', 'price'],
    queryFn: () => api.getGoldPrice(),
    staleTime: 30 * 60 * 1000,
  });

  const holdings = useQuery<GoldHoldingsResponse>({
    queryKey: ['gold', 'holdings'],
    queryFn: () => api.getGoldHoldings(),
  });

  const refresh = useMutation({
    mutationFn: () => api.getGoldPrice(true),
    onSuccess: () => {
      toast.success('تم تحديث سعر الذهب');
      queryClient.invalidateQueries({ queryKey: ['gold'] });
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'تعذّر تحديث السعر')),
  });

  if (holdings.isLoading && price.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner label="جاري تحميل سعر الذهب..." />
      </div>
    );
  }

  const p = price.data ?? holdings.data?.price ?? null;
  const data = holdings.data;

  if (!p && !data) {
    return <EmptyState icon="🥇" title="تعذّر جلب سعر الذهب" description="تحقق من الاتصال بالإنترنت ثم أعد المحاولة." />;
  }

  const plan = data?.plan;
  const summary = data?.summary;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">🥇 الذهب</h1>
          <p className="mt-1 text-sm text-gray-400">سعر الذهب اليوم بالدينار الجزائري + حصصك وخطة الادخار.</p>
        </div>
        <button
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
        >
          {refresh.isPending ? 'جاري التحديث...' : '🔄 تحديث السعر'}
        </button>
      </div>

      {/* Price card */}
      {p && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm text-gray-400">سعر غرام الذهب (24 قيراط)</p>
              <p className="mt-1 text-4xl font-bold text-amber-400">{formatCurrency(p.price_dzd_gram)}</p>
              <p className="mt-2 text-xs text-gray-500">
                سعر الأونصة: {formatCurrency(p.price_usd_oz, 2)}$ · صرف الدولار: {formatNumber(p.usd_dzd, 2)} دج
              </p>
            </div>
            <div className="text-left text-xs text-gray-500">
              <p>التاريخ: {formatShortDate(p.price_date)}</p>
              <p>المصدر: {p.source}</p>
              {p.is_stale && <p className="text-amber-500">⚠ سعر محفوظ (تعذّر التحديث الآن)</p>}
            </div>
          </div>
        </div>
      )}

      {/* Holdings */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4">
          <p className="text-sm text-gray-400">الكمية الحالية</p>
          <p className="mt-1 text-2xl font-semibold text-white">{formatNumber(summary?.total_grams ?? 0, 2)} غ</p>
        </div>
        <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4">
          <p className="text-sm text-gray-400">القيمة الآن</p>
          <p className="mt-1 text-2xl font-semibold text-amber-400">{formatCurrency(summary?.total_value ?? 0)}</p>
        </div>
        <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4">
          <p className="text-sm text-gray-400">الربح/الخسارة</p>
          <p
            className={`mt-1 text-2xl font-semibold ${
              (summary?.pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {formatCurrency(summary?.pnl ?? 0)}
          </p>
        </div>
      </div>

      {/* Holdings table */}
      <div className="rounded-xl border border-gray-700 bg-gray-800/50">
        <div className="border-b border-gray-700 px-5 py-4">
          <h2 className="font-semibold text-white">📋 حصص الذهب</h2>
        </div>
        {!data || data.holdings.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-500">
            لا حصص ذهب مسجّلة — أضف استثماراً من نوع «ذهب» في صفحة الاستثمارات.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-right text-xs text-gray-500">
                  <th className="px-5 py-3">الاسم</th>
                  <th className="px-5 py-3">الكمية (غ)</th>
                  <th className="px-5 py-3">سعر الشراء</th>
                  <th className="px-5 py-3">القيمة الآن</th>
                  <th className="px-5 py-3">الربح</th>
                </tr>
              </thead>
              <tbody>
                {data.holdings.map((h) => (
                  <tr key={h.id} className="border-b border-gray-700/50 text-gray-300">
                    <td className="px-5 py-3 text-white">{h.name}</td>
                    <td className="px-5 py-3">{formatNumber(h.grams, 2)}</td>
                    <td className="px-5 py-3">{formatCurrency(h.purchase_price)}</td>
                    <td className="px-5 py-3">{formatCurrency(h.value_now)}</td>
                    <td className={`px-5 py-3 ${h.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatCurrency(h.pnl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Savings plan */}
      {plan && (
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-5">
          <h2 className="font-semibold text-white">🎯 خطة الادخار نحو {formatNumber(plan.target_grams, 0)}غ</h2>
          {plan.missing_grams <= 0 ? (
            <p className="mt-2 text-sm text-emerald-400">✓ بلغت هدف الوزن — ما عليك إلا المحافظة عليه.</p>
          ) : (
            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <p className="text-gray-400">المتبقي</p>
                <p className="text-lg font-semibold text-white">{formatNumber(plan.missing_grams, 2)} غ</p>
              </div>
              <div>
                <p className="text-gray-400">إجمالي المطلوب</p>
                <p className="text-lg font-semibold text-white">
                  {plan.total_to_save !== null ? formatCurrency(plan.total_to_save) : '—'}
                </p>
              </div>
              <div>
                <p className="text-gray-400">شهرياً ({plan.months} شهر)</p>
                <p className="text-lg font-semibold text-blue-400">
                  {plan.per_month !== null ? formatCurrency(plan.per_month) : '—'}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
