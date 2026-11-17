'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '@/lib/api';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import Glyph from '@/components/ui/Glyph';
import { formatCurrency, formatNumber } from '@/lib/format';
import type { Budget, Category } from '@/types';

interface BudgetsResponse {
  budgets: Budget[];
}

interface CategoriesResponse {
  categories: Category[];
}

/** One AI suggestion row (all fields optional — produced by the model). */
interface BudgetSuggestion {
  category_id?: number;
  category_name?: string;
  category_icon?: string;
  suggested_amount?: number;
  monthly_average?: number;
  percentage?: number;
  reason?: string;
}

interface SuggestionsResponse {
  suggestions?: BudgetSuggestion[];
  message?: string;
}

/** Form fields are kept as raw strings (as the inputs produce them). */
interface BudgetFormState {
  category_id: string;
  amount: string;
  period: Budget['period'];
}

const PERIODS: { value: Budget['period']; label: string }[] = [
  { value: 'monthly', label: 'شهري' },
  { value: 'weekly', label: 'أسبوعي' },
  { value: 'yearly', label: 'سنوي' },
];

const EMPTY_BUDGET_FORM: BudgetFormState = { category_id: '', amount: '', period: 'monthly' };

export default function BudgetsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestionsResponse | null>(null);
  const [form, setForm] = useState<BudgetFormState>(EMPTY_BUDGET_FORM);

  const { data: budgetsData, isLoading, isError: budgetsError, refetch: refetchBudgets } = useQuery<BudgetsResponse>({
    queryKey: ['budgets'],
    queryFn: () => api.getBudgets(),
  });
  const { data: categoriesData, isError: categoriesError, refetch: refetchCategories } = useQuery<CategoriesResponse>({
    queryKey: ['categories'],
    queryFn: () => api.getCategories(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createBudget({
        category_id: Number(form.category_id),
        amount: Number(form.amount),
        period: form.period,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      toast.success('تم إنشاء الميزانية بنجاح');
      setShowCreate(false);
      setForm(EMPTY_BUDGET_FORM);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر إنشاء الميزانية. حاول مرة أخرى.')),
  });

  const suggestMutation = useMutation({
    mutationFn: () => api.autoSuggestBudgets(),
    onSuccess: (data: SuggestionsResponse) => setSuggestions(data ?? { suggestions: [] }),
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر الحصول على الاقتراحات الذكية. حاول مرة أخرى.')),
  });

  const budgets = budgetsData?.budgets || [];
  const categories = categoriesData?.categories?.filter((c) => c.type === 'expense') || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner label="جاري تحميل الميزانيات..." />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-medium leading-9 text-gray-100">الميزانيات الذكية</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => suggestMutation.mutate()}
            disabled={suggestMutation.isPending}
            className="btn-secondary"
          >
            {suggestMutation.isPending ? 'جاري الاقتراح...' : 'اقتراح ذكي'}
          </button>
          <button type="button" onClick={() => setShowCreate(true)} className="btn-primary">
            + ميزانية جديدة
          </button>
        </div>
      </div>

      {/* AI Suggestions */}
      {suggestions && (
        <div className="card border-blue-500/30 bg-blue-500/10">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-[15px] font-medium text-gray-100">اقتراحات الميزانية الذكية</h3>
            <button
              type="button"
              onClick={() => setSuggestions(null)}
              aria-label="إغلاق الاقتراحات"
              className="text-sm text-gray-400 transition-colors hover:text-gray-100"
            >
              إغلاق
            </button>
          </div>
          {(suggestions.suggestions ?? []).length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6">
              {suggestions.message || 'لا توجد اقتراحات حالياً'}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {(suggestions.suggestions ?? []).map((s, i) => (
                <div key={i} className="rounded-lg border border-gray-700 bg-gray-800/50 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="flex w-[18px] shrink-0 justify-center">
                      <Glyph name={s.category_icon} size={16} className="text-gray-500" />
                    </span>
                    <span className="text-sm font-medium text-gray-100">{s.category_name}</span>
                  </div>
                  <p className="text-lg font-medium text-gray-100">
                    <span className="tabular-nums">{formatCurrency(s.suggested_amount, 0)}</span>
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    المتوسط: <span className="tabular-nums">{formatCurrency(s.monthly_average, 0)}</span>
                  </p>
                  <p className="mt-1 text-xs text-gray-500">{s.reason}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="ميزانية جديدة"
        size="max-w-md"
        footer={
          <>
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1">
              إلغاء
            </button>
            <button
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={!form.category_id || !form.amount || createMutation.isPending}
              className="btn-primary flex-1"
            >
              {createMutation.isPending ? 'جاري...' : 'إنشاء'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="budget-category" className="block text-sm text-gray-400 mb-2">
              الفئة
            </label>
            {categoriesError ? (
              <div
                role="alert"
                className="flex items-center justify-between gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400"
              >
                <span>تعذر تحميل قائمة الفئات</span>
                <button type="button" onClick={() => refetchCategories()} className="underline">
                  إعادة المحاولة
                </button>
              </div>
            ) : (
              <select
                id="budget-category"
                className="input"
                value={form.category_id}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              >
                <option value="">اختر فئة</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label htmlFor="budget-amount" className="block text-sm text-gray-400 mb-2">
              الحد المالي
            </label>
            <input
              id="budget-amount"
              className="input"
              type="number"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="0"
            />
          </div>
          <div>
            <label htmlFor="budget-period" className="block text-sm text-gray-400 mb-2">
              الفترة
            </label>
            <select
              id="budget-period"
              className="input"
              value={form.period}
              onChange={(e) =>
                setForm({ ...form, period: PERIODS.find((p) => p.value === e.target.value)?.value ?? 'monthly' })
              }
            >
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Modal>

      {/* Budget Cards */}
      {budgetsError ? (
        <div role="alert" className="card py-10 text-center">
          <span className="mb-3 flex justify-center">
            <Glyph name="⚠️" size={18} className="text-gray-500" />
          </span>
          <p className="text-gray-100">تعذر تحميل الميزانيات</p>
          <p className="text-sm text-gray-500 mt-1">حدث خطأ أثناء جلب البيانات. تحقق من اتصالك ثم أعد المحاولة.</p>
          <button type="button" onClick={() => refetchBudgets()} className="btn-secondary mt-4">
            إعادة المحاولة
          </button>
        </div>
      ) : budgets.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="📋"
            title="لا توجد ميزانيات مخصصة بعد"
            description="أنشئ ميزانية أو استخدم الاقتراح الذكي"
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {budgets.map((budget) => {
            const ratio = budget.amount > 0 ? (budget.spent / budget.amount) * 100 : 0;
            const status = ratio > 100 ? 'exceeded' : ratio > 80 ? 'warning' : 'good';
            return (
              <div key={budget.id} className="card">
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex w-[18px] shrink-0 justify-center">
                    <Glyph name={budget.category_icon} size={18} className="text-gray-500" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[15px] font-medium text-gray-100">{budget.category_name}</h3>
                    <span
                      className={`badge ${status === 'exceeded' ? 'badge-red' : status === 'warning' ? 'badge-yellow' : 'badge-green'}`}
                    >
                      {status === 'exceeded' ? 'تم التجاوز' : status === 'warning' ? 'اقتراب من الحد' : 'ضمن الميزانية'}
                    </span>
                  </div>
                </div>
                <div className="progress-bar mb-2" role="progressbar" aria-valuenow={Math.round(ratio)} aria-valuemin={0} aria-valuemax={100}>
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: `${Math.min(ratio, 100)}%`,
                      backgroundColor: status === 'exceeded' ? '#e5484d' : status === 'warning' ? '#d98f3f' : '#4cc38a',
                    }}
                  />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">
                    أنفقت <span className="tabular-nums">{formatCurrency(budget.spent, 0)}</span>
                  </span>
                  <span className="text-gray-100">
                    من <span className="tabular-nums">{formatCurrency(budget.amount, 0)}</span>
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500 tabular-nums">{formatNumber(ratio, 1)}%</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
