'use client';

import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, apiErrorMessage } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import Glyph from '@/components/ui/Glyph';
import { formatCurrency, formatDate } from '@/lib/format';
import type { CalendarDay } from '@/types';

const DAY_NAMES = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

/** Arabic counted noun: 1 singular · 2 dual · 3–10 plural · 11+ singular. */
const counted = (n: number, singular: string, dual: string, plural: string): string =>
  n === 2 ? dual : n >= 3 && n <= 10 ? plural : singular;

interface CalendarResponse {
  year: number;
  month: number;
  days: CalendarDay[];
}

export default function CalendarPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const toast = useToast();

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<CalendarResponse>({
    queryKey: ['calendar', month, year],
    queryFn: () => api.getCalendar(month, year),
  });

  useEffect(() => {
    if (isError) toast.error(apiErrorMessage(error, 'تعذر تحميل التقويم. حاول مرة أخرى.'));
  }, [isError, error, toast]);

  const days = data?.days || [];

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(year - 1); }
    else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(year + 1); }
    else setMonth(month + 1);
  };

  // Get first day of month
  const firstDay = new Date(year, month - 1, 1).getDay();

  const monthLabel = new Intl.DateTimeFormat('ar-DZ', { month: 'long', year: 'numeric' }).format(
    new Date(year, month - 1, 1)
  );

  /** Accessible name for a day cell, summarizing its income, expenses and bills. */
  const dayLabel = (day: CalendarDay): string => {
    const parts = [`يوم ${formatDate(day.date)}`];
    if (day.is_today) parts.push('اليوم');
    if (day.total_income > 0) parts.push(`دخل ${formatCurrency(day.total_income, 0)}`);
    if (day.total_expense > 0) parts.push(`مصروف ${formatCurrency(day.total_expense, 0)}`);
    if (day.bills.length > 0) {
      parts.push(`${day.bills.length} ${counted(day.bills.length, 'فاتورة', 'فاتورتين', 'فواتير')}`);
    }
    return parts.join('، ');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-medium leading-9 text-gray-100">التقويم المالي</h1>
        <div className="flex items-center gap-4">
          <button type="button" onClick={prevMonth} aria-label="الشهر السابق" className="btn-secondary px-3 py-1">→</button>
          <span aria-live="polite" className="min-w-[140px] text-center font-medium">
            {monthLabel}
          </span>
          <button type="button" onClick={nextMonth} aria-label="الشهر التالي" className="btn-secondary px-3 py-1">←</button>
        </div>
      </div>

      {isLoading ? (
        <Spinner label="جاري تحميل التقويم..." />
      ) : isError ? (
        <div className="card">
          <EmptyState
            icon="⚠️"
            title="تعذر تحميل التقويم"
            description={apiErrorMessage(error, 'حدث خطأ أثناء جلب بيانات التقويم. حاول مرة أخرى.')}
            action={
              <button type="button" onClick={() => refetch()} className="btn-secondary px-4 py-2 text-sm">
                إعادة المحاولة
              </button>
            }
          />
        </div>
      ) : days.length === 0 ? (
        <div className="card">
          <EmptyState icon="calendar" title="لا توجد أيام لعرضها" description="لا توجد بيانات مسجلة لهذا الشهر." />
        </div>
      ) : (
        <div className="card">
          {/* Day headers */}
          <div className="mb-2 grid grid-cols-7 gap-1">
            {DAY_NAMES.map((name) => (
              <div key={name} className="py-2 text-center text-sm text-gray-400">
                {name}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Empty cells for days before month start */}
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} aria-hidden="true" className="min-h-[80px] rounded-lg p-2" />
            ))}

            {days.map((day) => (
              <button
                type="button"
                key={day.date}
                aria-label={dayLabel(day)}
                className={`min-h-[80px] w-full rounded-lg border p-2 text-right text-sm transition-colors ${
                  day.is_today ? 'border-blue-500 bg-blue-500/10' : 'border-white/[0.06] hover:border-gray-600'
                }`}
              >
                <span
                  className={`mb-1 block font-mono text-xs font-medium ${
                    day.is_today ? 'text-blue-400' : 'text-gray-400'
                  }`}
                >
                  {day.day}
                </span>
                {day.total_income > 0 && (
                  <span dir="ltr" className="block text-[10px] leading-tight text-emerald-400 tabular-nums">
                    +{formatCurrency(day.total_income, 0)}
                  </span>
                )}
                {day.total_expense > 0 && (
                  <span dir="ltr" className="block text-[10px] leading-tight text-red-400 tabular-nums">
                    −{formatCurrency(day.total_expense, 0)}
                  </span>
                )}
                {day.bills.length > 0 && (
                  <span className="flex items-center gap-1 text-[10px] leading-tight text-amber-400">
                    <Glyph name="🧾" size={16} />
                    <span className="tabular-nums">{day.bills.length}</span>
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-4 text-sm text-gray-400">
        <span className="flex items-center gap-1">
          <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-emerald-400" /> دخل
        </span>
        <span className="flex items-center gap-1">
          <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-red-400" /> مصروف
        </span>
        <span className="flex items-center gap-1">
          <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-amber-400" /> فواتير
        </span>
      </div>
    </div>
  );
}
