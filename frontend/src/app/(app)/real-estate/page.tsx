'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '@/lib/api';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency } from '@/lib/format';
import type { Investment } from '@/types';

interface InvestmentsResponse { investments: Investment[]; }

export default function RealEstatePage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const { data, isLoading } = useQuery<InvestmentsResponse>({
    queryKey: ['investments'],
    queryFn: () => api.getInvestments(),
  });
  const items = (data?.investments || []).filter((i: Investment) => i.asset_type === 'realestate' || (i.name || '').toLowerCase().includes('عقار') || (i.name || '').toLowerCase().includes('بيت') || (i.name || '').toLowerCase().includes('شقة'));
  const total = items.reduce((s, i: Investment) => s + Number(i.current_value ?? 0), 0);

  const createMutation = useMutation({
    mutationFn: () => api.createInvestment({ name: name.trim(), asset_type: 'realestate', quantity: 1, purchase_price: Number(value) || 0, current_price: Number(value) || 0, currency: 'DZD' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investments'] });
      toast.success('تم إضافة العقار');
      setShowCreate(false);
      setName('');
      setValue('');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر الإضافة.')),
  });

  if (isLoading) return <div className="flex justify-center py-20"><Spinner label="جاري التحميل..." /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-medium leading-9 text-gray-100">العقارات</h1>
          <p className="mt-1 text-sm text-gray-400">إجمالي: <span className="tabular-nums">{formatCurrency(total, 0)}</span></p>
        </div>
        <button type="button" onClick={() => setShowCreate(true)} className="btn-primary">+ إضافة عقار</button>
      </div>
      {items.length === 0 ? (
        <div className="card"><EmptyState icon="🏠" title="لا توجد عقارات" description="أضف عقارك (بيت، شقة، أرض...)" /></div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {items.map((inv: Investment) => (
            <div key={inv.id} className="card">
              <h3 className="text-[15px] font-medium text-gray-100">{inv.name}</h3>
              <p className="mt-2 text-2xl font-medium tabular-nums text-gray-100">{formatCurrency(inv.current_value, 0)}</p>
            </div>
          ))}
        </div>
      )}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="إضافة عقار" size="max-w-md"
        footer={<><button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1">إلغاء</button><button type="button" onClick={() => createMutation.mutate()} disabled={!name.trim() || createMutation.isPending} className="btn-primary flex-1">{createMutation.isPending ? 'جاري...' : 'إضافة'}</button></>}>
        <div className="space-y-4">
          <div><label className="block text-sm text-gray-400 mb-2">الاسم</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="شقة، بيت، أرض..." /></div>
          <div><label className="block text-sm text-gray-400 mb-2">القيمة</label><input className="input" type="number" value={value} onChange={(e) => setValue(e.target.value)} /></div>
        </div>
      </Modal>
    </div>
  );
}