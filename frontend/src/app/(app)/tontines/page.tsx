'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '@/lib/api';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatShortDate } from '@/lib/format';
import type { Tontine, TontineCycle, Wallet } from '@/types';

interface TontinesResponse {
  tontines: Tontine[];
}

interface WalletsResponse {
  wallets: Wallet[];
}

const CYCLE_STATUS: Record<TontineCycle['status'], { label: string; className: string }> = {
  paid: { label: 'مدفوعة', className: 'bg-emerald-500/15 text-emerald-400' },
  due: { label: 'مستحقة اليوم', className: 'bg-blue-500/15 text-blue-400' },
  partial: { label: 'جزئية', className: 'bg-amber-500/15 text-amber-400' },
  pending: { label: 'قادمة', className: 'bg-gray-500/15 text-gray-400' },
  overdue: { label: 'متأخرة', className: 'bg-orange-500/15 text-orange-400' },
  missed: { label: 'لم تُحصّل', className: 'bg-rose-500/15 text-rose-400' },
};

const today = () => new Date().toISOString().split('T')[0];

interface CreateForm {
  name: string;
  amount: string;
  frequency: 'weekly' | 'monthly';
  start_date: string;
  manager_name: string;
  notes: string;
}

const emptyCreate = (): CreateForm => ({
  name: '',
  amount: '',
  frequency: 'monthly',
  start_date: today(),
  manager_name: '',
  notes: '',
});

interface PaymentForm {
  member_id: string;
  due_date: string;
  amount: string;
  wallet_id: string;
  notes: string;
}

