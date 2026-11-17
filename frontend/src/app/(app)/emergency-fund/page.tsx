'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '@/lib/api';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency } from '@/lib/format';
import type { Wallet } from '@/types';

interface WalletsResponse { wallets: Wallet[]; total_assets: number; }

export default function EmergencyFundPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('صندوق الطوارئ');
  const [balance, setBalance] = useState('');
  const { data, isLoading } = useQuery<WalletsResponse>({
    queryKey: ['wallets'],
    queryFn: () => api.getWallets(),
  });
  const wallets = (data?.wallets || []).filter((w) => w.type === 'emergency');
  const total = wallets.reduce((s, w) => s + Number(w.balance), 0);

  const createMutation = useMutation({
    mutationFn: () => api.createWallet({ name: name.trim() || 'صندوق الطوارئ', type: 'emergency', balance: Number(balance) || 0 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      toast.success('تم إنشاء صندوق الطوارئ');
      setShowCreate(false);
      setName('صندوق الطوارئ');
      setBalance('');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر الإنشاء.')),
  });

  if (isLoading) return <div className="flex justify-center py-20"><Spinner label="جاري التحميل..." /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-medium leading-9 text-gray-100">صندوق الطوارئ</h1>
          <p className="mt-1 text-sm text-gray-400">إجمالي: <span className="tabular-nums">{formatCurrency(total, 0)}</span></p>
        </div>
        <button type="button" onClick={() => setShowCreate(true)} className="btn-primary">+ إنشاء</button>
      </div>
      {wallets.length === 0 ? (
        <div className="card"><EmptyState icon="🆘" title="لا يوجد صندوق طوارئ" description="أنشئ صندوق طوارئ (3-6 أشهر من المصاريف)" /></div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {wallets.map((w) => (
            <div key={w.id} className="card">
              <h3 className="text-[15px] font-medium text-gray-100">{w.name}</h3>
              <p className="mt-2 text-2xl font-medium tabular-nums text-gray-100">{formatCurrency(w.balance, 0)}</p>
            </div>
          ))}
        </div>
      )}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="إنشاء صندوق طوارئ" size="max-w-md"
        footer={<><button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1">إلغاء</button><button type="button" onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="btn-primary flex-1">{createMutation.isPending ? 'جاري...' : 'إنشاء'}</button></>}>
        <div className="space-y-4">
          <div><label className="block text-sm text-gray-400 mb-2">الاسم</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label className="block text-sm text-gray-400 mb-2">الرصيد الابتدائي</label><input className="input" type="number" value={balance} onChange={(e) => setBalance(e.target.value)} /></div>
        </div>
      </Modal>
    </div>
  );
}