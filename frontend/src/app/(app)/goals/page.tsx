'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import Glyph from '@/components/ui/Glyph';
import { api, apiErrorMessage } from '@/lib/api';
import { currencySymbol, formatCurrency, formatNumber, daysUntil } from '@/lib/format';
import type { Goal } from '@/types';

/** Create form: domain-typed, with text inputs kept as raw strings. */
type GoalForm = Omit<Partial<Goal>, 'target_amount' | 'target_date'> & {
  target_amount: string;
  target_date: string;
};

interface GoalsResponse {
  goals: Goal[];
}

const INITIAL_FORM: GoalForm = {
  name: '',
  target_amount: '',
  target_date: '',
  icon: '🎯',
  color: '#8b5cf6',
};

export default function GoalsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<GoalForm>(INITIAL_FORM);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['goals'],
    queryFn: async (): Promise<GoalsResponse> => api.getGoals(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createGoal({
        name: form.name,
        target_amount: Number(form.target_amount),
        target_date: form.target_date || null,
        icon: form.icon,
        color: form.color,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      toast.success('تم إنشاء الهدف بنجاح');
      setShowCreate(false);
      setForm(INITIAL_FORM);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر إنشاء الهدف')),
  });

  const goals = data?.goals ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner label="جاري تحميل الأهداف..." />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-medium leading-9 text-gray-100">الأهداف المالية</h1>
        <button type="button" onClick={() => setShowCreate(true)} className="btn-primary">
          + هدف جديد
        </button>
      </div>

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="هدف مالي جديد"
        size="max-w-md"
        footer={
          <div className="flex w-full gap-2">
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1">
              إلغاء
            </button>
            <button
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={!form.name || !form.target_amount || createMutation.isPending}
              className="btn-primary flex-1"
            >
              {createMutation.isPending ? 'جاري...' : 'إنشاء'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="goal-name" className="block text-sm text-gray-400 mb-2">
              الاسم
            </label>
            <input
              id="goal-name"
              className="input"
              value={form.name ?? ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="مثال: شراء سيارة"
            />
          </div>
          <div>
            <label htmlFor="goal-target-amount" className="block text-sm text-gray-400 mb-2">
              المبلغ المستهدف ({currencySymbol()})
            </label>
            <input
              id="goal-target-amount"
              className="input"
              type="number"
              value={form.target_amount}
              onChange={(e) => setForm({ ...form, target_amount: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="goal-target-date" className="block text-sm text-gray-400 mb-2">
              التاريخ المستهدف (اختياري)
            </label>
            <input
              id="goal-target-date"
              className="input"
              type="date"
              value={form.target_date}
              onChange={(e) => setForm({ ...form, target_date: e.target.value })}
            />
          </div>
        </div>
      </Modal>

      {isError ? (
        <div className="card">
          <EmptyState
            icon="⚠️"
            title="تعذر تحميل الأهداف"
            description={apiErrorMessage(error, 'حدث خطأ أثناء جلب الأهداف، حاول مرة أخرى')}
            action={
              <button type="button" onClick={() => refetch()} className="btn-primary">
                إعادة المحاولة
              </button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {goals.length > 0 ? (
            goals.map((goal) => {
              const progress = goal.target_amount > 0 ? (goal.current_amount / goal.target_amount) * 100 : 0;
              const daysLeft = daysUntil(goal.target_date);
              // Arabic counted noun: 1 singular, 2 dual, 3–10 plural, 11+ singular
              const daysUnit =
                daysLeft === 2 ? 'يومين' : daysLeft !== null && daysLeft >= 3 && daysLeft <= 10 ? 'أيام' : 'يوم';
              return (
                <div key={goal.id} className={`card ${goal.is_completed ? 'border-green-500/30' : ''}`}>
                  <div className="mb-4 flex items-center gap-3">
                    <span className="flex w-[18px] shrink-0 justify-center">
                      <Glyph name={goal.icon} size={18} className="text-gray-500" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: goal.color }}
                          aria-hidden="true"
                        />
                        <h3 className="text-[15px] font-medium text-gray-100">{goal.name}</h3>
                      </div>
                      {goal.is_completed && <span className="badge-green">مكتمل</span>}
                    </div>
                  </div>

                  <div
                    className="progress-bar mb-3"
                    role="progressbar"
                    aria-label={`تقدم الهدف ${goal.name}`}
                    aria-valuenow={Math.round(Math.min(progress, 100))}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="progress-bar-fill"
                      style={{ width: `${Math.min(progress, 100)}%`, backgroundColor: goal.color }}
                    />
                  </div>

                  <div className="mb-3 flex justify-between text-sm">
                    <span className="tabular-nums text-gray-400">{formatCurrency(goal.current_amount, 0)}</span>
                    <span className="tabular-nums font-medium text-gray-100">
                      {formatCurrency(goal.target_amount, 0)}
                    </span>
                  </div>

                  <p className="text-center text-lg font-medium tabular-nums text-gray-100">
                    {formatNumber(progress, 1)}%
                  </p>

                  {daysLeft !== null && daysLeft > 0 && !goal.is_completed && (
                    <p className="mt-2 text-center text-xs text-gray-500">
                      <span className="tabular-nums">{daysLeft}</span> {daysUnit} متبقي · الادخار المطلوب شهرياً:{' '}
                      <span className="tabular-nums">
                        {formatCurrency(
                          Math.ceil((goal.target_amount - goal.current_amount) / Math.max(1, daysLeft / 30)),
                          0
                        )}
                      </span>
                    </p>
                  )}
                </div>
              );
            })
          ) : (
            <div className="col-span-full">
              <EmptyState
                icon="🎯"
                title="لا توجد أهداف مالية بعد"
                description="حدد أهدافك المالية وابدأ التوفير لتحقيقها"
                action={
                  <button type="button" onClick={() => setShowCreate(true)} className="btn-primary">
                    + هدف جديد
                  </button>
                }
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
