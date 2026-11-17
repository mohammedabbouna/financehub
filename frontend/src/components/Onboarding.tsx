'use client';

import React, { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';
import Glyph from '@/components/ui/Glyph';
import { formatCurrency } from '@/lib/format';
import type { Category, Wallet } from '@/types';

const STORAGE_KEY = 'financehub_onboarded';

/** Local (no-AI) budget split of a monthly salary — needs/wants/savings. */
const DEFAULT_SPLIT: Array<{ share: number; categoryName: string; icon: string }> = [
  { share: 0.4, categoryName: 'طعام ومشروبات', icon: '🍽️' },
  { share: 0.15, categoryName: 'فواتير', icon: '💡' },
  { share: 0.1, categoryName: 'مواصلات', icon: '🚗' },
  { share: 0.15, categoryName: 'ترفيه', icon: '🎮' },
  { share: 0.2, categoryName: 'أخرى', icon: '📌' },
];

type Step = 'wallet' | 'salary' | 'budgets' | 'done';

function isOnboarded(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return true; // no storage → don't nag on every visit
  }
}

/**
 * First-run wizard (3 steps): create a wallet → set the monthly salary →
 * apply suggested budgets. Shown once; skipped when a wallet already
 * exists or the user closed it before.
 */
export default function Onboarding() {
  const { user } = useAuth();
  const toast = useToast();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<Step>('wallet');
  const [walletName, setWalletName] = useState('المحفظة الرئيسية');
  const [walletId, setWalletId] = useState<number | null>(null);
  const [openingBalance, setOpeningBalance] = useState('');
  const [salary, setSalary] = useState('');
  const [salaryDay, setSalaryDay] = useState('1');
  const [appliedCount, setAppliedCount] = useState(0);

  const wallets = useQuery<{ wallets: Wallet[] }>({
    queryKey: ['wallets'],
    queryFn: () => api.getWallets(),
    // Always on: this query is what decides whether the wizard shows.
    enabled: !!user,
  });

  const categories = useQuery<{ categories: Category[] }>({
    queryKey: ['categories'],
    queryFn: () => api.getCategories(),
    enabled: visible && step === 'budgets',
  });

  // Decide visibility once the wallet list settles: new users only.
  React.useEffect(() => {
    if (!user) return;
    if (isOnboarded()) return;
    if (wallets.data && wallets.data.wallets.length > 0) {
      try {
        window.localStorage.setItem(STORAGE_KEY, '1');
      } catch {
        // ignore
      }
      return;
    }
    if (wallets.data && wallets.data.wallets.length === 0) setVisible(true);
  }, [user, wallets.data]);

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // ignore
    }
  };

  const createWallet = useMutation({
    mutationFn: () =>
      api.createWallet({
        name: walletName.trim() || 'المحفظة الرئيسية',
        type: 'cash',
        balance: Number(openingBalance) || 0,
      }),
    onSuccess: (data: { wallet: Wallet }) => {
      setWalletId(data.wallet.id);
      setStep('salary');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر إنشاء المحفظة.')),
  });

  const createSalary = useMutation({
    mutationFn: () => {
      const amount = Number(salary);
      const day = Math.min(28, Math.max(1, Number(salaryDay) || 1));
      const next = new Date();
      next.setDate(day);
      if (next.getTime() < Date.now()) next.setMonth(next.getMonth() + 1);
      return api.createRecurring({
        name: 'الراتب الشهري',
        frequency: 'monthly',
        next_run_date: next.toISOString().slice(0, 10),
        action_template: {
          type: 'deposit',
          amount,
          wallet_id: walletId ?? wallets.data?.wallets?.[0]?.id ?? 0,
          description: 'الراتب الشهري',
        },
      });
    },
    onSuccess: () => setStep('budgets'),
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر حفظ الراتب.')),
  });

  const createBudget = useMutation({
    mutationFn: (data: { category_id: number; amount: number }) =>
      api.createBudget({
        category_id: data.category_id,
        amount: data.amount,
        period: 'monthly',
        auto_suggested: true,
      }),
    onSettled: () => setAppliedCount((c) => c + 1),
  });

  if (!visible) return null;

  const salaryAmount = Number(salary) || 0;

  // Suggested budgets: system categories by name, split of the salary.
  const suggestions = (categories.data?.categories ?? [])
    .filter((c) => DEFAULT_SPLIT.some((s) => s.categoryName === c.name))
    .map((c) => {
      const split = DEFAULT_SPLIT.find((s) => s.categoryName === c.name)!;
      return { category: c, amount: Math.round((salaryAmount * split.share) / 100) * 100, icon: split.icon };
    });

  const applyAll = () => {
    suggestions.forEach((s) => createBudget.mutate({ category_id: s.category.id, amount: s.amount }));
  };

  const finish = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // ignore
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <div className="card w-full max-w-lg p-6">
        {/* Progress */}
        <div className="mb-5 flex items-center gap-2" aria-hidden>
          {(['wallet', 'salary', 'budgets'] as const).map((s, i) => {
            const activeIdx = ['wallet', 'salary', 'budgets'].indexOf(step);
            return (
              <span
                key={s}
                className={`h-1.5 flex-1 rounded-full ${i <= activeIdx ? 'bg-blue-500' : 'bg-gray-800'}`}
              />
            );
          })}
        </div>

        {step === 'wallet' && (
          <>
            <div className="mb-4 flex items-center gap-3">
              <Glyph name="💰" size={22} />
              <h2 id="onboarding-title" className="text-lg font-medium text-gray-100">
                أهلاً بك! أنشئ أول محفظة
              </h2>
            </div>
            <p className="mb-5 text-sm leading-6 text-gray-400">
              المحفظة هي نقطة البداية: احفظ فيها نقودك (محفظة، حساب بنكي...) وابدأ بتسجيل عملياتك.
            </p>
            <div className="space-y-4">
              <div>
                <label htmlFor="ob-wallet-name" className="mb-2 block text-sm text-gray-400">
                  اسم المحفظة
                </label>
                <input
                  id="ob-wallet-name"
                  className="input"
                  value={walletName}
                  onChange={(e) => setWalletName(e.target.value)}
                  maxLength={100}
                />
              </div>
              <div>
                <label htmlFor="ob-balance" className="mb-2 block text-sm text-gray-400">
                  الرصيد الافتتاحي (اختياري)
                </label>
                <input
                  id="ob-balance"
                  type="number"
                  min="0"
                  step="0.01"
                  className="input"
                  placeholder="0"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                  dir="ltr"
                />
              </div>
            </div>
            <div className="mt-6 flex items-center justify-between gap-3">
              <button type="button" onClick={dismiss} className="text-sm text-gray-500 hover:text-gray-300">
                تخطي
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={createWallet.isPending}
                onClick={() => createWallet.mutate()}
              >
                {createWallet.isPending ? 'جاري الإنشاء...' : 'إنشاء المحفظة ومتابعة'}
              </button>
            </div>
          </>
        )}

        {step === 'salary' && (
          <>
            <div className="mb-4 flex items-center gap-3">
              <Glyph name="💼" size={22} />
              <h2 id="onboarding-title" className="text-lg font-medium text-gray-100">
                ما راتبك الشهري؟
              </h2>
            </div>
            <p className="mb-5 text-sm leading-6 text-gray-400">
              نسجّل الراتب كمعاملة شهرية متكررة، ونستخدمه لاقتراح ميزانيات واقعية.
            </p>
            <div className="space-y-4">
              <div>
                <label htmlFor="ob-salary" className="mb-2 block text-sm text-gray-400">
                  مبلغ الراتب (دج)
                </label>
                <input
                  id="ob-salary"
                  type="number"
                  min="1"
                  step="100"
                  className="input"
                  placeholder="45000"
                  value={salary}
                  onChange={(e) => setSalary(e.target.value)}
                  dir="ltr"
                  required
                />
              </div>
              <div>
                <label htmlFor="ob-salary-day" className="mb-2 block text-sm text-gray-400">
                  يوم استلام الراتب
                </label>
                <select
                  id="ob-salary-day"
                  className="input"
                  value={salaryDay}
                  onChange={(e) => setSalaryDay(e.target.value)}
                >
                  {Array.from({ length: 28 }, (_, i) => String(i + 1)).map((d) => (
                    <option key={d} value={d}>
                      {d} من الشهر
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-between gap-3">
              <button type="button" onClick={() => setStep('wallet')} className="text-sm text-gray-500 hover:text-gray-300">
                رجوع
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={createSalary.isPending || salaryAmount <= 0}
                onClick={() => createSalary.mutate()}
              >
                {createSalary.isPending ? 'جاري الحفظ...' : 'حفظ الراتب ومتابعة'}
              </button>
            </div>
          </>
        )}

        {step === 'budgets' && (
          <>
            <div className="mb-4 flex items-center gap-3">
              <Glyph name="📋" size={22} />
              <h2 id="onboarding-title" className="text-lg font-medium text-gray-100">
                اقتراح ميزانيات من راتبك
              </h2>
            </div>
            <p className="mb-4 text-sm leading-6 text-gray-400">
              تقسيم شائع للراتب — عدّلها لاحقاً من صفحة الميزانيات:
              {salaryAmount > 0 && (
                <span className="mr-1 tabular-nums">{formatCurrency(salaryAmount, 0)}</span>
              )}
            </p>

            {categories.isLoading ? (
              <p className="text-sm text-gray-500">جاري تحميل الفئات...</p>
            ) : suggestions.length === 0 ? (
              <p className="text-sm text-gray-500">تعذر اقتراح الميزانيات — يمكنك إضافتها يدوياً لاحقاً.</p>
            ) : (
              <ul className="space-y-2">
                {suggestions.map((s) => (
                  <li
                    key={s.category.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-gray-900/60 px-3 py-2"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-sm text-gray-300">
                      <Glyph name={s.icon} size={14} />
                      <span className="truncate">{s.category.name}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-sm text-gray-200">
                      {formatCurrency(s.amount, 0)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-6 flex items-center justify-between gap-3">
              <button type="button" onClick={() => setStep('salary')} className="text-sm text-gray-500 hover:text-gray-300">
                رجوع
              </button>
              <div className="flex items-center gap-3">
                <button type="button" onClick={finish} className="text-sm text-gray-500 hover:text-gray-300">
                  تخطي
                </button>
                {appliedCount >= suggestions.length && suggestions.length > 0 ? (
                  <button type="button" className="btn-primary" onClick={finish}>
                    البدء باستخدام FinanceHub
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={createBudget.isPending || suggestions.length === 0}
                    onClick={applyAll}
                  >
                    {createBudget.isPending || appliedCount > 0
                      ? `جاري التطبيق... (${appliedCount}/${suggestions.length})`
                      : `تطبيق ${suggestions.length} ميزانيات`}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
