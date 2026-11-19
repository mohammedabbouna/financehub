'use client';

import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '@/lib/api';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import Glyph from '@/components/ui/Glyph';
import { useToast } from '@/components/ui/Toast';
import { currencySymbol, formatCurrency, formatShortDate, daysUntil } from '@/lib/format';
import type { Contact, Debt, DebtPayment, DebtSummary, Wallet } from '@/types';

// ─── Response shapes ─────────────────────────────────────────────────────────

interface ContactsResponse {
  contacts: Contact[];
}

interface DebtsResponse {
  debts: Debt[];
  summary: DebtSummary;
}

interface WalletsResponse {
  wallets: Wallet[];
}

interface DebtDetailResponse {
  debt: Debt;
  payments: DebtPayment[];
}

// ─── Form state (numeric fields kept as raw strings, as inputs produce them) ─

interface ContactFormState {
  name: string;
  phone: string;
  notes: string;
}

interface DebtFormState {
  contact_id: string;
  direction: Debt['direction'];
  amount: string;
  due_date: string;
  notes: string;
  wallet_id: string;
}

interface PaymentFormState {
  amount: string;
  payment_date: string;
  notes: string;
  wallet_id: string;
}

const EMPTY_CONTACT_FORM: ContactFormState = { name: '', phone: '', notes: '' };
const today = () => new Date().toISOString().split('T')[0];

const emptyDebtForm = (direction: Debt['direction'] = 'lent_to', contactId = ''): DebtFormState => ({
  contact_id: contactId,
  direction,
  amount: '',
  due_date: '',
  notes: '',
  wallet_id: '',
});

const emptyPaymentForm = (): PaymentFormState => ({
  amount: '',
  payment_date: today(),
  notes: '',
  wallet_id: '',
});

// ─── Small presentational helpers ────────────────────────────────────────────

const DIRECTION_META: Record<Debt['direction'], { label: string; short: string; icon: string; color: string }> = {
  lent_to: { label: 'سلفت — لديّ دين', short: 'سلفت', icon: '📤', color: 'text-emerald-400' },
  borrowed_from: { label: 'استلفت — عليّ دين', short: 'استلفت', icon: '📥', color: 'text-amber-400' },
};

/** Arabic counted-noun agreement: 1 singular, 2 dual, 3–10 plural, 11+ singular. */
const arCount = (n: number, singular: string, dual: string, plural: string) => {
  if (n === 1) return singular;
  if (n === 2) return dual;
  if (n >= 3 && n <= 10) return plural;
  return singular;
};

