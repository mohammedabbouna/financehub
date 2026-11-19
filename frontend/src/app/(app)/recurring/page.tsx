'use client';

import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '@/lib/api';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import Glyph from '@/components/ui/Glyph';
import { useToast } from '@/components/ui/Toast';
import { currencySymbol, formatCurrency, formatShortDate } from '@/lib/format';
import type { Action, Category, RecurringTransaction, RecurringTemplate, Wallet } from '@/types';

interface RecurringResponse {
  recurring: RecurringTransaction[];
}

interface WalletsResponse {
  wallets: Wallet[];
}

interface CategoriesResponse {
  categories: Category[];
}

type Frequency = RecurringTransaction['frequency'];

interface RecurringFormState {
  name: string;
  type: Action['type'];
  amount: string;
  wallet_id: string;
  target_wallet_id: string;
  category_id: string;
  description: string;
  frequency: Frequency;
  next_run_date: string;
}

const TYPE_LABELS: Record<Action['type'], string> = {
  deposit: 'إيداع',
  withdraw: 'سحب',
  transfer: 'تحويل',
  invest: 'استثمار',
  borrow: 'اقتراض',
  repay: 'سداد دين',
};

/** Icon keys for the action types, rendered through <Glyph />. */
const TYPE_ICONS: Record<Action['type'], string> = {
  deposit: '💰',
  withdraw: '💸',
  transfer: '🔄',
  invest: '📈',
  borrow: '💳',
  repay: '✅',
};

const FREQUENCY_LABELS: Record<Frequency, string> = {
  daily: 'يومياً',
  weekly: 'أسبوعياً',
  monthly: 'شهرياً',
  yearly: 'سنوياً',
};

const today = () => new Date().toISOString().split('T')[0];

const emptyForm = (): RecurringFormState => ({
  name: '',
  type: 'withdraw',
  amount: '',
  wallet_id: '',
  target_wallet_id: '',
  category_id: '',
  description: '',
  frequency: 'monthly',
  next_run_date: today(),
});

/** Rebuild the form from a stored row (template fields are already decoded). */
const formFromRow = (row: RecurringTransaction): RecurringFormState => {
  const template: Partial<RecurringTemplate> = row.action_template ?? {};
  return {
    name: row.name,
    type: template.type ?? 'withdraw',
    amount: template.amount !== null && template.amount !== undefined ? String(template.amount) : '',
    wallet_id: template.wallet_id !== null && template.wallet_id !== undefined ? String(template.wallet_id) : '',
    target_wallet_id:
      template.target_wallet_id !== null && template.target_wallet_id !== undefined
        ? String(template.target_wallet_id)
        : '',
    category_id:
      template.category_id !== null && template.category_id !== undefined ? String(template.category_id) : '',
    description: template.description ?? '',
    frequency: row.frequency,
    next_run_date: row.next_run_date,
  };
};

