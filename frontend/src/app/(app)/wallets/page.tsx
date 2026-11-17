'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '@/lib/api';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import Glyph from '@/components/ui/Glyph';
import { formatCurrency } from '@/lib/format';
import type { Wallet } from '@/types';

const WALLET_TYPES: { value: Wallet['type']; label: string; icon: string }[] = [
  { value: 'cash', label: 'نقدي', icon: '💵' },
  { value: 'bank', label: 'بنكي', icon: '🏦' },
  { value: 'investment', label: 'استثماري', icon: '📈' },
  { value: 'savings', label: 'ادخاري', icon: '🐷' },
  { value: 'emergency', label: 'طوارئ', icon: '🆘' },
];

interface WalletsResponse {
  wallets: Wallet[];
  total_assets: number;
}

const EMPTY_WALLET_FORM: Partial<Wallet> = {
  name: '',
  type: 'cash',
  currency: 'DZD',
  icon: '💰',
  color: '#3b82f6',
  balance: 0,
};

export default function WalletsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<Partial<Wallet>>(EMPTY_WALLET_FORM);
  const [editingWallet, setEditingWallet] = useState<Wallet | null>(null);
  const [editForm, setEditForm] = useState<Partial<Wallet>>(EMPTY_WALLET_FORM);
  const [originalBalance, setOriginalBalance] = useState<number>(0);

  const { data, isLoading, isError, refetch } = useQuery<WalletsResponse>({
    queryKey: ['wallets'],
    queryFn: () => api.getWallets(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createWallet({
        ...form,
        name: (form.name ?? '').trim(),
        type: form.type ?? 'cash',
        balance: Number(form.balance ?? 0),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      toast.success('تم إنشاء المحفظة بنجاح');
      setShowCreate(false);
      setForm(EMPTY_WALLET_FORM);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر إنشاء المحفظة. حاول مرة أخرى.')),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: number) => api.archiveWallet(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      toast.success('تمت أرشفة المحفظة بنجاح');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر أرشفة المحفظة. حاول مرة أخرى.')),
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      const data: Partial<Wallet> & { balance?: number } = {
        name: (editForm.name ?? '').trim(),
        type: editForm.type,
        color: editForm.color,
      };
      if (Number(editForm.balance ?? 0) !== originalBalance) {
        data.balance = Number(editForm.balance ?? 0);
      }
      return api.updateWallet(editingWallet!.id, data);
    },
    onSuccess: (res: { regularization?: { type: string; amount: number } | null }) => {
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['actions'] });
      if (res?.regularization) {
        const r = res.regularization;
        toast.success(
          `تم التحديث — regularisation d'un écart de caisse: ${r.type === 'deposit' ? '+' : '-'}${r.amount}`
        );
      } else {
        toast.success('تم تحديث المحفظة بنجاح');
      }
      setEditingWallet(null);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر تحديث المحفظة. حاول مرة أخرى.')),
  });

  const wallets = data?.wallets || [];
  const totalAssets = data?.total_assets || 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner label="جاري تحميل المحافظ..." />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-medium leading-9 text-gray-100">المحافظ المالية</h1>
          <p className="mt-1 text-sm text-gray-400">
            إجمالي الأصول:{' '}
            <span className="tabular-nums">{formatCurrency(totalAssets, 0)}</span>
          </p>
        </div>
        <button type="button" onClick={() => setShowCreate(true)} className="btn-primary">
          + إضافة محفظة
        </button>
      </div>

      {/* Create Modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="إضافة محفظة جديدة"
        size="max-w-md"
        footer={
          <>
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1">
              إلغاء
            </button>
            <button
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={!form.name?.trim() || createMutation.isPending}
              className="btn-primary flex-1"
            >
              {createMutation.isPending ? 'جاري...' : 'إنشاء'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="wallet-name" className="block text-sm text-gray-400 mb-2">
              الاسم
            </label>
            <input
              id="wallet-name"
              className="input"
              value={form.name ?? ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="اسم المحفظة"
            />
          </div>
          <div>
            <label htmlFor="wallet-type" className="block text-sm text-gray-400 mb-2">
              النوع
            </label>
            <select
              id="wallet-type"
              className="input"
              value={form.type ?? 'cash'}
              onChange={(e) =>
                setForm({
                  ...form,
                  type: WALLET_TYPES.find((t) => t.value === e.target.value)?.value ?? 'cash',
                })
              }
            >
              {WALLET_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="wallet-balance" className="block text-sm text-gray-400 mb-2">
              الرصيد الابتدائي
            </label>
            <input
              id="wallet-balance"
              className="input"
              type="number"
              value={form.balance ?? 0}
              onChange={(e) => setForm({ ...form, balance: Number(e.target.value) || 0 })}
            />
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={!!editingWallet}
        onClose={() => setEditingWallet(null)}
        title="تعديل المحفظة"
        size="max-w-md"
        footer={
          <>
            <button type="button" onClick={() => setEditingWallet(null)} className="btn-secondary flex-1">
              إلغاء
            </button>
            <button
              type="button"
              onClick={() => updateMutation.mutate()}
              disabled={!editForm.name?.trim() || updateMutation.isPending}
              className="btn-primary flex-1"
            >
              {updateMutation.isPending ? 'جاري...' : 'حفظ'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="edit-wallet-name" className="block text-sm text-gray-400 mb-2">
              الاسم
            </label>
            <input
              id="edit-wallet-name"
              className="input"
              value={editForm.name ?? ''}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="edit-wallet-type" className="block text-sm text-gray-400 mb-2">
              النوع
            </label>
            <select
              id="edit-wallet-type"
              className="input"
              value={editForm.type ?? 'cash'}
              onChange={(e) =>
                setEditForm({
                  ...editForm,
                  type: WALLET_TYPES.find((t) => t.value === e.target.value)?.value ?? 'cash',
                })
              }
            >
              {WALLET_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="edit-wallet-balance" className="block text-sm text-gray-400 mb-2">
              الرصيد (regularisation d'un écart de caisse)
            </label>
            <input
              id="edit-wallet-balance"
              className="input"
              type="number"
              value={editForm.balance ?? 0}
              onChange={(e) => setEditForm({ ...editForm, balance: Number(e.target.value) || 0 })}
            />
            <p className="mt-1 text-xs text-gray-500">
              تغيير الرصيد يُسجَّل كحركة (regularisation) بالموجب أو السالب
            </p>
          </div>
          <div>
            <label htmlFor="edit-wallet-color" className="block text-sm text-gray-400 mb-2">
              اللون
            </label>
            <input
              id="edit-wallet-color"
              className="input"
              type="color"
              value={editForm.color ?? '#3b82f6'}
              onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
            />
          </div>
        </div>
      </Modal>

      {/* Wallet list / error / empty */}
      {isError ? (
        <div role="alert" className="card py-10 text-center">
          <span className="mb-3 flex justify-center">
            <Glyph name="⚠️" size={18} className="text-gray-500" />
          </span>
          <p className="text-gray-100">تعذر تحميل المحافظ</p>
          <p className="text-sm text-gray-500 mt-1">حدث خطأ أثناء جلب البيانات. تحقق من اتصالك ثم أعد المحاولة.</p>
          <button type="button" onClick={() => refetch()} className="btn-secondary mt-4">
            إعادة المحاولة
          </button>
        </div>
      ) : wallets.length === 0 ? (
        <div className="card">
          <EmptyState icon="👛" title="لا توجد محافظ بعد" description="أنشئ محفظتك الأولى لتبدأ بتتبع أموالك" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {wallets.map((wallet) => (
            <div key={wallet.id} className="card">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex w-[18px] shrink-0 justify-center">
                    <Glyph name={wallet.icon} size={18} className="text-gray-500" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: wallet.color }}
                        aria-hidden="true"
                      />
                      <h3 className="text-[15px] font-medium text-gray-100">{wallet.name}</h3>
                    </div>
                    <span
                      className={`badge ${wallet.type === 'bank' ? 'badge-blue' : wallet.type === 'savings' ? 'badge-green' : wallet.type === 'investment' ? 'badge-purple' : wallet.type === 'emergency' ? 'badge-red' : 'badge-yellow'}`}
                    >
                      {WALLET_TYPES.find((t) => t.value === wallet.type)?.label || wallet.type}
                    </span>
                  </div>
                </div>
                {!wallet.is_archived && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingWallet(wallet);
                        setEditForm({
                          name: wallet.name,
                          type: wallet.type,
                          color: wallet.color,
                          balance: wallet.balance,
                        });
                        setOriginalBalance(Number(wallet.balance));
                      }}
                      aria-label={`تعديل محفظة ${wallet.name}`}
                      className="text-sm text-gray-500 transition-colors hover:text-gray-100"
                    >
                      تعديل
                    </button>
                    <button
                      type="button"
                      onClick={() => archiveMutation.mutate(wallet.id)}
                      aria-label={`أرشفة محفظة ${wallet.name}`}
                      className="text-sm text-gray-500 transition-colors hover:text-gray-100"
                    >
                      أرشفة
                    </button>
                  </div>
                )}
              </div>
              <p className="text-2xl font-medium tabular-nums text-gray-100">{formatCurrency(wallet.balance, 0)}</p>
              {wallet.is_archived && (
                <span className="badge mt-2 bg-gray-800 text-gray-400">مؤرشفة</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
