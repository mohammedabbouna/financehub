'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import Glyph from '@/components/ui/Glyph';
import { useToast } from '@/components/ui/Toast';
import { api, apiErrorMessage } from '@/lib/api';
import { currencySymbol, formatCurrency, formatShortDate } from '@/lib/format';
import type { Bill } from '@/types';

/** Create form: domain-typed, with numeric inputs kept as raw strings. */
type BillForm = Omit<Partial<Bill>, 'amount' | 'due_date' | 'reminder_days_before'> & {
  amount: string;
  due_date: string;
  reminder_days_before: string;
};

interface BillsResponse {
  bills: Bill[];
}

interface UpcomingBillsResponse {
  bills: Bill[];
  total_due: number;
}

const INITIAL_FORM: BillForm = {
  name: '',
  amount: '',
  due_date: '',
  reminder_days_before: '3',
};

export default function BillsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<BillForm>(INITIAL_FORM);

  const billsQuery = useQuery({
    queryKey: ['bills'],
    queryFn: async (): Promise<BillsResponse> => api.getBills(),
  });
  const upcomingQuery = useQuery({
    queryKey: ['upcoming-bills-30'],
    queryFn: async (): Promise<UpcomingBillsResponse> => api.getUpcomingBills(30),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createBill({
        name: form.name,
        amount: Number(form.amount),
        due_date: form.due_date,
        reminder_days_before: Number(form.reminder_days_before || 3),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      queryClient.invalidateQueries({ queryKey: ['upcoming-bills-30'] });
      toast.success('تمت إضافة الفاتورة بنجاح');
      setShowCreate(false);
      setForm(INITIAL_FORM);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر إضافة الفاتورة')),
  });

  const payMutation = useMutation({
    mutationFn: (id: number) => api.markBillPaid(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      queryClient.invalidateQueries({ queryKey: ['upcoming-bills-30'] });
      toast.success('تم تحديد الفاتورة كمدفوعة');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر تحديد الفاتورة كمدفوعة')),
  });

  const bills = billsQuery.data?.bills ?? [];
  const upcoming = upcomingQuery.data?.bills ?? [];
  const totalDue = upcomingQuery.data?.total_due ?? 0;
  const showUpcoming = !upcomingQuery.isError && upcoming.length > 0;

  if (billsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner label="جاري تحميل الفواتير..." />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-medium leading-9 text-gray-100">الفواتير</h1>
          {showUpcoming && (
            <p className="mt-1 text-sm text-amber-400">
              {upcoming.length} فاتورة مستحقة بقيمة{' '}
              <span className="tabular-nums">{formatCurrency(totalDue, 0)}</span> خلال 30 يوماً
            </p>
          )}
        </div>
        <button type="button" onClick={() => setShowCreate(true)} className="btn-primary">
          + إضافة فاتورة
        </button>
      </div>

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="فاتورة جديدة"
        size="max-w-md"
        footer={
          <div className="flex w-full gap-2">
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1">
              إلغاء
            </button>
            <button
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={!form.name || !form.amount || !form.due_date || createMutation.isPending}
              className="btn-primary flex-1"
            >
              {createMutation.isPending ? 'جاري...' : 'إضافة'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="bill-name" className="block text-sm text-gray-400 mb-2">
              الاسم
            </label>
            <input
              id="bill-name"
              className="input"
              value={form.name ?? ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="اسم الفاتورة"
            />
          </div>
          <div>
            <label htmlFor="bill-amount" className="block text-sm text-gray-400 mb-2">
              المبلغ ({currencySymbol()})
            </label>
            <input
              id="bill-amount"
              className="input"
              type="number"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="bill-due-date" className="block text-sm text-gray-400 mb-2">
              تاريخ الاستحقاق
            </label>
            <input
              id="bill-due-date"
              className="input"
              type="date"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="bill-reminder-days" className="block text-sm text-gray-400 mb-2">
              التذكير قبل (أيام)
            </label>
            <input
              id="bill-reminder-days"
              className="input"
              type="number"
              value={form.reminder_days_before}
              onChange={(e) => setForm({ ...form, reminder_days_before: e.target.value })}
            />
          </div>
        </div>
      </Modal>

      {billsQuery.isError ? (
        <div className="card">
          <EmptyState
            icon="⚠️"
            title="تعذر تحميل الفواتير"
            description={apiErrorMessage(billsQuery.error, 'حدث خطأ أثناء جلب الفواتير، حاول مرة أخرى')}
            action={
              <button type="button" onClick={() => billsQuery.refetch()} className="btn-primary">
                إعادة المحاولة
              </button>
            }
          />
        </div>
      ) : (
        <>
          {/* Upcoming */}
          {upcomingQuery.isError ? (
            <div className="card border-amber-500/20">
              <EmptyState
                icon="⚠️"
                title="تعذر تحميل الفواتير المستحقة"
                description={apiErrorMessage(upcomingQuery.error, 'حدث خطأ أثناء جلب الفواتير المستحقة')}
                action={
                  <button type="button" onClick={() => upcomingQuery.refetch()} className="btn-secondary">
                    إعادة المحاولة
                  </button>
                }
              />
            </div>
          ) : (
            showUpcoming && (
              <div className="card border-amber-500/20">
                <h3 className="mb-4 text-[15px] font-medium text-amber-400">فواتير مستحقة قريباً</h3>
                <div>
                  {upcoming.map((bill) => (
                    <div
                      key={bill.id}
                      className="flex items-center gap-3 border-b border-white/[0.06] py-3 last:border-0 last:pb-0 first:pt-0"
                    >
                      <span className="flex w-[18px] shrink-0 justify-center">
                        <Glyph name={bill.category_icon || '🧾'} size={16} className="text-gray-500" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-100">{bill.name}</p>
                        <p className="truncate text-xs text-gray-500">
                          تاريخ الاستحقاق: <span className="font-mono">{formatShortDate(bill.due_date)}</span>
                        </p>
                      </div>
                      <p className="w-[104px] text-left text-sm font-medium tabular-nums text-gray-100">
                        {formatCurrency(bill.amount, 0)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}

          {/* All Bills */}
          <div className="card">
            <h3 className="mb-4 text-[15px] font-medium text-gray-100">جميع الفواتير</h3>
            <div>
              {bills.length > 0 ? (
                bills.map((bill) => (
                  <div
                    key={bill.id}
                    className="flex items-center gap-3 border-b border-white/[0.06] py-3 last:border-0 last:pb-0 first:pt-0"
                  >
                    <span className="flex w-[18px] shrink-0 justify-center">
                      <Glyph name={bill.category_icon || '🧾'} size={16} className="text-gray-500" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-100">{bill.name}</p>
                      <p className="truncate text-xs text-gray-500">
                        <span className="font-mono">{formatShortDate(bill.due_date)}</span>
                        {bill.category_name ? ` · ${bill.category_name}` : ''}
                      </p>
                    </div>
                    <div className="w-[104px] text-left">
                      <p className="text-sm font-medium tabular-nums text-gray-100">
                        {formatCurrency(bill.amount, 0)}
                      </p>
                      {bill.is_paid ? (
                        <span className="badge-green">مدفوعة</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => payMutation.mutate(bill.id)}
                          className="text-xs text-blue-400 transition-colors hover:text-blue-300"
                          disabled={payMutation.isPending}
                        >
                          تحديد كمدفوعة
                        </button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState
                  icon="receipt"
                  title="لا توجد فواتير مسجلة"
                  action={
                    <button type="button" onClick={() => setShowCreate(true)} className="btn-primary">
                      + إضافة فاتورة
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