export default function TontinesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreate);
  const [showMember, setShowMember] = useState(false);
  const [memberForm, setMemberForm] = useState({ name: '', phone: '' });
  const [showPayment, setShowPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState<PaymentForm>({
    member_id: '',
    due_date: '',
    amount: '',
    wallet_id: '',
    notes: '',
  });

  const tontines = useQuery<TontinesResponse>({
    queryKey: ['tontines'],
    queryFn: () => api.getTontines(),
  });

  const detail = useQuery<{ tontine: Tontine }>({
    queryKey: ['tontines', selectedId],
    queryFn: () => api.getTontine(selectedId!),
    enabled: selectedId !== null,
  });

  const wallets = useQuery<WalletsResponse>({
    queryKey: ['wallets'],
    queryFn: () => api.getWallets(),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['tontines'] });
  };

  const create = useMutation({
    mutationFn: () =>
      api.createTontine({
        name: createForm.name.trim(),
        amount: Number(createForm.amount),
        frequency: createForm.frequency,
        start_date: createForm.start_date,
        manager_name: createForm.manager_name.trim() || undefined,
        notes: createForm.notes.trim() || undefined,
      }),
    onSuccess: (res) => {
      toast.success(res.message);
      setShowCreate(false);
      setCreateForm(emptyCreate());
      invalidate();
      setSelectedId(res.tontine.id);
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const addMember = useMutation({
    mutationFn: () =>
      api.addTontineMember(selectedId!, {
        name: memberForm.name.trim(),
        phone: memberForm.phone.trim() || undefined,
      }),
    onSuccess: (res) => {
      toast.success(res.message);
      setShowMember(false);
      setMemberForm({ name: '', phone: '' });
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['tontines', selectedId] });
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const pay = useMutation({
    mutationFn: () =>
      api.addTontinePayment(selectedId!, {
        member_id: Number(paymentForm.member_id),
        due_date: paymentForm.due_date,
        amount: paymentForm.amount ? Number(paymentForm.amount) : undefined,
        wallet_id: paymentForm.wallet_id ? Number(paymentForm.wallet_id) : undefined,
        notes: paymentForm.notes.trim() || undefined,
      }),
    onSuccess: (res) => {
      toast.success(res.message);
      setShowPayment(false);
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['tontines', selectedId] });
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const removeTontine = useMutation({
    mutationFn: (id: number) => api.deleteTontine(id),
    onSuccess: () => {
      toast.success('تم حذف العمّارية');
      setSelectedId(null);
      invalidate();
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const removeMember = useMutation({
    mutationFn: (memberId: number) => api.deleteTontineMember(selectedId!, memberId),
    onSuccess: () => {
      toast.success('تم حذف العضو');
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['tontines', selectedId] });
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const removePayment = useMutation({
    mutationFn: (paymentId: number) => api.deleteTontinePayment(selectedId!, paymentId),
    onSuccess: () => {
      toast.success('تم حذف الدفعة');
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['tontines', selectedId] });
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const openPayment = (memberId: number, dueDate: string) => {
    const t = detail.data?.tontine;
    setPaymentForm({
      member_id: String(memberId),
      due_date: dueDate,
      amount: t ? String(t.amount) : '',
      wallet_id: '',
      notes: '',
    });
    setShowPayment(true);
  };

  // ─── Selected tontine detail ────────────────────────────────────────────────
  if (selectedId !== null) {
    if (detail.isLoading || !detail.data) {
      return (
        <div className="flex justify-center py-20">
          <Spinner label="جاري تحميل العمّارية..." />
        </div>
      );
    }

    const t = detail.data.tontine;
    const current = t.current_cycle;
    const pastCycles = t.cycles.filter((c) => c.is_current);
    const upcoming = t.cycles.filter((c) => c.is_future);

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <button
              onClick={() => setSelectedId(null)}
              className="mb-2 text-sm text-gray-400 hover:text-gray-100"
            >
              → العودة للقائمة
            </button>
            <h1 className="text-2xl font-bold text-gray-100">🤝 {t.name}</h1>
            <p className="mt-1 text-sm text-gray-400">
              {formatCurrency(t.amount)} {t.frequency === 'weekly' ? 'أسبوعياً' : 'شهرياً'} ·{' '}
              {t.member_count} عضو · بداية {formatShortDate(t.start_date)}
              {t.manager_name ? ` · أمين ${t.manager_name}` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowMember(true)}
              className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-gray-100 hover:bg-gray-600"
            >
              + عضو
            </button>
            <button
              onClick={() => removeTontine.mutate(t.id)}
              disabled={removeTontine.isPending}
              className="rounded-lg border border-rose-600/50 px-4 py-2 text-sm text-rose-400 hover:bg-rose-600/10 disabled:opacity-50"
            >
              حذف
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4">
            <p className="text-sm text-gray-400">المتوقع للدورة</p>
            <p className="mt-1 text-xl font-semibold text-gray-100">{formatCurrency(t.expected_per_cycle)}</p>
          </div>
          <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4">
            <p className="text-sm text-gray-400">المحصّل إجمالاً</p>
            <p className="mt-1 text-xl font-semibold text-emerald-400">{formatCurrency(t.total_collected)}</p>
          </div>
          <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4">
            <p className="text-sm text-gray-400">الدورة القادمة</p>
            <p className="mt-1 text-xl font-semibold text-blue-400">
              {t.next_due_date ? formatShortDate(t.next_due_date) : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4">
            <p className="text-sm text-gray-400">الدورة الحالية</p>
            <p className="mt-1 text-xl font-semibold text-gray-100">
              {current ? formatShortDate(current.due_date) : '—'}
            </p>
            {current && (
              <span className={`mt-1 inline-block rounded px-2 py-0.5 text-xs ${CYCLE_STATUS[current.status].className}`}>
                {CYCLE_STATUS[current.status].label}
              </span>
            )}
          </div>
        </div>

        {/* Delinquents */}
        {t.delinquents.length > 0 && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-5">
            <h2 className="font-semibold text-rose-300">⚠ المتأخرون عن {formatShortDate(t.delinquents[0].due_date)}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {t.delinquents.map((d) => (
                <button
                  key={d.member_id}
                  onClick={() => openPayment(d.member_id, d.due_date)}
                  className="rounded-lg border border-rose-500/40 bg-gray-900/50 px-3 py-1.5 text-sm text-gray-100 hover:bg-rose-500/20"
                >
                  تسجيل دفعة · {d.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Members */}
        <div className="rounded-xl border border-gray-700 bg-gray-800/50">
          <div className="border-b border-gray-700 px-5 py-4">
            <h2 className="font-semibold text-gray-100">👥 الأعضاء</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-right text-xs text-gray-500">
                  <th className="px-5 py-3">#</th>
                  <th className="px-5 py-3">الاسم</th>
                  <th className="px-5 py-3">الهاتف</th>
                  <th className="px-5 py-3">الدور</th>
                  <th className="px-5 py-3">الاستلام</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {t.members.map((m) => (
                  <tr key={m.id} className="border-b border-gray-700/50 text-gray-300">
                    <td className="px-5 py-3">{m.position}</td>
                    <td className="px-5 py-3 text-gray-100">
                      {m.name}
                      {m.is_self && <span className="mr-2 rounded bg-blue-500/20 px-1.5 py-0.5 text-xs text-blue-400">أنا</span>}
                    </td>
                    <td className="px-5 py-3">{m.phone ?? '—'}</td>
                    <td className="px-5 py-3">{formatCurrency(t.amount)}</td>
                    <td className="px-5 py-3 text-xs text-gray-500">
                      {t.cycles.find((c) => c.receiver?.member_id === m.id) ? 'الدورة ' + (t.cycles.find((c) => c.receiver?.member_id === m.id)!.index + 1) : '—'}
                    </td>
                    <td className="px-5 py-3 text-left">
                      {current && (
                        <button
                          onClick={() => openPayment(m.id, current.due_date)}
                          className="ml-2 rounded bg-emerald-600/20 px-2 py-1 text-xs text-emerald-400 hover:bg-emerald-600/40"
                        >
                          دفع
                        </button>
                      )}
                      <button
                        onClick={() => removeMember.mutate(m.id)}
                        disabled={removeMember.isPending}
                        className="rounded bg-rose-600/20 px-2 py-1 text-xs text-rose-400 hover:bg-rose-600/40 disabled:opacity-50"
                      >
                        حذف
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Cycles */}
        <div className="rounded-xl border border-gray-700 bg-gray-800/50">
          <div className="border-b border-gray-700 px-5 py-4">
            <h2 className="font-semibold text-gray-100">📅 الدورات</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-right text-xs text-gray-500">
                  <th className="px-5 py-3">الدورة</th>
                  <th className="px-5 py-3">تاريخ الاستحقاق</th>
                  <th className="px-5 py-3">المستلم</th>
                  <th className="px-5 py-3">المحصّل</th>
                  <th className="px-5 py-3">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {[...pastCycles, ...upcoming].map((c) => (
                  <tr key={c.index} className="border-b border-gray-700/50 text-gray-300">
                    <td className="px-5 py-3">{c.index + 1}</td>
                    <td className="px-5 py-3">{formatShortDate(c.due_date)}</td>
                    <td className="px-5 py-3">{c.receiver?.name ?? '—'}</td>
                    <td className="px-5 py-3">
                      {formatCurrency(c.collected)} / {formatCurrency(c.expected)}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`rounded px-2 py-0.5 text-xs ${CYCLE_STATUS[c.status].className}`}>
                        {CYCLE_STATUS[c.status].label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Payments */}
        <div className="rounded-xl border border-gray-700 bg-gray-800/50">
          <div className="border-b border-gray-700 px-5 py-4">
            <h2 className="font-semibold text-gray-100">💵 الدفعات المسجّلة</h2>
          </div>
          {!t.payments || t.payments.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-gray-500">لا دفعات بعد.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700 text-right text-xs text-gray-500">
                    <th className="px-5 py-3">العضو</th>
                    <th className="px-5 py-3">الدورة</th>
                    <th className="px-5 py-3">المبلغ</th>
                    <th className="px-5 py-3">ملاحظات</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {t.payments.map((p) => (
                    <tr key={p.id} className="border-b border-gray-700/50 text-gray-300">
                      <td className="px-5 py-3 text-gray-100">{p.member_name}</td>
                      <td className="px-5 py-3">{formatShortDate(p.due_date)}</td>
                      <td className="px-5 py-3">{formatCurrency(p.amount)}</td>
                      <td className="px-5 py-3 text-gray-500">{p.notes ?? '—'}</td>
                      <td className="px-5 py-3 text-left">
                        <button
                          onClick={() => removePayment.mutate(p.id)}
                          disabled={removePayment.isPending}
                          className="rounded bg-rose-600/20 px-2 py-1 text-xs text-rose-400 hover:bg-rose-600/40 disabled:opacity-50"
                        >
                          حذف
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Add member modal */}
        <Modal open={showMember} onClose={() => setShowMember(false)} title="➕ إضافة عضو">
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-gray-400">الاسم *</label>
              <input
                value={memberForm.name}
                onChange={(e) => setMemberForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="مثال: سالم"
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-400">الهاتف</label>
              <input
                value={memberForm.phone}
                onChange={(e) => setMemberForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="0555 00 00 00"
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowMember(false)} className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:text-gray-100">
                إلغاء
              </button>
              <button
                onClick={() => addMember.mutate()}
                disabled={addMember.isPending || !memberForm.name.trim()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-gray-100 hover:bg-blue-500 disabled:opacity-50"
              >
                {addMember.isPending ? 'جاري الإضافة...' : 'إضافة'}
              </button>
            </div>
          </div>
        </Modal>

        {/* Record payment modal */}
        <Modal open={showPayment} onClose={() => setShowPayment(false)} title="💵 تسجيل قسط">
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-gray-400">العضو *</label>
              <select
                value={paymentForm.member_id}
                onChange={(e) => setPaymentForm((f) => ({ ...f, member_id: e.target.value }))}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
              >
                <option value="">اختر العضو...</option>
                {t.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.is_self ? '(أنا)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-400">تاريخ الدورة *</label>
              <select
                value={paymentForm.due_date}
                onChange={(e) => setPaymentForm((f) => ({ ...f, due_date: e.target.value }))}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
              >
                <option value="">اختر الدورة...</option>
                {t.cycles.map((c) => (
                  <option key={c.index} value={c.due_date}>
                    {formatShortDate(c.due_date)} ({c.status === 'paid' ? 'مدفوعة' : CYCLE_STATUS[c.status].label})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm text-gray-400">المبلغ</label>
                <input
                  type="number"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder={String(t.amount)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-400">المحفظة (اختياري)</label>
                <select
                  value={paymentForm.wallet_id}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, wallet_id: e.target.value }))}
                  className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">بدون حركة نقدية</option>
                  {(wallets.data?.wallets ?? []).map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-400">ملاحظات</label>
              <input
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="اختياري"
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <p className="text-xs text-gray-500">
              عند اختيار محفظة: قسطك يُخصم من محفظتك، وقسط عضو آخر يُضاف إليها (حركة القِطّة).
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowPayment(false)} className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:text-gray-100">
                إلغاء
              </button>
              <button
                onClick={() => pay.mutate()}
                disabled={pay.isPending || !paymentForm.member_id || !paymentForm.due_date}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-gray-100 hover:bg-emerald-500 disabled:opacity-50"
              >
                {pay.isPending ? 'جاري التسجيل...' : 'تسجيل'}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  // ─── List view ──────────────────────────────────────────────────────────────
  const list = tontines.data?.tontines ?? [];
  const totalCollected = list.reduce((sum, t) => sum + t.total_collected, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">🤝 العمّارية</h1>
          <p className="mt-1 text-sm text-gray-400">
            إدارة حلقات الادخار الدائرية — {list.length} حلقة · محصّل إجمالي {formatCurrency(totalCollected)}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-gray-100 hover:bg-blue-500"
        >
          + إنشاء عمّارية
        </button>
      </div>

      {tontines.isLoading ? (
        <div className="flex justify-center py-20">
          <Spinner label="جاري التحميل..." />
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon="🤝"
          title="لا عمّاريات بعد"
          description="أنشئ حلقة ادخار: حدّد المبلغ والتكرار وأضف الأعضاء — وسنتابع الدورات والمتخلّفين نيابة عنك."
          action={
            <button
              onClick={() => setShowCreate(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-gray-100 hover:bg-blue-500"
            >
              إنشاء أول عمّارية
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedId(t.id)}
              className="rounded-xl border border-gray-700 bg-gray-800/50 p-5 text-right transition-colors hover:border-blue-500/50 hover:bg-gray-800"
            >
              <div className="flex items-start justify-between">
                <h2 className="font-semibold text-gray-100">{t.name}</h2>
                <span
                  className={`rounded px-2 py-0.5 text-xs ${
                    t.status === 'active'
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : t.status === 'completed'
                        ? 'bg-blue-500/15 text-blue-400'
                        : 'bg-gray-500/15 text-gray-400'
                  }`}
                >
                  {t.status === 'active' ? 'نشطة' : t.status === 'completed' ? 'منتهية' : 'ملغاة'}
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold text-amber-400">{formatCurrency(t.amount)}</p>
              <p className="text-xs text-gray-500">
                {t.frequency === 'weekly' ? 'أسبوعياً' : 'شهرياً'} · {t.member_count} عضو
              </p>
              <div className="mt-4 flex items-center justify-between text-xs text-gray-400">
                <span>
                  المحصّل: <span className="text-emerald-400">{formatCurrency(t.total_collected)}</span>
                </span>
                <span>
                  {t.next_due_date ? `التالي: ${formatShortDate(t.next_due_date)}` : ''}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded bg-gray-700">
                <div
                  className="h-full rounded bg-emerald-500"
                  style={{
                    width: `${Math.min(100, t.expected_per_cycle > 0 ? (t.total_collected / (t.expected_per_cycle * Math.max(1, t.member_count))) * 100 : 0)}%`,
                  }}
                />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="🤝 إنشاء عمّارية">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-gray-400">الاسم *</label>
            <input
              value={createForm.name}
              onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="مثال: عمّارية الحي"
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm text-gray-400">المبلغ للعضو *</label>
              <input
                type="number"
                value={createForm.amount}
                onChange={(e) => setCreateForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="2000"
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-400">التكرار *</label>
              <select
                value={createForm.frequency}
                onChange={(e) => setCreateForm((f) => ({ ...f, frequency: e.target.value as 'weekly' | 'monthly' }))}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
              >
                <option value="monthly">شهري</option>
                <option value="weekly">أسبوعي</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm text-gray-400">تاريخ البداية *</label>
              <input
                type="date"
                value={createForm.start_date}
                onChange={(e) => setCreateForm((f) => ({ ...f, start_date: e.target.value }))}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-400">الأمين</label>
              <input
                value={createForm.manager_name}
                onChange={(e) => setCreateForm((f) => ({ ...f, manager_name: e.target.value }))}
                placeholder="اسم الأمين"
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-400">ملاحظات</label>
            <input
              value={createForm.notes}
              onChange={(e) => setCreateForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="اختياري"
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowCreate(false)} className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:text-gray-100">
              إلغاء
            </button>
            <button
              onClick={() => create.mutate()}
              disabled={create.isPending || !createForm.name.trim() || !createForm.amount}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-gray-100 hover:bg-blue-500 disabled:opacity-50"
            >
              {create.isPending ? 'جاري الإنشاء...' : 'إنشاء'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
