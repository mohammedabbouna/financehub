'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatShortDate } from '@/lib/format';

interface Invoice { id: number; number: string; client_name: string | null; issue_date: string; due_date: string | null; status: string; subtotal: number; vat_amount: number; total: number; }
interface InvoicesResponse { invoices: Invoice[]; summary: any[]; }

const STATUSES = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];

export default function InvoicesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [clientId, setClientId] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [vatRate, setVatRate] = useState('19');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([{ description: '', quantity: '1', unit_price: '', vat_rate: '19' }]);

  const { data: clientsData } = useQuery({ queryKey: ['clients'], queryFn: () => api.getClients() });
  const { data, isLoading, isError, refetch } = useQuery<InvoicesResponse>({
    queryKey: ['invoices'],
    queryFn: () => api.getInvoices(),
  });
  const invoices = data?.invoices || [];
  const clients = clientsData?.clients || [];

  const addItem = () => setItems([...items, { description: '', quantity: '1', unit_price: '', vat_rate: vatRate }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: string, val: string) => {
    const next = [...items];
    next[i] = { ...next[i], [field]: val };
    setItems(next);
  };

  const createMutation = useMutation({
    mutationFn: () =>
      api.createInvoice({
        client_id: clientId ? Number(clientId) : null,
        issue_date: issueDate,
        due_date: dueDate || null,
        vat_rate: Number(vatRate),
        notes: notes || null,
        items: items.map((it) => ({
          description: it.description,
          quantity: Number(it.quantity) || 1,
          unit_price: Number(it.unit_price) || 0,
          vat_rate: Number(it.vat_rate) || Number(vatRate),
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('تم إنشاء الفاتورة');
      setShowCreate(false);
      setItems([{ description: '', quantity: '1', unit_price: '', vat_rate: vatRate }]);
      setNotes('');
    },
    onError: () => toast.error('تعذر الإنشاء.'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api.updateInvoiceStatus(id, status),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['invoices'] }); toast.success('تم التحديث'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteInvoice(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['invoices'] }); toast.success('تم الحذف'); },
  });

  if (isLoading) return <div className="flex justify-center py-20"><Spinner label="جاري التحميل..." /></div>;

  const subtotal = items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);
  const vat = subtotal * (Number(vatRate) / 100);
  const total = subtotal + vat;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-medium leading-9 text-gray-100">الفواتير (Invoices)</h1>
          <p className="mt-1 text-sm text-gray-400">إدارة فواتير الأعمال (TVA 19%)</p>
        </div>
        <button type="button" onClick={() => setShowCreate(true)} className="btn-primary">+ فاتورة جديدة</button>
      </div>

      {isError ? (
        <div className="card py-10 text-center">
          <p className="text-gray-100">تعذر تحميل الفواتير</p>
          <button type="button" onClick={() => refetch()} className="btn-secondary mt-4">إعادة المحاولة</button>
        </div>
      ) : invoices.length === 0 ? (
        <div className="card"><EmptyState icon="🧾" title="لا توجد فواتير" description="أنشئ فاتورتك الأولى" /></div>
      ) : (
        <div className="card">
          <ul className="divide-y divide-white/[0.06]">
            {invoices.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-gray-200">{inv.number} · {inv.client_name || '—'}</p>
                  <p className="text-xs text-gray-500">{formatShortDate(inv.issue_date)} · {inv.status}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums text-gray-200">{formatCurrency(inv.total, 0)}</span>
                  <select className="input w-28 text-xs" value={inv.status} onChange={(e) => statusMutation.mutate({ id: inv.id, status: e.target.value })}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button type="button" className="text-xs text-rose-500 hover:text-rose-400" onClick={() => { if (confirm('حذف؟')) deleteMutation.mutate(inv.id); }}>حذف</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="فاتورة جديدة" size="max-w-2xl"
        footer={
          <>
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1">إلغاء</button>
            <button type="button" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || items.every((i) => !i.description)} className="btn-primary flex-1">
              {createMutation.isPending ? 'جاري...' : 'إنشاء'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-400 mb-2">العميل</label>
              <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">— بدون —</option>
                {clients.map((c: { id: number; name: string }) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">تاريخ الإصدار</label>
              <input className="input" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">تاريخ الاستحقاق</label>
              <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">نسبة TVA %</label>
              <input className="input" type="number" value={vatRate} onChange={(e) => setVatRate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">البنود</label>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-12 gap-2">
                  <input className="input col-span-5" placeholder="الوصف" value={it.description} onChange={(e) => updateItem(i, 'description', e.target.value)} />
                  <input className="input col-span-2" type="number" placeholder="كمية" value={it.quantity} onChange={(e) => updateItem(i, 'quantity', e.target.value)} />
                  <input className="input col-span-3" type="number" placeholder="سعر" value={it.unit_price} onChange={(e) => updateItem(i, 'unit_price', e.target.value)} />
                  <button type="button" onClick={() => removeItem(i)} className="btn-secondary col-span-2 text-xs">حذف</button>
                </div>
              ))}
              <button type="button" onClick={addItem} className="btn-secondary text-sm">+ بند</button>
            </div>
          </div>
          <div className="rounded-lg bg-gray-900/60 p-3 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">المجموع (HT)</span><span className="tabular-nums text-gray-200">{formatCurrency(subtotal, 0)}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">TVA ({vatRate}%)</span><span className="tabular-nums text-gray-200">{formatCurrency(vat, 0)}</span></div>
            <div className="flex justify-between font-medium"><span className="text-gray-200">الإجمالي (TTC)</span><span className="tabular-nums text-gray-100">{formatCurrency(total, 0)}</span></div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">ملاحظات</label>
            <textarea className="input min-h-20 resize-none" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
      </Modal>
    </div>
  );
}