function StatusBadge({ debt }: { debt: Debt }) {
  const remaining = Number(debt.remaining);
  const due = debt.due_date ? daysUntil(debt.due_date) : null;
  const overdue = remaining > 0 && due !== null && due < 0;

  if (remaining <= 0) return <span className="badge-green">مسدَّد</span>;
  if (overdue)
    return (
      <span className="badge-red">
        متأخر {arCount(Math.abs(due!), 'يوم', 'يومين', 'أيام')}
      </span>
    );
  if (Number(debt.paid_amount) > 0) return <span className="badge-blue">سداد جزئي</span>;
  return <span className="badge-yellow">بانتظار التسديد</span>;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ContactsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  // List state
  const [tab, setTab] = useState<'all' | Debt['direction']>('all');
  const [search, setSearch] = useState('');

  // Contact modal
  const [contactModal, setContactModal] = useState<{ open: boolean; editing: Contact | null }>({
    open: false,
    editing: null,
  });
  const [contactForm, setContactForm] = useState<ContactFormState>(EMPTY_CONTACT_FORM);

  // Debt modal
  const [debtModal, setDebtModal] = useState<{ open: boolean; editing: Debt | null }>({
    open: false,
    editing: null,
  });
  const [debtForm, setDebtForm] = useState<DebtFormState>(emptyDebtForm());

  // Payment modal (settle against one debt)
  const [paymentModal, setPaymentModal] = useState<{ open: boolean; debt: Debt | null }>({
    open: false,
    debt: null,
  });
  const [paymentForm, setPaymentForm] = useState<PaymentFormState>(emptyPaymentForm());

  // Payments history modal
  const [paymentsModal, setPaymentsModal] = useState<{ open: boolean; debt: Debt | null }>({
    open: false,
    debt: null,
  });

  // Confirmation for deleting a debt that still has a balance
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; debt: Debt | null; remaining: number }>({
    open: false,
    debt: null,
    remaining: 0,
  });

  // ─── Queries ───────────────────────────────────────────────────────────────

  const contactsQuery = useQuery({
    queryKey: ['contacts'],
    queryFn: async (): Promise<ContactsResponse> => api.getContacts(),
  });

  const debtsQuery = useQuery({
    queryKey: ['debts'],
    queryFn: async (): Promise<DebtsResponse> => api.getDebts(),
  });

  const walletsQuery = useQuery({
    queryKey: ['wallets'],
    queryFn: async (): Promise<WalletsResponse> => api.getWallets(),
  });

  const paymentsQuery = useQuery({
    queryKey: ['debt', paymentsModal.debt?.id],
    queryFn: async (): Promise<DebtDetailResponse> => api.getDebt(paymentsModal.debt!.id),
    enabled: paymentsModal.open && paymentsModal.debt !== null,
  });

  // ─── Derived ───────────────────────────────────────────────────────────────

  const contacts = useMemo(() => contactsQuery.data?.contacts ?? [], [contactsQuery.data]);
  const debts = useMemo(() => debtsQuery.data?.debts ?? [], [debtsQuery.data]);
  const summary = debtsQuery.data?.summary;
  const wallets = useMemo(() => walletsQuery.data?.wallets ?? [], [walletsQuery.data]);

  const filteredDebts = useMemo(
    () => (tab === 'all' ? debts : debts.filter((d) => d.direction === tab)),
    [debts, tab]
  );

  const filteredContacts = useMemo(() => {
    const q = search.trim();
    if (!q) return contacts;
    return contacts.filter((c) => c.name.includes(q) || (c.phone ?? '').includes(q));
  }, [contacts, search]);

  // ─── Mutations ─────────────────────────────────────────────────────────────

  const invalidateLedger = () => {
    queryClient.invalidateQueries({ queryKey: ['debts'] });
    queryClient.invalidateQueries({ queryKey: ['contacts'] });
    queryClient.invalidateQueries({ queryKey: ['wallets'] });
    queryClient.invalidateQueries({ queryKey: ['actions'] });
    queryClient.invalidateQueries({ queryKey: ['debt'] });
  };

  const invalidateContactsOnly = () => queryClient.invalidateQueries({ queryKey: ['contacts'] });

  const saveContactMutation = useMutation({
    mutationFn: () =>
      contactModal.editing
        ? api.updateContact(contactModal.editing.id, contactForm)
        : api.createContact(contactForm),
    onSuccess: (_data) => {
      invalidateContactsOnly();
      toast.success(contactModal.editing ? 'تم تحديث بيانات الشخص' : 'تمت إضافة الشخص بنجاح');
      setContactModal({ open: false, editing: null });
      setContactForm(EMPTY_CONTACT_FORM);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر حفظ بيانات الشخص')),
  });

  const deleteContactMutation = useMutation({
    mutationFn: (id: number) => api.deleteContact(id),
    onSuccess: () => {
      invalidateContactsOnly();
      toast.success('تم حذف الشخص');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر حذف الشخص')),
  });

  const saveDebtMutation = useMutation({
    mutationFn: () => {
      if (debtModal.editing) {
        const { contact_id, direction, amount, due_date, notes } = debtForm;
        return api.updateDebt(debtModal.editing.id, {
          contact_id: Number(contact_id),
          direction,
          amount: Number(amount),
          due_date: due_date || null,
          notes: notes || null,
        });
      }
      return api.createDebt({
        contact_id: Number(debtForm.contact_id),
        direction: debtForm.direction,
        amount: Number(debtForm.amount),
        due_date: debtForm.due_date || null,
        notes: debtForm.notes || null,
        wallet_id: debtForm.wallet_id ? Number(debtForm.wallet_id) : null,
      });
    },
    onSuccess: () => {
      invalidateLedger();
      toast.success(
        debtModal.editing
          ? 'تم تحديث الدَين بنجاح'
          : debtForm.direction === 'lent_to'
            ? 'تم تسجيل السلفة بنجاح'
            : 'تم تسجيل الاستلاف بنجاح'
      );
      setDebtModal({ open: false, editing: null });
      setDebtForm(emptyDebtForm());
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر حفظ الدَين')),
  });

  const deleteDebtMutation = useMutation({
    mutationFn: ({ id, confirm }: { id: number; confirm?: boolean }) => api.deleteDebt(id, confirm),
    onSuccess: () => {
      invalidateLedger();
      toast.success('تم حذف الدَين');
      setDeleteConfirm({ open: false, debt: null, remaining: 0 });
    },
    onError: (err, vars) => {
      const data = (err as { response?: { data?: { requires_confirmation?: boolean; remaining?: number } } })
        .response?.data;
      if (data?.requires_confirmation && !vars.confirm) {
        // Backend refuses while money is outstanding — ask the user explicitly.
        const debt = debts.find((d) => d.id === vars.id) ?? null;
        setDeleteConfirm({ open: true, debt, remaining: Number(data.remaining ?? 0) });
        return;
      }
      toast.error(apiErrorMessage(err, 'تعذر حذف الدَين'));
    },
  });

  const addPaymentMutation = useMutation({
    mutationFn: () => {
      const debt = paymentModal.debt!;
      return api.addDebtPayment(debt.id, {
        amount: Number(paymentForm.amount),
        payment_date: paymentForm.payment_date,
        notes: paymentForm.notes || null,
        wallet_id: paymentForm.wallet_id ? Number(paymentForm.wallet_id) : null,
      });
    },
    onSuccess: (_data) => {
      invalidateLedger();
      toast.success('تم تسجيل الدفعة بنجاح');
      setPaymentModal({ open: false, debt: null });
      setPaymentForm(emptyPaymentForm());
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر تسجيل الدفعة')),
  });

  const deletePaymentMutation = useMutation({
    mutationFn: ({ debtId, paymentId }: { debtId: number; paymentId: number }) =>
      api.deleteDebtPayment(debtId, paymentId),
    onSuccess: () => {
      invalidateLedger();
      toast.success('تم حذف الدفعة');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر حذف الدفعة')),
  });

  // ─── Modal openers ─────────────────────────────────────────────────────────

  const openCreateContact = () => {
    setContactForm(EMPTY_CONTACT_FORM);
    setContactModal({ open: true, editing: null });
  };

  const openEditContact = (contact: Contact) => {
    setContactForm({ name: contact.name, phone: contact.phone ?? '', notes: contact.notes ?? '' });
    setContactModal({ open: true, editing: contact });
  };

  const openCreateDebt = (contactId = '', direction: Debt['direction'] = 'lent_to') => {
    setDebtForm(emptyDebtForm(direction, contactId));
    setDebtModal({ open: true, editing: null });
  };

  const openEditDebt = (debt: Debt) => {
    setDebtForm({
      contact_id: String(debt.contact_id),
      direction: debt.direction,
      amount: String(Number(debt.amount)),
      due_date: debt.due_date ?? '',
      notes: debt.notes ?? '',
      wallet_id: '',
    });
    setDebtModal({ open: true, editing: debt });
  };

  const openPayment = (debt: Debt) => {
    setPaymentForm(emptyPaymentForm());
    setPaymentModal({ open: true, debt });
  };

  const openPayments = (debt: Debt) => setPaymentsModal({ open: true, debt });

  // ─── Render ────────────────────────────────────────────────────────────────

  if (debtsQuery.isLoading || contactsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner label="جاري تحميل الأشخاص والديون..." />
      </div>
    );
  }

  const paymentDebt = paymentModal.debt;
  const paymentRemaining = paymentDebt ? Number(paymentDebt.remaining) : 0;
  const paymentAmount = Number(paymentForm.amount || 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-medium leading-9 text-gray-100">الأشخاص والديون</h1>
          <p className="mt-1 text-sm text-gray-400">تبويان: من سلّف ومن استلف — مع تتبّع التسديد</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={openCreateContact} className="btn-secondary">
            + شخص جديد
          </button>
          <button type="button" onClick={() => openCreateDebt()} className="btn-primary">
            + دَين جديد
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="card">
            <p className="text-sm text-gray-400">لديّ (سلفت)</p>
            <p className="mt-1 text-2xl font-medium tabular-nums text-emerald-400">
              <span dir="ltr">{formatCurrency(summary.lent_to)}</span>
            </p>
            <p className="mt-1 text-xs tabular-nums text-gray-500">
              {summary.lent_to_count} {arCount(summary.lent_to_count, 'سجل', 'سجلان', 'سجلات')}
            </p>
          </div>
          <div className="card">
            <p className="text-sm text-gray-400">عليّ (استلفت)</p>
            <p className="mt-1 text-2xl font-medium tabular-nums text-amber-400">
              <span dir="ltr">{formatCurrency(summary.borrowed_from)}</span>
            </p>
            <p className="mt-1 text-xs tabular-nums text-gray-500">
              {summary.borrowed_from_count}{' '}
              {arCount(summary.borrowed_from_count, 'سجل', 'سجلان', 'سجلات')}
            </p>
          </div>
          <div className="card">
            <p className="text-sm text-gray-400">الصافي</p>
            <p
              className={`mt-1 text-2xl font-medium ${
                summary.net > 0 ? 'text-emerald-400' : summary.net < 0 ? 'text-amber-400' : 'text-gray-100'
              }`}
            >
              <span dir="ltr" className="tabular-nums">
                {summary.net > 0 ? '+' : ''}
                {formatCurrency(summary.net)}
              </span>
            </p>
            <p className="mt-1 text-xs tabular-nums text-gray-500">
              {summary.open_count} مفتوح · {summary.overdue_count} متأخر · {summary.paid_count} مسدَّد
            </p>
          </div>
        </div>
      )}

      {/* Debts */}
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-[15px] font-medium text-gray-100">سجل الديون</h3>
          <div className="flex gap-1 rounded-lg bg-gray-800/60 p-1">
            {(
              [
                { value: 'all', label: 'الكل' },
                { value: 'lent_to', label: 'سلفت' },
                { value: 'borrowed_from', label: 'استلفت' },
              ] as const
            ).map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTab(t.value)}
                className={`rounded-md px-3 py-2 text-sm transition-colors ${
                  tab === t.value ? 'bg-blue-500/15 text-blue-400' : 'text-gray-400 hover:text-gray-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {debtsQuery.isError ? (
          <EmptyState
            icon="⚠️"
            title="تعذر تحميل الديون"
            description={apiErrorMessage(debtsQuery.error, 'حدث خطأ أثناء جلب سجل الديون')}
            action={
              <button type="button" onClick={() => debtsQuery.refetch()} className="btn-primary">
                إعادة المحاولة
              </button>
            }
          />
        ) : filteredDebts.length === 0 ? (
          <EmptyState
            icon="🤝"
            title="لا توجد ديون في هذا التبويب"
            description="سجّل سلفة أو استلافاً ليظهر هنا مع حالة التسديد"
            action={
              <button type="button" onClick={() => openCreateDebt()} className="btn-primary">
                + دَين جديد
              </button>
            }
          />
        ) : (
          <div className="space-y-3">
            {filteredDebts.map((debt) => {
              const meta = DIRECTION_META[debt.direction];
              const remaining = Number(debt.remaining);
              const paid = Number(debt.paid_amount);
              const total = Number(debt.amount);
              const progress = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;

              return (
                <div
                  key={debt.id}
                  className="space-y-3 rounded-xl border border-gray-700 bg-gray-800/50 p-4"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex w-[18px] shrink-0 justify-center text-gray-500" aria-hidden="true">
                      <Glyph name={meta.icon} size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-gray-100">
                        {debt.contact_name}
                        <span className={`mr-2 text-xs ${meta.color}`}>{meta.short}</span>
                      </p>
                      <p className="text-xs text-gray-500">
                        {debt.due_date ? (
                          <>
                            الاستحقاق: <span className="font-mono">{formatShortDate(debt.due_date)}</span>
                          </>
                        ) : (
                          'بدون استحقاق'
                        )}
                        {debt.notes ? ` · ${debt.notes}` : ''}
                      </p>
                    </div>
                    <div className="w-[104px] shrink-0 space-y-1 text-left">
                      <p className="font-medium tabular-nums text-gray-100">
                        <span dir="ltr">{formatCurrency(total)}</span>
                      </p>
                      <p className="text-xs tabular-nums text-gray-500">
                        المدفوع <span dir="ltr">{formatCurrency(paid)}</span>
                      </p>
                      <p className={`text-xs tabular-nums ${remaining > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        المتبقي <span dir="ltr">{formatCurrency(remaining)}</span>
                      </p>
                    </div>
                    <StatusBadge debt={debt} />
                  </div>

                  {/* Settlement progress */}
                  <div className="progress-bar">
                    <div
                      className={`progress-bar-fill ${progress >= 100 ? 'bg-emerald-500' : 'bg-gray-500'}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {remaining > 0 && (
                      <button
                        type="button"
                        onClick={() => openPayment(debt)}
                        className="btn-primary inline-flex items-center gap-2 text-sm"
                      >
                        <Glyph name="✅" size={16} />
                        تسديد
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openPayments(debt)}
                      className="btn-secondary inline-flex items-center gap-2 text-sm"
                    >
                      <Glyph name="🧾" size={16} />
                      الدفعات
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditDebt(debt)}
                      className="btn-secondary inline-flex items-center gap-2 text-sm"
                    >
                      <Glyph name="✏️" size={16} />
                      تعديل
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteDebtMutation.mutate({ id: debt.id })}
                      disabled={deleteDebtMutation.isPending}
                      className="btn-danger inline-flex items-center gap-2 text-sm"
                    >
                      <Glyph name="🗑" size={16} />
                      حذف
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Contacts directory */}
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-[15px] font-medium text-gray-100">دليل الأشخاص ({contacts.length})</h3>
          <input
            className="input max-w-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الهاتف..."
            aria-label="بحث في الأشخاص"
          />
        </div>

        {contactsQuery.isError ? (
          <EmptyState
            icon="⚠️"
            title="تعذر تحميل الأشخاص"
            description={apiErrorMessage(contactsQuery.error, 'حدث خطأ أثناء جلب قائمة الأشخاص')}
            action={
              <button type="button" onClick={() => contactsQuery.refetch()} className="btn-primary">
                إعادة المحاولة
              </button>
            }
          />
        ) : filteredContacts.length === 0 ? (
          <EmptyState
            icon="👤"
            title={search ? 'لا نتائج مطابقة' : 'لا يوجد أشخاص بعد'}
            description={search ? 'جرّب اسماً آخر' : 'أضف أشخاصاً لتتبع السلف والاستلاف معهم'}
            action={
              !search && (
                <button type="button" onClick={openCreateContact} className="btn-primary">
                  + شخص جديد
                </button>
              )
            }
          />
        ) : (
          <div>
            {filteredContacts.map((contact) => (
              <div
                key={contact.id}
                className="flex flex-wrap items-center gap-3 border-b border-gray-100/[0.06] py-3 last:border-0 last:pb-0 first:pt-0"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-700 bg-gray-800 font-medium text-gray-300">
                  {contact.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-gray-100">{contact.name}</p>
                  <p className="truncate text-xs text-gray-500">
                    {contact.phone && (
                      <span className="inline-flex items-center gap-1 align-middle">
                        <Glyph name="📞" size={16} />
                        {contact.phone}
                      </span>
                    )}
                    {contact.phone && contact.notes ? ' · ' : ''}
                    {contact.notes ?? ''}
                  </p>
                </div>
                <div className="w-[104px] shrink-0 text-left text-sm tabular-nums">
                  <p className="text-emerald-400">
                    لديّ: <span dir="ltr">{formatCurrency(contact.total_lent, 0)}</span>
                  </p>
                  <p className="text-amber-400">
                    عليّ: <span dir="ltr">{formatCurrency(contact.total_borrowed, 0)}</span>
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => openCreateDebt(String(contact.id))}
                    className="btn-secondary text-sm"
                  >
                    + دَين
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditContact(contact)}
                    className="btn-secondary inline-flex items-center justify-center"
                    aria-label="تعديل بيانات الشخص"
                    title="تعديل"
                  >
                    <Glyph name="✏️" size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteContactMutation.mutate(contact.id)}
                    disabled={deleteContactMutation.isPending}
                    className="btn-danger inline-flex items-center justify-center"
                    aria-label="حذف الشخص"
                    title="حذف الشخص"
                  >
                    <Glyph name="🗑" size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Contact modal ─────────────────────────────────────────────────── */}
      <Modal
        open={contactModal.open}
        onClose={() => setContactModal({ open: false, editing: null })}
        title={contactModal.editing ? 'تعديل بيانات الشخص' : 'شخص جديد'}
        size="max-w-md"
        footer={
          <div className="flex w-full gap-2">
            <button
              type="button"
              onClick={() => setContactModal({ open: false, editing: null })}
              className="btn-secondary flex-1"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={() => saveContactMutation.mutate()}
              disabled={!contactForm.name.trim() || saveContactMutation.isPending}
              className="btn-primary flex-1"
            >
              {saveContactMutation.isPending ? 'جاري...' : 'حفظ'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="contact-name" className="block text-sm text-gray-400 mb-2">
              الاسم *
            </label>
            <input
              id="contact-name"
              className="input"
              value={contactForm.name}
              onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
              placeholder="مثال: أحمد"
              maxLength={100}
            />
          </div>
          <div>
            <label htmlFor="contact-phone" className="block text-sm text-gray-400 mb-2">
              الهاتف
            </label>
            <input
              id="contact-phone"
              className="input"
              value={contactForm.phone}
              onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
              placeholder="0555 00 00 00"
              maxLength={30}
            />
          </div>
          <div>
            <label htmlFor="contact-notes" className="block text-sm text-gray-400 mb-2">
              ملاحظات
            </label>
            <textarea
              id="contact-notes"
              className="input min-h-20"
              value={contactForm.notes}
              onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })}
              placeholder="صلة القرابة، مكان السكن..."
              maxLength={500}
            />
          </div>
        </div>
      </Modal>

      {/* ─── Debt modal ────────────────────────────────────────────────────── */}
      <Modal
        open={debtModal.open}
        onClose={() => setDebtModal({ open: false, editing: null })}
        title={debtModal.editing ? 'تعديل الدَين' : 'دَين جديد'}
        size="max-w-md"
        footer={
          <div className="flex w-full gap-2">
            <button
              type="button"
              onClick={() => setDebtModal({ open: false, editing: null })}
              className="btn-secondary flex-1"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={() => saveDebtMutation.mutate()}
              disabled={!debtForm.contact_id || !debtForm.amount || saveDebtMutation.isPending}
              className="btn-primary flex-1"
            >
              {saveDebtMutation.isPending ? 'جاري...' : 'حفظ'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="debt-contact" className="block text-sm text-gray-400 mb-2">
              الشخص *
            </label>
            <select
              id="debt-contact"
              className="input"
              value={debtForm.contact_id}
              onChange={(e) => setDebtForm({ ...debtForm, contact_id: e.target.value })}
            >
              <option value="">— اختر الشخص —</option>
              {contacts.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
            {contacts.length === 0 && (
              <p className="text-xs text-amber-400 mt-2">أضف شخصاً أولاً من زر «+ شخص جديد»</p>
            )}
          </div>

          <div>
            <span className="block text-sm text-gray-400 mb-2">الاتجاه *</span>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: 'lent_to', icon: '📤', label: 'أنا سلّفت', hint: 'المبلغ خرج من محفظتي' },
                  { value: 'borrowed_from', icon: '📥', label: 'أنا استلفت', hint: 'المبلغ دخل محفظتي' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDebtForm({ ...debtForm, direction: opt.value })}
                  className={`rounded-lg border p-3 text-right transition-colors ${
                    debtForm.direction === opt.value
                      ? 'border-blue-500/30 bg-blue-500/10'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <span
                    className={`flex items-center gap-2 text-sm font-medium ${
                      debtForm.direction === opt.value ? 'text-blue-400' : 'text-gray-100'
                    }`}
                  >
                    <span className="flex w-[18px] shrink-0 justify-center" aria-hidden="true">
                      <Glyph name={opt.icon} size={16} />
                    </span>
                    {opt.label}
                  </span>
                  <span className="mt-1 block text-xs text-gray-500">{opt.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="debt-amount" className="block text-sm text-gray-400 mb-2">
              المبلغ ({currencySymbol()}) *
            </label>
            <input
              id="debt-amount"
              className="input"
              type="number"
              min="0.01"
              step="0.01"
              value={debtForm.amount}
              onChange={(e) => setDebtForm({ ...debtForm, amount: e.target.value })}
            />
          </div>

          <div>
            <label htmlFor="debt-due" className="block text-sm text-gray-400 mb-2">
              تاريخ الاستحقاق (اختياري)
            </label>
            <input
              id="debt-due"
              className="input"
              type="date"
              value={debtForm.due_date}
              onChange={(e) => setDebtForm({ ...debtForm, due_date: e.target.value })}
            />
          </div>

          {!debtModal.editing && (
            <div>
              <label htmlFor="debt-wallet" className="block text-sm text-gray-400 mb-2">
                المحفظة (اختياري — تسجّل حركة المبلغ فعلياً)
              </label>
              <select
                id="debt-wallet"
                className="input"
                value={debtForm.wallet_id}
                onChange={(e) => setDebtForm({ ...debtForm, wallet_id: e.target.value })}
              >
                <option value="">بدون تحريك محفظة</option>
                {wallets.map((w) => (
                  <option key={w.id} value={String(w.id)}>
                    {w.name} — {formatCurrency(w.balance)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-2">
                {debtForm.direction === 'lent_to'
                  ? 'سيُخصم المبلغ من المحفظة (عملية سحب)'
                  : 'سيُضاف المبلغ إلى المحفظة (عملية اقتراض)'}
              </p>
            </div>
          )}

          <div>
            <label htmlFor="debt-notes" className="block text-sm text-gray-400 mb-2">
              ملاحظات
            </label>
            <textarea
              id="debt-notes"
              className="input min-h-16"
              value={debtForm.notes}
              onChange={(e) => setDebtForm({ ...debtForm, notes: e.target.value })}
              placeholder="سبب السلفة، طريقة ال..."
              maxLength={500}
            />
          </div>
        </div>
      </Modal>

      {/* ─── Payment modal ─────────────────────────────────────────────────── */}
      <Modal
        open={paymentModal.open && paymentDebt !== null}
        onClose={() => setPaymentModal({ open: false, debt: null })}
        title={`تسديد — ${paymentDebt?.contact_name ?? ''}`}
        size="max-w-md"
        footer={
          <div className="flex w-full gap-2">
            <button
              type="button"
              onClick={() => setPaymentModal({ open: false, debt: null })}
              className="btn-secondary flex-1"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={() => addPaymentMutation.mutate()}
              disabled={
                !paymentForm.amount ||
                paymentAmount <= 0 ||
                paymentAmount > paymentRemaining ||
                addPaymentMutation.isPending
              }
              className="btn-primary flex-1"
            >
              {addPaymentMutation.isPending ? 'جاري...' : 'تسجيل الدفعة'}
            </button>
          </div>
        }
      >
        {paymentDebt && (
          <div className="space-y-4">
            <div className="space-y-1 rounded-xl border border-gray-700 bg-gray-900/60 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">الأصل</span>
                <span className="font-medium tabular-nums text-gray-100">
                  <span dir="ltr">{formatCurrency(Number(paymentDebt.amount))}</span>
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">المدفوع سابقاً</span>
                <span className="font-medium tabular-nums text-gray-100">
                  <span dir="ltr">{formatCurrency(Number(paymentDebt.paid_amount))}</span>
                </span>
              </div>
              <div className="flex justify-between border-t border-gray-100/[0.06] pt-1">
                <span className="text-gray-400">المتبقي</span>
                <span className="font-medium tabular-nums text-amber-400">
                  <span dir="ltr">{formatCurrency(paymentRemaining)}</span>
                </span>
              </div>
            </div>

            <div>
              <label htmlFor="pay-amount" className="block text-sm text-gray-400 mb-2">
                المبلغ ({currencySymbol()}) *
              </label>
              <input
                id="pay-amount"
                className="input"
                type="number"
                min="0.01"
                step="0.01"
                max={paymentRemaining}
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                placeholder={`حتى ${formatCurrency(paymentRemaining)}`}
              />
              {paymentAmount > paymentRemaining && (
                <p className="text-xs text-red-400 mt-2">المبلغ أكبر من المتبقي ({formatCurrency(paymentRemaining)})</p>
              )}
            </div>

            <div>
              <label htmlFor="pay-date" className="block text-sm text-gray-400 mb-2">
                تاريخ الدفع
              </label>
              <input
                id="pay-date"
                className="input"
                type="date"
                value={paymentForm.payment_date}
                onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
              />
            </div>

            <div>
              <label htmlFor="pay-wallet" className="block text-sm text-gray-400 mb-2">
                المحفظة (اختياري)
              </label>
              <select
                id="pay-wallet"
                className="input"
                value={paymentForm.wallet_id}
                onChange={(e) => setPaymentForm({ ...paymentForm, wallet_id: e.target.value })}
              >
                <option value="">بدون تحريك محفظة</option>
                {wallets.map((w) => (
                  <option key={w.id} value={String(w.id)}>
                    {w.name} — {formatCurrency(w.balance)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-2">
                {paymentDebt.direction === 'lent_to'
                  ? 'الطرف يسدّد لي: سيُضاف المبلغ إلى المحفظة (إيداع)'
                  : 'أنا أسدّد: سيُخصم المبلغ من المحفظة (سداد)'}
              </p>
            </div>

            <div>
              <label htmlFor="pay-notes" className="block text-sm text-gray-400 mb-2">
                ملاحظات
              </label>
              <input
                id="pay-notes"
                className="input"
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                placeholder="دفعة نقدية..."
                maxLength={255}
              />
            </div>
          </div>
        )}
      </Modal>

      {/* ─── Payments history modal ────────────────────────────────────────── */}
      <Modal
        open={paymentsModal.open && paymentsModal.debt !== null}
        onClose={() => setPaymentsModal({ open: false, debt: null })}
        title={`دفعات — ${paymentsModal.debt?.contact_name ?? ''}`}
        size="max-w-md"
        footer={
          <button type="button" onClick={() => setPaymentsModal({ open: false, debt: null })} className="btn-secondary">
            إغلاق
          </button>
        }
      >
        {paymentsQuery.isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner label="جاري تحميل الدفعات..." />
          </div>
        ) : paymentsQuery.isError ? (
          <EmptyState
            icon="⚠️"
            title="تعذر تحميل الدفعات"
            description={apiErrorMessage(paymentsQuery.error, 'حدث خطأ أثناء جلب الدفعات')}
          />
        ) : (paymentsQuery.data?.payments ?? []).length === 0 ? (
          <EmptyState icon="🧾" title="لا توجد دفعات بعد" description="لم يُسجَّل أي تسديد على هذا الدَين" />
        ) : (
          <div>
            {paymentsQuery.data!.payments.map((payment) => (
              <div
                key={payment.id}
                className="flex items-center gap-3 border-b border-gray-100/[0.06] py-3 last:border-0 last:pb-0 first:pt-0"
              >
                <span className="flex w-[18px] shrink-0 justify-center text-gray-500" aria-hidden="true">
                  <Glyph name="💵" size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium tabular-nums text-gray-100">
                    <span dir="ltr">{formatCurrency(Number(payment.amount))}</span>
                  </p>
                  <p className="truncate text-xs text-gray-500">
                    <span className="font-mono">{formatShortDate(payment.payment_date)}</span>
                    {payment.notes ? ` · ${payment.notes}` : ''}
                    {payment.action_description ? ` · ${payment.action_description}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    deletePaymentMutation.mutate({
                      debtId: paymentsModal.debt!.id,
                      paymentId: payment.id,
                    })
                  }
                  disabled={deletePaymentMutation.isPending}
                  className="btn-danger inline-flex items-center justify-center"
                  aria-label="حذف الدفعة"
                  title="حذف الدفعة (يعكس حركة المحفظة)"
                >
                  <Glyph name="🗑" size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* ─── Delete confirmation (balance outstanding) ──────────────────────── */}
      <Modal
        open={deleteConfirm.open && deleteConfirm.debt !== null}
        onClose={() => setDeleteConfirm({ open: false, debt: null, remaining: 0 })}
        title="تأكيد حذف الدَين"
        size="max-w-sm"
        footer={
          <div className="flex w-full gap-2">
            <button
              type="button"
              onClick={() => setDeleteConfirm({ open: false, debt: null, remaining: 0 })}
              className="btn-secondary flex-1"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={() => deleteDebtMutation.mutate({ id: deleteConfirm.debt!.id, confirm: true })}
              disabled={deleteDebtMutation.isPending}
              className="btn-danger flex-1"
            >
              {deleteDebtMutation.isPending ? 'جاري...' : 'حذف رغم المتبقي'}
            </button>
          </div>
        }
      >
        <p className="text-sm leading-relaxed text-gray-400">
          ما زال هناك مبلغ غير مسدَّد بقيمة{' '}
          <span dir="ltr" className="font-medium tabular-nums text-red-400">
            {formatCurrency(deleteConfirm.remaining)}
          </span>
          . حذف الدَين سيلغي سجل التسديد بالكامل ولا يمكن التراجع. هل تريد المتابعة؟
        </p>
      </Modal>
    </div>
  );
}
