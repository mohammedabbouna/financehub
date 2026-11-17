'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import Glyph from '@/components/ui/Glyph';
import { useToast } from '@/components/ui/Toast';
import { api, apiErrorMessage } from '@/lib/api';
import { formatCurrency, formatNumber } from '@/lib/format';
import type { Investment } from '@/types';

const ASSET_TYPES: { value: Investment['asset_type']; label: string; icon: string }[] = [
  { value: 'stock', label: 'أسهم', icon: '📊' },
  { value: 'crypto', label: 'عملات رقمية', icon: '₿' },
  { value: 'gold', label: 'ذهب', icon: '🥇' },
  { value: 'realestate', label: 'عقار', icon: '🏠' },
  { value: 'other', label: 'أخرى', icon: '📦' },
];

/** Create form: domain-typed, with numeric inputs kept as raw strings. */
type InvestmentForm = Omit<
  Partial<Investment>,
  'asset_type' | 'quantity' | 'purchase_price' | 'current_price' | 'notes'
> & {
  asset_type: Investment['asset_type'];
  quantity: string;
  purchase_price: string;
  current_price: string;
  notes: string;
  ticker: string;
};

interface InvestmentsResponse {
  investments: Investment[];
  total_value: number;
  total_cost: number;
  total_pnl: number;
}

const INITIAL_FORM: InvestmentForm = {
  asset_type: 'stock',
  name: '',
  quantity: '',
  purchase_price: '',
  current_price: '',
  notes: '',
  ticker: '',
};

