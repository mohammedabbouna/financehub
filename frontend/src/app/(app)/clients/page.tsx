'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '@/lib/api';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';

interface Client { id: number; name: string; email: string | null; phone: string | null; address: string | null; tax_id: string | null; is_supplier: boolean; notes: string | null; }
interface ClientsResponse { clients: Client[]; }

export default function ClientsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', tax_id: '', is_supplier: false, notes: '' });

  const { data, isLoading } = useQuery<ClientsResponse>({
    queryKey: ['clients'],
    queryFn: () => api.getClients(),
  });
  const clients = data?.clients || [];

  const createMutation = useMutation({
    mutationFn: () => api.createClient({ ...form, is_supplier: form.is_supplier }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success('تم إنشاء العميل');
      setShowCreate(false);
      setForm({ name: '', email: '', phone: '', address: '', tax_id: '', is_supplier: false, notes: '' });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر الإنشاء.')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteClient(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['clients'] }); toast.success('تم الحذف'); },
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر الحذف.')),
  });

  if (isLoading) return <div className="flex justify-center py-20"><Spinner label="جاري التحميل..." /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-medium leading-9 text-gray-100">العملاء</h1>
          <p className="mt-1 text-sm text-gray-400">إدارة العملاء والموردين</p>
        </div>
        <button type="button" onClick={() => setShowCreate(true)} className="btn-primary">+ عميل جديد</button>
      </div>
      {clients.length === 0 ? (
        <div className="card"><EmptyState icon="👥" title="لا توجد عملاء" description="أضف عميلك الأول" /></div>
      ) : (
        <div className="card">
          <ul className="divide-y divide-white/[0.06]">
            {clients.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-gray-200">{c.name} {c.is_supplier && <span className="badge bg-gray-800 text-gray-400 text-[10px]">مورد</span>}</p>
                  <p className="text-xs text-gray-500">{c.email || ''} {c.phone ? '· ' + c.phone : ''}</p>
                </div>
                <button type="button" className="text-xs text-rose-500 hover:text-rose-400" onClick={() => { if (confirm('حذف؟')) deleteMutation.mutate(c.id); }}>حذف</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="عميل جديد" size="max-w-md"
        footer={<><button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1">إلغاء</button><button type="button" onClick={() => createMutation.mutate()} disabled={!form.name.trim() || createMutation.isPending} className="btn-primary flex-1">{createMutation.isPending ? 'جاري...' : 'إنشاء'}</button></>}>
        <div className="space-y-4">
          <div><label className="block text-sm text-gray-400 mb-2">الاسم</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="block text-sm text-gray-400 mb-2">البريد</label><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><label className="block text-sm text-gray-400 mb-2">الهاتف</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><label className="block text-sm text-gray-400 mb-2">العنوان</label><input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div><label className="block text-sm text-gray-400 mb-2">الرقم الضريبي</label><input className="input" value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={form.is_supplier} onChange={(e) => setForm({ ...form, is_supplier: e.target.checked })} /> مورد</label>
        </div>
      </Modal>
    </div>
  );
}