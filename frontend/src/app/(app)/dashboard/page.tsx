'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api, apiErrorMessage } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import Glyph from '@/components/ui/Glyph';
import {
  formatCurrency,
  formatCompact,
  formatNumber,
  formatDate,
  formatShortDate,
  currencySymbol,
  daysUntil,
  PRIVACY_MASK,
} from '@/lib/format';
import { isPrivacyHidden } from '@/lib/privacy';
import type { Action, Bill, Forecast, HealthScore, NetWorth, Wallet } from '@/types';
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface WalletsResponse {
  wallets: Wallet[];
  total_assets: number;
}

interface ActionsResponse {
  actions: Action[];
}

interface UpcomingBillsResponse {
  bills: Bill[];
  total_due: number;
}

interface QueryErrorStateProps {
  error: unknown;
  onRetry: () => void;
  compact?: boolean;
}

/** Retryable error state shown when a query request failed (not a genuine empty). */
function QueryErrorState({ error, onRetry, compact = false }: QueryErrorStateProps) {
  const message = apiErrorMessage(error, 'تعذر تحميل البيانات. حاول مرة أخرى.');

  if (compact) {
    return (
      <div role="alert" className="flex flex-col items-center gap-1 py-2 text-center">
        <p className="text-xs text-red-400">{message}</p>
        <button type="button" onClick={onRetry} className="text-xs text-blue-400 hover:text-blue-300">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <EmptyState
      icon="⚠️"
      title="تعذر تحميل البيانات"
      description={message}
      action={
        <button type="button" onClick={onRetry} className="btn-secondary px-4 py-2 text-sm">
          إعادة المحاولة
        </button>
      }
    />
  );
}

/**
 * Money figure: grouped digits, tabular, with the currency set small and
 * muted. `dir="ltr"` keeps a leading + / − on the correct side in RTL.
 */
function Money({
  value,
  decimals = 0,
  sign,
  className = '',
}: {
  value: number;
  decimals?: number;
  sign?: '+' | '-' | null;
  className?: string;
}) {
  const prefix = sign ? `${sign}` : '';
  return (
    <span dir="ltr" className={`tabular-nums ${className}`}>
      {prefix}
      {isPrivacyHidden() ? PRIVACY_MASK : formatNumber(Math.abs(value), decimals)}{' '}
      <span className="text-[0.75em] text-gray-500">{currencySymbol()}</span>
    </span>
  );
}

function StatCard({
  label,
  value,
  detail,
  valueClassName = 'text-gray-100',
}: {
  label: string;
  value: React.ReactNode;
  detail: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="card">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-2 text-2xl font-medium leading-8 tabular-nums ${valueClassName}`}>{value}</p>
      <p className="mt-1 text-xs text-gray-500">{detail}</p>
    </div>
  );
}

export default function DashboardPage() {
  const toast = useToast();

  const {
    data: walletsData,
    isLoading: walletsLoading,
    isError: walletsFailed,
    error: walletsErr,
    refetch: refetchWallets,
  } = useQuery<WalletsResponse>({
    queryKey: ['wallets'],
    queryFn: () => api.getWallets(),
  });

  const {
    data: actionsData,
    isLoading: actionsLoading,
    isError: actionsFailed,
    error: actionsErr,
    refetch: refetchActions,
  } = useQuery<ActionsResponse>({
    queryKey: ['actions'],
    queryFn: () => api.getActions({ limit: 10 }),
  });

  const {
    data: healthData,
    isLoading: healthLoading,
    isError: healthFailed,
    error: healthErr,
    refetch: refetchHealth,
  } = useQuery<HealthScore>({
    queryKey: ['health-score'],
    queryFn: () => api.getHealthScore(),
  });

  const {
    data: forecastData,
    isLoading: forecastLoading,
    isError: forecastFailed,
    error: forecastErr,
    refetch: refetchForecast,
  } = useQuery<Forecast>({
    queryKey: ['forecast'],
    queryFn: () => api.getForecast(),
  });

  const {
    data: upcomingBills,
    isLoading: billsLoading,
    isError: billsFailed,
    error: billsErr,
    refetch: refetchBills,
  } = useQuery<UpcomingBillsResponse>({
    queryKey: ['upcoming-bills'],
    queryFn: () => api.getUpcomingBills(7),
  });

  const {
    data: netWorth,
    isError: netWorthFailed,
    error: netWorthErr,
    refetch: refetchNetWorth,
  } = useQuery<NetWorth>({
    queryKey: ['networth', '90d'],
    queryFn: () => api.getNetWorth(
      new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10),
    ),
  });

  useEffect(() => {
    if (walletsFailed) toast.error(apiErrorMessage(walletsErr, 'تعذر تحميل بيانات المحافظ.'));
    if (actionsFailed) toast.error(apiErrorMessage(actionsErr, 'تعذر تحميل آخر العمليات.'));
    if (healthFailed) toast.error(apiErrorMessage(healthErr, 'تعذر تحميل الصحة المالية.'));
    if (forecastFailed) toast.error(apiErrorMessage(forecastErr, 'تعذر تحميل توقع الرصيد.'));
    if (billsFailed) toast.error(apiErrorMessage(billsErr, 'تعذر تحميل الفواتير القادمة.'));
  }, [
    walletsFailed,
    walletsErr,
    actionsFailed,
    actionsErr,
    healthFailed,
    healthErr,
    forecastFailed,
    forecastErr,
    billsFailed,
    billsErr,
    toast,
  ]);

  const isLoading = walletsLoading || actionsLoading || healthLoading || forecastLoading || billsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner label="جاري تحميل لوحة التحكم..." />
      </div>
    );
  }

  const wallets = walletsData?.wallets || [];
  const totalAssets = walletsData?.total_assets || 0;
  const actions = actionsData?.actions || [];
  const healthScore = healthData?.score || 0;
  const breakdown: HealthScore['breakdown'] = healthData?.breakdown || {};
  const forecast = forecastData?.forecast || [];
  const bills = upcomingBills?.bills || [];
  const billsTotalDue = upcomingBills?.total_due || 0;
  const overdueBills = bills.filter((bill) => {
    const dueIn = daysUntil(bill.due_date);
    return dueIn !== null && dueIn <= 0;
  }).length;

  // Aggregate by category for the spending distribution (only real spending counts)
  const categoryTotals: Record<string, { name: string; total: number; color: string; icon: string }> = {};
  actions.forEach((a) => {
    if (a.type === 'withdraw') {
      const key = a.category_name || 'أخرى';
      if (!categoryTotals[key]) {
        categoryTotals[key] = { name: key, total: 0, color: a.category_color || '#6b7280', icon: a.category_icon || '📌' };
      }
      categoryTotals[key].total += a.amount;
    }
  });
  const pieData = Object.values(categoryTotals).sort((a, b) => b.total - a.total);
  const topCategoryTotal = pieData.length > 0 ? pieData[0].total : 0;

  const breakdownEntries = Object.entries(breakdown);
  const forecastSample = forecast.filter((_item, i) => i % 3 === 0);
  const forecastAriaLabel =
    forecastSample.length > 0
      ? `توقع الرصيد خلال 30 يوماً: من ${formatCurrency(forecastSample[0].projected_balance, 0)} في ${formatDate(
          forecastSample[0].date
        )} إلى ${formatCurrency(forecastSample[forecastSample.length - 1].projected_balance, 0)} في ${formatDate(
          forecastSample[forecastSample.length - 1].date
        )}`
      : 'توقع الرصيد خلال 30 يوماً';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header — page name on the right, the one number that matters on the left */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-medium leading-9 text-gray-100">لوحة التحكم المالية</h1>
          <p className="mt-1 text-sm text-gray-500">حركة المحافظ والفواتير حتى {formatShortDate(new Date())}</p>
        </div>
        <div className="text-left">
          <p className="text-xs text-gray-500">إجمالي الأصول</p>
          {walletsFailed ? (
            <QueryErrorState compact error={walletsErr} onRetry={() => refetchWallets()} />
          ) : (
            <p className="mt-1 text-[32px] font-medium leading-9 tabular-nums text-blue-400">
              <span dir="ltr">
                {isPrivacyHidden() ? PRIVACY_MASK : formatNumber(totalAssets, 0)}{' '}
                <span className="text-lg text-gray-500">{currencySymbol()}</span>
              </span>
            </p>
          )}
        </div>
      </header>

      {/* Stats — numbers only */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="المحافظ"
          value={wallets.length}
          detail={wallets.length === 1 ? 'محفظة نشطة' : 'محافظ نشطة'}
        />
        <StatCard
          label="الصحة المالية"
          value={`${healthScore}/100`}
          valueClassName={healthScore >= 70 ? 'text-emerald-400' : healthScore >= 40 ? 'text-amber-400' : 'text-red-400'}
          detail={healthScore >= 70 ? 'ممتاز' : healthScore >= 40 ? 'جيد' : 'بحاجة للتحسين'}
        />
        <StatCard
          label="الفواتير القادمة"
          value={bills.length}
          valueClassName={overdueBills > 0 ? 'text-red-400' : 'text-gray-100'}
          detail={billsTotalDue > 0 ? `بقيمة ${formatCurrency(billsTotalDue, 0)}` : 'لا مبالغ مستحقة خلال 7 أيام'}
        />
        <StatCard
          label="التوقع"
          value={forecastData?.estimated_runway ? `${forecastData.estimated_runway} يوم` : 'مستقر'}
          detail="السيولة المتوقعة"
        />
      </div>

      {/* Health breakdown + spending distribution */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Health Score */}
        <div className="card">
          <h3 className="mb-4 text-[15px] font-medium text-gray-100">تفاصيل الصحة المالية</h3>
          {healthFailed ? (
            <QueryErrorState error={healthErr} onRetry={() => refetchHealth()} />
          ) : breakdownEntries.length === 0 ? (
            <EmptyState icon="🩺" title="لا توجد تفاصيل متاحة" />
          ) : (
            <ul className="space-y-3">
              {breakdownEntries.map(([key, val]) => (
                <li key={key}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm text-gray-400">{val.label}</span>
                    <span className="font-mono text-xs tabular-nums text-gray-300">{val.score.toFixed(0)}</span>
                  </div>
                  <div
                    className="progress-bar"
                    role="progressbar"
                    aria-valuenow={val.score}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={val.label}
                  >
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${val.score}%`,
                        backgroundColor: val.score >= 70 ? '#4cc38a' : val.score >= 40 ? '#d98f3f' : '#e5484d',
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Spending by category */}
        <div className="card">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-[15px] font-medium text-gray-100">توزيع المصاريف</h3>
            <span className="text-xs text-gray-500">حسب آخر العمليات</span>
          </div>
          {actionsFailed ? (
            <QueryErrorState error={actionsErr} onRetry={() => refetchActions()} />
          ) : pieData.length > 0 ? (
            <ul className="space-y-3">
              {pieData.slice(0, 6).map((item) => (
                <li key={item.name}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2 text-sm text-gray-300">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: item.color }}
                        aria-hidden="true"
                      />
                      <span className="truncate">{item.name}</span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-gray-400">
                      {formatCurrency(item.total, 0)}
                    </span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${Math.min(100, (item.total / Math.max(topCategoryTotal, 1)) * 100)}%`,
                        backgroundColor: item.total === topCategoryTotal ? '#cfa048' : '#6e6e73',
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="💸" title="لا توجد مصاريف مسجلة بعد" />
          )}
        </div>
      </div>

      {/* Forecast — the one large chart on the screen */}
      <div className="card">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[15px] font-medium text-gray-100">توقع الرصيد</h3>
          <span className="text-xs text-gray-500">آخر 30 يوماً</span>
        </div>
        {forecastFailed ? (
          <QueryErrorState error={forecastErr} onRetry={() => refetchForecast()} />
        ) : forecast.length > 0 ? (
          <>
            <div role="img" aria-label={forecastAriaLabel}>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={forecastSample} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#e0b463" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#e0b463" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(237,237,237,0.06)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    reversed
                    tick={{ fontSize: 11, fill: '#85858b', fontFamily: 'IBM Plex Mono' }}
                    tickLine={false}
                    axisLine={{ stroke: 'rgba(237,237,237,0.08)' }}
                    tickFormatter={(v: string) => formatShortDate(v).slice(3)}
                    interval="preserveStartEnd"
                    minTickGap={24}
                  />
                  <YAxis
                    orientation="right"
                    width={52}
                    tick={{ fontSize: 11, fill: '#85858b', fontFamily: 'IBM Plex Mono' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => formatCompact(v)}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--bg-raised)',
                      border: '1px solid var(--border-strong)',
                      borderRadius: '8px',
                      boxShadow: 'none',
                    }}
                    labelStyle={{ color: '#a1a1a6', fontSize: 12 }}
                    itemStyle={{ color: '#ededed', fontSize: 13 }}
                    formatter={(value: number | string) => [formatCurrency(Number(value), 0), 'الرصيد المتوقع']}
                    labelFormatter={(v: string) => formatDate(v)}
                  />
                  <Area
                    type="monotone"
                    dataKey="projected_balance"
                    stroke="#e0b463"
                    strokeWidth={2}
                    fill="url(#balanceFill)"
                    dot={false}
                    activeDot={{ r: 3, strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-3 border-t border-gray-100/[0.06] pt-3 text-xs text-gray-500">
              من <span className="font-mono tabular-nums text-gray-400">{formatCurrency(forecastSample[0].projected_balance, 0)}</span>{' '}
              في {formatDate(forecastSample[0].date)} إلى{' '}
              <span className="font-mono tabular-nums text-gray-400">
                {formatCurrency(forecastSample[forecastSample.length - 1].projected_balance, 0)}
              </span>{' '}
              في {formatDate(forecastSample[forecastSample.length - 1].date)}
            </p>
          </>
        ) : (
          <EmptyState icon="📈" title="بيانات غير كافية للتوقع" />
        )}
      </div>

      {/* Net worth — cumulative daily assets over the last 90 days */}
      <div className="card">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[15px] font-medium text-gray-100">صافي الثروة</h3>
          <span className="text-xs text-gray-500">
            آخر 90 يوماً
            {netWorth && (
              <span
                className={`mr-2 tabular-nums ${netWorth.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}
              >
                {netWorth.change >= 0 ? '+' : ''}
                {formatCurrency(netWorth.change, 0)}
                {netWorth.change_percent !== null ? ` (${netWorth.change_percent}%)` : ''}
              </span>
            )}
          </span>
        </div>
        {netWorthFailed ? (
          <QueryErrorState error={netWorthErr} onRetry={() => refetchNetWorth()} />
        ) : netWorth && netWorth.points.length > 1 ? (
          <div role="img" aria-label={`صافي الثروة من ${formatCurrency(netWorth.start, 0)} إلى ${formatCurrency(netWorth.end, 0)}`}>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={netWorth.points} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(237,237,237,0.06)" vertical={false} />
                <XAxis
                  dataKey="date"
                  reversed
                  tick={{ fontSize: 11, fill: '#85858b', fontFamily: 'IBM Plex Mono' }}
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(237,237,237,0.08)' }}
                  tickFormatter={(v: string) => formatShortDate(v).slice(3)}
                  interval="preserveStartEnd"
                  minTickGap={28}
                />
                <YAxis
                  orientation="right"
                  width={52}
                  tick={{ fontSize: 11, fill: '#85858b', fontFamily: 'IBM Plex Mono' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => formatCompact(v)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-raised)',
                    border: '1px solid var(--border-strong)',
                    borderRadius: '8px',
                    boxShadow: 'none',
                  }}
                  labelStyle={{ color: '#a1a1a6', fontSize: 12 }}
                  itemStyle={{ color: '#ededed', fontSize: 13 }}
                  formatter={(value: number | string) => [formatCurrency(Number(value), 0), 'صافي الثروة']}
                  labelFormatter={(v: string) => formatDate(v)}
                />
                <Area
                  type="monotone"
                  dataKey="balance"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#netWorthFill)"
                  dot={false}
                  activeDot={{ r: 3, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState icon="📊" title="بيانات غير كافية لصافي الثروة" />
        )}
      </div>

      {/* Recent actions & upcoming bills */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent actions — ledger rows */}
        <div className="card">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-[15px] font-medium text-gray-100">آخر العمليات</h3>
            <Link href="/actions" className="text-sm text-blue-400 hover:text-blue-300">
              عرض الكل
            </Link>
          </div>
          {actionsFailed ? (
            <QueryErrorState error={actionsErr} onRetry={() => refetchActions()} />
          ) : actions.length > 0 ? (
            <ul>
              {actions.map((action) => {
                const isInflow = action.type === 'deposit' || action.type === 'borrow';
                const isOutflow = action.type === 'withdraw' || action.type === 'invest' || action.type === 'repay';
                return (
                  <li
                    key={action.id}
                    className="flex items-center gap-3 border-b border-gray-100/[0.06] py-3 last:border-0 last:pb-0 first:pt-0"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-800 bg-gray-900/60 text-gray-500">
                      <Glyph name={action.category_icon} size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-gray-200">{action.description || action.type}</p>
                      <p className="truncate text-xs text-gray-500">
                        {action.wallet_name} · <span className="font-mono">{formatShortDate(action.date)}</span>
                      </p>
                    </div>
                    <Money
                      value={action.amount}
                      sign={isInflow ? '+' : isOutflow ? '-' : null}
                      className={`w-[108px] text-left text-sm font-medium ${
                        isInflow ? 'text-emerald-400' : isOutflow ? 'text-red-400' : 'text-gray-300'
                      }`}
                    />
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon="💳" title="لا توجد عمليات مسجلة بعد" />
          )}
        </div>

        {/* Upcoming bills */}
        <div className="card">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-[15px] font-medium text-gray-100">الفواتير القادمة</h3>
            <Link href="/bills" className="text-sm text-blue-400 hover:text-blue-300">
              عرض الكل
            </Link>
          </div>
          {billsFailed ? (
            <QueryErrorState error={billsErr} onRetry={() => refetchBills()} />
          ) : bills.length > 0 ? (
            <ul>
              {bills.map((bill) => {
                const dueIn = daysUntil(bill.due_date);
                const isOverdue = dueIn !== null && dueIn <= 0;
                return (
                  <li
                    key={bill.id}
                    className="flex items-center gap-3 border-b border-gray-100/[0.06] py-3 last:border-0 last:pb-0 first:pt-0"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-800 bg-gray-900/60 text-gray-500">
                      <Glyph name={bill.category_icon} size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-gray-200">{bill.name}</p>
                      <p className="truncate text-xs text-gray-500">
                        تستحق <span className="font-mono">{formatShortDate(bill.due_date)}</span>
                      </p>
                    </div>
                    <div className="flex w-[108px] flex-col items-end gap-1.5">
                      <Money value={bill.amount} className="text-sm font-medium text-gray-200" />
                      <span className={`badge ${isOverdue ? 'badge-red' : 'badge-yellow'}`}>
                        {isOverdue ? 'متأخرة' : 'قادمة'}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon="🧾" title="لا توجد فواتير قادمة" />
          )}
        </div>
      </div>
    </div>
  );
}
