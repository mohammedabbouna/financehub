'use client';

import React, { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import Glyph from '@/components/ui/Glyph';
import { formatCurrency, formatDate, formatShortDate } from '@/lib/format';
import type { Insight, Anomaly, HealthScore } from '@/types';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';

/** History points carry the timestamp next to the score snapshot. */
type HealthHistoryPoint = HealthScore & { calculated_at: string };

function QueryErrorState({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <EmptyState
      icon="⚠️"
      title={title}
      description="تعذر جلب البيانات من الخادم. تحقق من اتصالك ثم أعد المحاولة."
      action={
        <button type="button" onClick={onRetry} className="btn-secondary">
          إعادة المحاولة
        </button>
      }
    />
  );
}

export default function InsightsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const {
    data: insightsData,
    isLoading: insightsLoading,
    isError: insightsError,
    refetch: refetchInsights,
  } = useQuery({
    queryKey: ['insights'],
    queryFn: () => api.getInsights(),
  });

  const {
    data: anomalyData,
    isLoading: anomalyLoading,
    isError: anomalyError,
    refetch: refetchAnomalies,
  } = useQuery({
    queryKey: ['anomalies'],
    queryFn: () => api.getAnomalies(),
  });

  const {
    data: healthHistory,
    isError: healthHistoryError,
    refetch: refetchHealthHistory,
  } = useQuery({
    queryKey: ['health-history'],
    queryFn: () => api.getHealthScoreHistory(),
  });

  // react-query v5 removed per-query onError callbacks; surface failures here.
  useEffect(() => {
    if (insightsError) toast.error(apiErrorMessage(insightsError, 'تعذر تحميل الرؤى المالية.'));
  }, [insightsError, toast]);

  useEffect(() => {
    if (anomalyError) toast.error(apiErrorMessage(anomalyError, 'تعذر تحميل العمليات غير الطبيعية.'));
  }, [anomalyError, toast]);

  useEffect(() => {
    if (healthHistoryError) {
      toast.error(apiErrorMessage(healthHistoryError, 'تعذر تحميل تطور درجة الصحة المالية.'));
    }
  }, [healthHistoryError, toast]);

  const generateMutation = useMutation({
    mutationFn: () => api.generateInsights(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['insights'] }),
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر توليد الرؤى المالية. حاول مرة أخرى.')),
  });

  const insights: Insight[] = insightsData?.insights || [];
  const anomalies: Anomaly[] = anomalyData?.anomalies || [];
  const healthData: HealthHistoryPoint[] = healthHistory?.history || [];

  const isLoading = insightsLoading || anomalyLoading;

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[28px] font-medium leading-9 text-gray-100">الرؤى والتقارير</h1>
        <button
          type="button"
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className="btn-secondary inline-flex items-center gap-2"
        >
          <Glyph name="🧠" size={16} />
          {generateMutation.isPending ? 'جاري التوليد...' : 'توليد رؤى ذكية'}
        </button>
      </div>

      {/* Health Score History */}
      {(healthData.length > 0 || healthHistoryError) && (
        <div className="card">
          <h3 className="mb-4 text-[15px] font-medium text-gray-100">تطور درجة الصحة المالية</h3>
          {healthHistoryError ? (
            <QueryErrorState
              title="تعذر تحميل تطور درجة الصحة المالية"
              onRetry={() => refetchHealthHistory()}
            />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={healthData}>
                <defs>
                  <linearGradient id="healthGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#e0b463" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#e0b463" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(237,237,237,0.06)" vertical={false} />
                <XAxis
                  dataKey="calculated_at"
                  reversed
                  tick={{ fontSize: 11, fill: '#85858b', fontFamily: 'IBM Plex Mono' }}
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(237,237,237,0.08)' }}
                  tickFormatter={(v: string) => formatShortDate(v)}
                  minTickGap={24}
                />
                <YAxis
                  orientation="right"
                  width={44}
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: '#85858b', fontFamily: 'IBM Plex Mono' }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#26262a',
                    border: '1px solid #34343a',
                    borderRadius: '8px',
                    boxShadow: 'none',
                  }}
                  labelStyle={{ color: '#a1a1a6', fontSize: 12 }}
                  itemStyle={{ color: '#ededed', fontSize: 13 }}
                  labelFormatter={(v: string) => formatDate(v)}
                />
                <Area
                  type="monotone"
                  dataKey="score"
                  stroke="#e0b463"
                  strokeWidth={2}
                  fill="url(#healthGradient)"
                  dot={false}
                  activeDot={{ r: 3, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* Insights */}
      <div className="card">
        <h3 className="mb-4 text-[15px] font-medium text-gray-100">الرؤى المالية</h3>
        {insightsError ? (
          <QueryErrorState title="تعذر تحميل الرؤى المالية" onRetry={() => refetchInsights()} />
        ) : insights.length > 0 ? (
          <div>
            {insights.map((insight) => (
              <div
                key={insight.id}
                className="flex items-start gap-3 border-b border-white/[0.06] py-3 last:border-0"
              >
                <span className="mt-0.5 flex w-[18px] shrink-0 justify-center">
                  <Glyph
                    name={
                      insight.type === 'spending_trend'
                        ? '📊'
                        : insight.type === 'budget_warning'
                          ? '⚠️'
                          : insight.type === 'savings_opportunity'
                            ? '💰'
                            : insight.type === 'top_category'
                              ? '🏆'
                              : '💡'
                    }
                    size={18}
                    className="text-gray-500"
                  />
                </span>
                <div className="flex-1">
                  <p className="text-sm text-gray-100">{insight.message}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    <span className="font-mono">{formatShortDate(insight.created_at)}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon="💡" title="لا توجد رؤى مالية بعد" description="اضغط على «توليد رؤى ذكية» لتحليل بياناتك" />
        )}
      </div>

      {/* Anomalies */}
      {(anomalies.length > 0 || anomalyError) && (
        <div className="card">
          <h3 className="mb-4 text-[15px] font-medium text-gray-100">العمليات غير الطبيعية</h3>
          {anomalyError ? (
            <QueryErrorState
              title="تعذر تحميل العمليات غير الطبيعية"
              onRetry={() => refetchAnomalies()}
            />
          ) : (
            <div>
              {anomalies.map((anomaly) => (
                <div
                  key={anomaly.id}
                  className={`flex items-center gap-3 border-b border-white/[0.06] py-3 last:border-0 ${
                    anomaly.severity === 'critical'
                      ? 'bg-red-500/5'
                      : anomaly.severity === 'high'
                        ? 'bg-amber-500/5'
                        : ''
                  }`}
                >
                  <span className="flex w-[18px] shrink-0 justify-center">
                    <Glyph name="🚨" size={18} className="text-gray-500" />
                  </span>
                  <div className="flex-1">
                    <p className="text-sm text-gray-100">{anomaly.reason}</p>
                    {anomaly.amount && (
                      <p className="mt-1 text-xs text-gray-400">
                        المبلغ:{' '}
                        <span className="tabular-nums">{formatCurrency(anomaly.amount, 0)}</span>
                        {anomaly.category_name ? ` · ${anomaly.category_name}` : ''}
                      </p>
                    )}
                  </div>
                  <span
                    className={`badge ${
                      anomaly.severity === 'critical'
                        ? 'badge-red'
                        : anomaly.severity === 'high'
                          ? 'badge-yellow'
                          : 'badge-blue'
                    }`}
                  >
                    {anomaly.severity === 'critical' ? 'خطير' : anomaly.severity === 'high' ? 'عالي' : 'متوسط'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
