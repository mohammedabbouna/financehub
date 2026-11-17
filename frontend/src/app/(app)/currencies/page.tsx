'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Spinner from '@/components/ui/Spinner';
import { formatNumber } from '@/lib/format';

const CURRENCIES = [
  { code: 'DZD', name: 'دينار جزائري', symbol: 'دج' },
  { code: 'EUR', name: 'يورو', symbol: '€' },
  { code: 'USD', name: 'دولار أمريكي', symbol: '$' },
  { code: 'GBP', name: 'جنيه إسترليني', symbol: '£' },
  { code: 'CAD', name: 'دولار كندي', symbol: 'C$' },
  { code: 'CHF', name: 'فرنك سويسري', symbol: 'CHF' },
  { code: 'TRY', name: 'ليرة تركية', symbol: '₺' },
  { code: 'CNY', name: 'يوان صيني', symbol: '¥' },
  { code: 'SAR', name: 'ريال سعودي', symbol: '﷼' },
  { code: 'AED', name: 'درهم إماراتي', symbol: 'د.إ' },
  { code: 'TND', name: 'دينار تونسي', symbol: 'د.ت' },
  { code: 'MAD', name: 'درهم مغربي', symbol: 'د.م.' },
];

const MARKETS = [
  { value: 'parallel_buy', label: 'السوق الموازي (شراء)' },
  { value: 'parallel_sell', label: 'السوق الموازي (بيع)' },
  { value: 'official', label: 'الرسمي' },
];

interface RatesResponse {
  quoteCurrency: string;
  rates: Record<string, { name: string; official: number; parallel_buy: number; parallel_sell: number }>;
  retrievedAt: string;
  refreshIntervalSeconds: number;
}

export default function CurrenciesPage() {
  const [market, setMarket] = useState('parallel_buy');
  const [amount, setAmount] = useState('1000');
  const [from, setFrom] = useState('DZD');
  const [to, setTo] = useState('EUR');

  const { data, isLoading, isError, refetch, isFetching } = useQuery<RatesResponse>({
    queryKey: ['fx-rates'],
    queryFn: async () => {
      const res = await fetch('https://easyalgerie.com/api/v1/dinar/rates');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    },
    staleTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
  });

  const rateOf = (code: string): number => {
    if (code === 'DZD') return 1;
    const r = data?.rates?.[code];
    if (!r) return 1;
    return r[market as 'official' | 'parallel_buy' | 'parallel_sell'] ?? 1;
  };

  const inDzd = (Number(amount) || 0) * (from === 'DZD' ? 1 : rateOf(from));
  const result = inDzd / (to === 'DZD' ? 1 : rateOf(to));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-medium leading-9 text-gray-100">العملات</h1>
          <p className="mt-1 text-sm text-gray-400">
            محوّل عملات (أسعار حيّة — EasyAlgerie)
            {data?.retrievedAt && <span className="mr-2 text-xs text-gray-600">· {new Date(data.retrievedAt).toLocaleString('ar-DZ')}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select className="input w-48" value={market} onChange={(e) => setMarket(e.target.value)}>
            {MARKETS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <button type="button" onClick={() => refetch()} className="btn-secondary" disabled={isFetching}>
            {isFetching ? '...' : 'تحديث'}
          </button>
        </div>
      </div>

      <div className="card max-w-2xl">
        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner label="جاري جلب الأسعار..." /></div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-sm text-gray-400 mb-2">المبلغ</label>
                <input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} dir="ltr" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">من</label>
                <select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
                  {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">إلى</label>
                <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
                  {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-6 rounded-lg bg-gray-900/60 p-4 text-center">
              <p className="text-sm text-gray-400">النتيجة</p>
              <p className="mt-1 text-2xl font-medium tabular-nums text-gray-100">
                {formatNumber(result, 2)} {CURRENCIES.find((c) => c.code === to)?.symbol}
              </p>
              {from !== 'DZD' && to !== 'DZD' && (
                <p className="mt-1 text-xs text-gray-500">1 {from} = {formatNumber(rateOf(from) / rateOf(to), 4)} {to}</p>
              )}
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h3 className="mb-4 text-[15px] font-medium text-gray-100">
          أسعار الصرف (مقابل دج) — {MARKETS.find((m) => m.value === market)?.label}
        </h3>
        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner label="جاري جلب الأسعار..." /></div>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {CURRENCIES.filter((c) => c.code !== 'DZD').map((c) => {
              const r = rateOf(c.code);
              return (
                <li key={c.code} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-gray-300">{c.code} — {c.name}</span>
                  <span className="tabular-nums text-gray-400">1 {c.code} = {formatNumber(r, 2)} دج</span>
                </li>
              );
            })}
          </ul>
        )}
        {isError && <p className="mt-2 text-xs text-rose-400">تعذر جلب الأسعار — تحقق من الاتصال.</p>}
      </div>
    </div>
  );
}