export default function InvestmentsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<InvestmentForm>(INITIAL_FORM);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['investments'],
    queryFn: async (): Promise<InvestmentsResponse> => api.getInvestments(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createInvestment({
        asset_type: form.asset_type,
        name: form.name,
        quantity: Number(form.quantity),
        purchase_price: Number(form.purchase_price),
        current_price: Number(form.current_price) || Number(form.purchase_price),
        notes: form.notes || null,
        ticker: form.ticker || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investments'] });
      toast.success('تمت إضافة الأصل بنجاح');
      setShowCreate(false);
      setForm(INITIAL_FORM);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر إضافة الأصل الاستثماري')),
  });

  const refreshMutation = useMutation({
    mutationFn: (id: number) => api.refreshInvestmentPrice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investments'] });
      toast.success('تم تحديث السعر');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر تحديث السعر (تحقق من الرمز/الاتصال).')),
  });

  const handleAssetTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const matched = ASSET_TYPES.find((t) => t.value === e.target.value);
    if (matched) setForm({ ...form, asset_type: matched.value });
  };

  const investments = data?.investments ?? [];
  const totalValue = data?.total_value ?? 0;
  const totalCost = data?.total_cost ?? 0;
  const totalPnl = data?.total_pnl ?? 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner label="جاري تحميل الاستثمارات..." />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-medium leading-9 text-gray-100">محفظة الاستثمارات</h1>
          {!isError && (
            <p className="mt-1 text-sm text-gray-400">
              القيمة الإجمالية: <span className="tabular-nums text-gray-100">{formatCurrency(totalValue, 0)}</span> ·{' '}
              {totalPnl >= 0 ? 'ربح' : 'خسارة'}:{' '}
              <span
                dir="ltr"
                className={`tabular-nums ${totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
              >
                {totalPnl >= 0 ? '+' : '-'}
                {formatCurrency(Math.abs(totalPnl), 0)}
              </span>
            </p>
          )}
        </div>
        <button type="button" onClick={() => setShowCreate(true)} className="btn-primary">
          + إضافة أصل
        </button>
      </div>

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="إضافة أصل استثماري"
        size="max-w-lg"
        footer={
          <div className="flex w-full gap-2">
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1">
              إلغاء
            </button>
            <button
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={!form.name || !form.quantity || !form.purchase_price || createMutation.isPending}
              className="btn-primary flex-1"
            >
              {createMutation.isPending ? 'جاري...' : 'إضافة'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="investment-asset-type" className="block text-sm text-gray-400 mb-2">
              نوع الأصل
            </label>
            <select
              id="investment-asset-type"
              className="input"
              value={form.asset_type}
              onChange={handleAssetTypeChange}
            >
              {ASSET_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="investment-name" className="block text-sm text-gray-400 mb-2">
              الاسم
            </label>
            <input
              id="investment-name"
              className="input"
              value={form.name ?? ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="اسم الأصل"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="investment-quantity" className="block text-sm text-gray-400 mb-2">
                الكمية
              </label>
              <input
                id="investment-quantity"
                className="input"
                type="number"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="investment-purchase-price" className="block text-sm text-gray-400 mb-2">
                سعر الشراء
              </label>
              <input
                id="investment-purchase-price"
                className="input"
                type="number"
                value={form.purchase_price}
                onChange={(e) => setForm({ ...form, purchase_price: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label htmlFor="investment-current-price" className="block text-sm text-gray-400 mb-2">
              السعر الحالي (اختياري)
            </label>
            <input
              id="investment-current-price"
              className="input"
              type="number"
              value={form.current_price}
              onChange={(e) => setForm({ ...form, current_price: e.target.value })}
              placeholder={form.purchase_price || 'نفس سعر الشراء'}
            />
          </div>

          <div>
            <label htmlFor="investment-ticker" className="block text-sm text-gray-400 mb-2">
              الرمز (Ticker) — للتحديث التلقائي (AAPL, BTC, bitcoin...)
            </label>
            <input
              id="investment-ticker"
              className="input"
              dir="ltr"
              value={form.ticker}
              onChange={(e) => setForm({ ...form, ticker: e.target.value })}
              placeholder="AAPL / bitcoin"
            />
          </div>
          <div>
            <label htmlFor="investment-notes" className="block text-sm text-gray-400 mb-2">
              ملاحظات (اختياري)
            </label>
            <textarea
              id="investment-notes"
              className="input"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="ملاحظات حول الأصل"
            />
          </div>
        </div>
      </Modal>

      {isError ? (
        <div className="card">
          <EmptyState
            icon="⚠️"
            title="تعذر تحميل الاستثمارات"
            description={apiErrorMessage(error, 'حدث خطأ أثناء جلب الاستثمارات، حاول مرة أخرى')}
            action={
              <button type="button" onClick={() => refetch()} className="btn-primary">
                إعادة المحاولة
              </button>
            }
          />
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="card">
              <p className="text-sm text-gray-400">القيمة الإجمالية</p>
              <p className="mt-2 text-2xl font-medium leading-8 tabular-nums text-gray-100">
                {formatCurrency(totalValue, 0)}
              </p>
            </div>
            <div className="card">
              <p className="text-sm text-gray-400">تكلفة الشراء</p>
              <p className="mt-2 text-2xl font-medium leading-8 tabular-nums text-gray-100">
                {formatCurrency(totalCost, 0)}
              </p>
            </div>
            <div className="card">
              <p className="text-sm text-gray-400">الربح/الخسارة غير المحققة</p>
              <p
                className={`mt-2 text-2xl font-medium leading-8 tabular-nums ${
                  totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                <span dir="ltr">
                  {totalPnl >= 0 ? '+' : '-'}
                  {formatCurrency(Math.abs(totalPnl), 0)}
                </span>
              </p>
            </div>
          </div>

          <div className="card">
            <div>
              {investments.length > 0 ? (
                investments.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center gap-3 border-b border-white/[0.06] py-3 last:border-0 last:pb-0 first:pt-0"
                  >
                    <span className="flex w-[18px] shrink-0 justify-center">
                      <Glyph
                        name={ASSET_TYPES.find((t) => t.value === inv.asset_type)?.icon || '📦'}
                        size={16}
                        className="text-gray-500"
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-100">{inv.name}</p>
                      <p className="truncate text-xs text-gray-500">
                        {formatNumber(inv.quantity)} وحدة · سعر الشراء:{' '}
                        <span className="tabular-nums">{formatCurrency(inv.purchase_price)}</span> · السعر الحالي:{' '}
                        <span className="tabular-nums">{formatCurrency(inv.current_price)}</span>
                      </p>
                    </div>
                    {inv.ticker && (
                      <button
                        type="button"
                        onClick={() => refreshMutation.mutate(inv.id)}
                        disabled={refreshMutation.isPending}
                        aria-label={`تحديث سعر ${inv.name}`}
                        className="shrink-0 rounded-lg px-2 py-1 text-xs text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-100"
                        title="تحديث السعر (Yahoo/CoinGecko)"
                      >
                        🔄
                      </button>
                    )}
                    <div className="w-[104px] text-left">
                      <p className="text-sm font-medium tabular-nums text-gray-100">
                        {formatCurrency(inv.current_value, 0)}
                      </p>
                      <p className={`text-xs tabular-nums ${inv.unrealized_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        <span dir="ltr">
                          {inv.unrealized_pnl >= 0 ? '+' : '-'}
                          {formatCurrency(Math.abs(inv.unrealized_pnl), 0)}
                        </span>
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState
                  icon="inbox"
                  title="لا توجد استثمارات مسجلة بعد"
                  action={
                    <button type="button" onClick={() => setShowCreate(true)} className="btn-primary">
                      + إضافة أصل
                    </button>
                  }
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
