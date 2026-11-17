'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, apiErrorMessage } from '@/lib/api';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import Glyph from '@/components/ui/Glyph';
import { formatCurrency, formatNumber } from '@/lib/format';
import type { MonthlyReport } from '@/types';

/** جانفي → ديسمبر (Algerian month names). */
const MONTH_NAMES = [
  'جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان',
  'جويلية', 'أوت', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

/** Last 12 months, newest first (past-only — the API rejects future months). */
function recentMonths(): Array<{ year: number; month: number }> {
  const out: Array<{ year: number; month: number }> = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return out;
}

function Delta({ delta, invert = false }: { delta: { value: number; percent: number }; invert?: boolean }) {
  const up = delta.value >= 0;
  // For expenses, "up" is bad — color accordingly while keeping the arrow honest.
  const good = invert ? !up : up;
  return (
    <span className={`inline-flex items-center gap-1 text-xs tabular-nums ${good ? 'text-emerald-400' : 'text-rose-400'}`}>
      <span aria-hidden>{up ? '▲' : '▼'}</span>
      {formatNumber(Math.abs(delta.percent), 1)}%
    </span>
  );
}

function SummaryCard({ label, value, icon, tone, footer }: {
  label: string;
  value: number;
  icon: string;
  tone: string;
  footer?: React.ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">{label}</p>
        <Glyph name={icon} size={16} />
      </div>
      <p className={`mt-2 text-2xl font-medium tabular-nums ${tone}`}>{formatCurrency(value, 0)}</p>
      {footer ? <div className="mt-2">{footer}</div> : null}
    </div>
  );
}

export default function ReportsPage() {
  const options = recentMonths();
  const [sel, setSel] = useState(options[0]);
  const printableRef = React.useRef<HTMLDivElement>(null);

  const report = useQuery({
    queryKey: ['report', sel.year, sel.month],
    queryFn: () => api.getMonthlyReport(sel.year, sel.month),
    placeholderData: (prev) => prev,
  });

  if (report.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner label="جاري توليد التقرير..." />
      </div>
    );
  }

  if (report.isError || !report.data) {
    return <EmptyState icon="⚠️" title="تعذّر توليد التقرير" description={apiErrorMessage(report.error)} />;
  }

  const r: MonthlyReport = report.data.report;
  const s = r.summary;
  const maxCat = r.categories.length > 0 ? Math.max(...r.categories.map((c) => c.total)) : 0;

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-medium leading-9 text-gray-100">التقرير الشهري</h1>
          <p className="mt-1 text-sm text-gray-500">
            أرقام فعلية + سرد {r.ai_used ? 'مدعوم بالذكاء الاصطناعي' : 'محلّي'} + 3 توصيات عملية
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="report-month">الشهر</label>
          <select
            id="report-month"
            className="input w-44"
            value={`${sel.year}-${sel.month}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split('-').map(Number);
              setSel({ year: y, month: m });
            }}
          >
            {options.map((o) => (
              <option key={`${o.year}-${o.month}`} value={`${o.year}-${o.month}`}>
                {MONTH_NAMES[o.month - 1]} {o.year}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => window.print()} className="btn-secondary inline-flex items-center gap-2">
            <Glyph name="🖨️" size={16} />
            طباعة
          </button>
        </div>
      </div>

      <div ref={printableRef} className="space-y-6">
        {/* Header — printed even though the controls are hidden */}
        <div className="card p-6 print:border print:border-gray-300">
          <p className="text-xs text-gray-500">تقرير {r.period_label}</p>
          <p className="mt-1 text-sm text-gray-500">
            من <span className="font-mono">{r.period.from}</span> إلى <span className="font-mono">{r.period.to}</span>
            {' · '}{s.transactions} عملية
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-gray-500">الدخل</p>
              <p className="mt-1 text-xl font-medium tabular-nums text-emerald-400">{formatCurrency(s.income, 0)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">الإنفاق</p>
              <p className="mt-1 text-xl font-medium tabular-nums text-rose-400">{formatCurrency(s.expenses, 0)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">{s.net >= 0 ? 'الفائض' : 'العجز'}</p>
              <p className={`mt-1 text-xl font-medium tabular-nums ${s.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formatCurrency(Math.abs(s.net), 0)}
              </p>
            </div>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            label="الدخل"
            value={s.income}
            icon="💵"
            tone="text-emerald-400"
            footer={<Delta delta={r.vs_last_month.income} />}
          />
          <SummaryCard
            label="الإنفاق"
            value={s.expenses}
            icon="📤"
            tone="text-rose-400"
            footer={<Delta delta={r.vs_last_month.expenses} invert />}
          />
          <SummaryCard
            label={`الفائض (مقارنة بـ${r.vs_last_month.label})`}
            value={s.net}
            icon={s.net >= 0 ? '📈' : '📉'}
            tone={s.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}
            footer={<span className="text-xs text-gray-500">معدل الادخار {s.savings_rate}%</span>}
          />
          <SummaryCard
            label="الأصول الحالية"
            value={r.assets}
            icon="🏦"
            tone="text-blue-400"
            footer={
              <span className="text-xs text-gray-500">
                استلفت {formatCurrency(s.borrowed, 0)} · سددت {formatCurrency(s.repaid, 0)}
              </span>
            }
          />
        </div>

        {/* Narrative */}
        <div className="card p-6">
          <div className="flex items-center gap-2">
            <Glyph name="📝" size={16} />
            <h2 className="text-sm font-medium text-gray-200">سرد التقرير</h2>
          </div>
          <p className="mt-3 leading-7 text-gray-300">{r.narrative}</p>
        </div>

        {/* Categories */}
        <div className="card p-6">
          <div className="flex items-center gap-2">
            <Glyph name="🗂️" size={16} />
            <h2 className="text-sm font-medium text-gray-200">الإنفاق حسب الفئة</h2>
          </div>
          {r.categories.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">لا توجد مصاريف مسجّلة هذا الشهر.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {r.categories.map((c) => (
                <li key={c.id}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2 text-gray-300">
                      <Glyph name={c.icon || '•'} size={14} />
                      <span className="truncate">{c.name}</span>
                      <span className="text-xs text-gray-500">({c.count})</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-gray-200">{formatCurrency(c.total, 0)}</span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-800">
                    <div
                      className="h-2 rounded-full"
                      style={{
                        width: `${maxCat > 0 ? Math.max(4, (c.total / maxCat) * 100) : 0}%`,
                        backgroundColor: c.color || '#3b82f6',
                      }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{c.percent}% من إنفاق الشهر</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Budgets (current month only) */}
        {r.budgets.length > 0 && (
          <div className="card p-6">
            <div className="flex items-center gap-2">
              <Glyph name="📋" size={16} />
              <h2 className="text-sm font-medium text-gray-200">حالة الميزانيات</h2>
            </div>
            <ul className="mt-4 space-y-3">
              {r.budgets.map((b) => (
                <li key={b.name} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-gray-300">{b.name}</span>
                  <span className={`tabular-nums ${b.percent > 100 ? 'text-rose-400' : 'text-gray-200'}`}>
                    {formatCurrency(b.spent, 0)} / {formatCurrency(b.limit, 0)} ({b.percent}%)
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Recommendations */}
        <div className="card p-6">
          <div className="flex items-center gap-2">
            <Glyph name="💡" size={16} />
            <h2 className="text-sm font-medium text-gray-200">3 توصيات لهذا الشهر</h2>
          </div>
          <ol className="mt-4 space-y-3">
            {r.recommendations.map((rec, i) => (
              <li key={i} className="flex gap-3 rounded-lg bg-gray-900/60 p-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-xs font-medium text-blue-400 tabular-nums">
                  {i + 1}
                </span>
                <span className="leading-6 text-gray-300">{rec}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <p className="no-print text-xs text-gray-600">
        وُجد في {new Date(r.generated_at).toLocaleString('ar-DZ')}
      </p>
    </div>
  );
}