export default function RecurringPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [modal, setModal] = useState<{ open: boolean; editing: RecurringTransaction | null }>({
    open: false,
    editing: null,
  });
  const [form, setForm] = useState<RecurringFormState>(emptyForm);

  const recurringQuery = useQuery({
    queryKey: ['recurring'],
    queryFn: async (): Promise<RecurringResponse> => api.getRecurring(),
  });

  const walletsQuery = useQuery({
    queryKey: ['wallets'],
    queryFn: async (): Promise<WalletsResponse> => api.getWallets(),
  });

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: async (): Promise<CategoriesResponse> => api.getCategories(),
  });

  const rows = useMemo(() => recurringQuery.data?.recurring ?? [], [recurringQuery.data]);
  const wallets = useMemo(() => walletsQuery.data?.wallets ?? [], [walletsQuery.data]);
  const categories = useMemo(() => categoriesQuery.data?.categories ?? [], [categoriesQuery.data]);

  const walletName = (id: number | null | undefined) =>
    id ? wallets.find((w) => w.id === id)?.name ?? 'محفظة محذوفة' : '—';

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['recurring'] });
    queryClient.invalidateQueries({ queryKey: ['actions'] });
    queryClient.invalidateQueries({ queryKey: ['wallets'] });
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name.trim(),
        frequency: form.frequency,
        next_run_date: form.next_run_date,
        action_template: {
          type: form.type,
          amount: Number(form.amount),
          wallet_id: Number(form.wallet_id),
          target_wallet_id: form.target_wallet_id ? Number(form.target_wallet_id) : null,
          category_id: form.category_id ? Number(form.category_id) : null,
          description: form.description.trim() || null,
        },
      };
      return modal.editing ? api.updateRecurring(modal.editing.id, payload) : api.createRecurring(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring'] });
      toast.success(modal.editing ? 'تم تحديث العملية المتكررة' : 'تم إنشاء العملية المتكررة');
      setModal({ open: false, editing: null });
      setForm(emptyForm());
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر حفظ العملية المتكررة')),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: number) => api.toggleRecurring(id),
    onSuccess: (data: { message?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['recurring'] });
      toast.success(data?.message ?? 'تم تحديث الحالة');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر تغيير الحالة')),
  });

  const runMutation = useMutation({
    mutationFn: (id: number) => api.runRecurring(id),
    onSuccess: () => {
      invalidateAll();
      toast.success('تم تنفيذ العملية المتكررة فوراً');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر تنفيذ العملية')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteRecurring(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring'] });
      toast.success('تم حذف العملية المتكررة');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر حذف العملية المتكررة')),
  });

  const openCreate = () => {
    setForm(emptyForm());
    setModal({ open: true, editing: null });
  };

  const openEdit = (row: RecurringTransaction) => {
    setForm(formFromRow(row));
    setModal({ open: true, editing: row });
  };

  const isTransfer = form.type === 'transfer';

  if (recurringQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner label="جاري تحميل العمليات المتكررة..." />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-medium leading-9 text-gray-100">المعاملات المتكررة</h1>
          <p className="text-sm text-gray-400 mt-1">
            تُسجَّل تلقائياً كل فترة عبر العامل الخلفي — راتب، كراء، أقساط...
          </p>
        </div>
        <button type="button" onClick={openCreate} className="btn-primary">
          + عملية متكررة
        </button>
      </div>

      <Modal
        open={modal.open}
        onClose={() => setModal({ open: false, editing: null })}
        title={modal.editing ? 'تعديل العملية المتكررة' : 'عملية متكررة جديدة'}
        size="max-w-lg"
        footer={
          <div className="flex w-full gap-2">
            <button
              type="button"
              onClick={() => setModal({ open: false, editing: null })}
              className="btn-secondary flex-1"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={
                !form.name.trim() ||
                !form.amount ||
                !form.wallet_id ||
                !form.next_run_date ||
                saveMutation.isPending
              }
              className="btn-primary flex-1"
            >
              {saveMutation.isPending ? 'جاري...' : 'حفظ'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="rec-name" className="block text-sm text-gray-400 mb-2">
              الاسم *
            </label>
            <input
              id="rec-name"
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="مثال: راتب ديسمبر، كراء الشقة"
              maxLength={200}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="rec-type" className="block text-sm text-gray-400 mb-2">
                نوع العملية *
              </label>
              <select
                id="rec-type"
                className="input"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as Action['type'] })}
              >
                {(Object.keys(TYPE_LABELS) as Action['type'][]).map((type) => (
                  <option key={type} value={type}>
                    {TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="rec-amount" className="block text-sm text-gray-400 mb-2">
                المبلغ ({currencySymbol()}) *
              </label>
              <input
                id="rec-amount"
                className="input"
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="rec-wallet" className="block text-sm text-gray-400 mb-2">
                المحفظة *
              </label>
              <select
                id="rec-wallet"
                className="input"
                value={form.wallet_id}
                onChange={(e) => setForm({ ...form, wallet_id: e.target.value })}
              >
                <option value="">— اختر —</option>
                {wallets.map((w) => (
                  <option key={w.id} value={String(w.id)}>
                    {w.name} — {formatCurrency(w.balance, 0)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="rec-target" className="block text-sm text-gray-400 mb-2">
                المحفظة الهدف {isTransfer ? '*' : '(للتحويل فقط)'}
              </label>
              <select
                id="rec-target"
                className="input"
                value={form.target_wallet_id}
                onChange={(e) => setForm({ ...form, target_wallet_id: e.target.value })}
                disabled={!isTransfer}
              >
                <option value="">—</option>
                {wallets
                  .filter((w) => String(w.id) !== form.wallet_id)
                  .map((w) => (
                    <option key={w.id} value={String(w.id)}>
                      {w.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="rec-frequency" className="block text-sm text-gray-400 mb-2">
                التكرار *
              </label>
              <select
                id="rec-frequency"
                className="input"
                value={form.frequency}
                onChange={(e) => setForm({ ...form, frequency: e.target.value as Frequency })}
              >
                {(Object.keys(FREQUENCY_LABELS) as Frequency[]).map((freq) => (
                  <option key={freq} value={freq}>
                    {FREQUENCY_LABELS[freq]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="rec-next" className="block text-sm text-gray-400 mb-2">
                التشغيل القادم *
              </label>
              <input
                id="rec-next"
                className="input"
                type="date"
                value={form.next_run_date}
                onChange={(e) => setForm({ ...form, next_run_date: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label htmlFor="rec-category" className="block text-sm text-gray-400 mb-2">
              الفئة (اختياري)
            </label>
            <select
              id="rec-category"
              className="input"
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
            >
              <option value="">بدون فئة</option>
              {categories.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name} ({c.type === 'income' ? 'دخل' : 'مصروف'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="rec-description" className="block text-sm text-gray-400 mb-2">
              الوصف
            </label>
            <input
              id="rec-description"
              className="input"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="يظهر كوصف للعملية عند التوليد"
              maxLength={1000}
            />
          </div>

          <p className="text-xs text-gray-500">
            في يوم التشغيل تُنشأ العملية وتتحرك المحفظة فعلياً (مع التحقق من الرصيد)، ثم يتقدّم الموعد
            تلقائياً للفترة التالية.
          </p>
        </div>
      </Modal>

      {recurringQuery.isError ? (
        <div className="card">
          <EmptyState
            icon="⚠️"
            title="تعذر تحميل العمليات المتكررة"
            description={apiErrorMessage(recurringQuery.error, 'حدث خطأ أثناء جلب البيانات')}
            action={
              <button type="button" onClick={() => recurringQuery.refetch()} className="btn-primary">
                إعادة المحاولة
              </button>
            }
          />
        </div>
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="calendar"
            title="لا توجد عمليات متكررة"
            description="أضف راتبك أو كراءك أو أي قسط ثابت ليُسجَّل تلقائياً كل فترة"
            action={
              <button type="button" onClick={openCreate} className="btn-primary">
                + عملية متكررة
              </button>
            }
          />
        </div>
      ) : (
        <div className="card">
          <div>
            {rows.map((row) => {
              const template = row.action_template ?? ({} as RecurringTemplate);
              const isActive = Boolean(row.is_active);

              return (
                <div
                  key={row.id}
                  className={`flex flex-wrap items-center gap-3 border-b border-gray-100/[0.06] py-3 last:border-0 last:pb-0 first:pt-0 ${
                    isActive ? '' : 'opacity-60'
                  }`}
                >
                  <span className="flex w-[18px] shrink-0 justify-center">
                    <Glyph
                      name={TYPE_ICONS[template.type ?? 'withdraw'] ?? '🔄'}
                      size={16}
                      className="text-gray-500"
                    />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-100">{row.name}</p>
                    <p className="truncate text-xs text-gray-500">
                      {TYPE_LABELS[template.type ?? 'withdraw']} · {walletName(template.wallet_id)} ·{' '}
                      {FREQUENCY_LABELS[row.frequency]}
                    </p>
                  </div>

                  <div className="w-[128px] text-left">
                    <p className="text-sm font-medium tabular-nums text-gray-100">
                      {formatCurrency(template.amount, 0)}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      القادم: <span className="font-mono tabular-nums">{formatShortDate(row.next_run_date)}</span>
                    </p>
                  </div>

                  <span className={isActive ? 'badge-green' : 'badge-yellow'}>
                    {isActive ? 'مفعّل' : 'متوقف'}
                  </span>

                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      onClick={() => runMutation.mutate(row.id)}
                      disabled={runMutation.isPending}
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-gray-800/60 hover:text-gray-100"
                      title="تشغيل الآن"
                    >
                      <Glyph name="▶" size={16} />
                      تشغيل الآن
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleMutation.mutate(row.id)}
                      disabled={toggleMutation.isPending}
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-gray-800/60 hover:text-gray-100"
                    >
                      <Glyph name={isActive ? '⏸' : '▶'} size={16} />
                      {isActive ? 'إيقاف' : 'تفعيل'}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(row)}
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-gray-800/60 hover:text-gray-100"
                    >
                      <Glyph name="✏️" size={16} />
                      تعديل
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteMutation.mutate(row.id)}
                      disabled={deleteMutation.isPending}
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-400 transition-colors hover:bg-red-600/10"
                    >
                      <Glyph name="🗑" size={16} />
                      حذف
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
