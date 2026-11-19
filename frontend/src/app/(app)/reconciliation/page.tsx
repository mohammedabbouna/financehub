'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '@/lib/api';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatShortDate } from '@/lib/format';
import type { Action } from '@/types';

interface ReconSession { id: number; filename: string | null; status: string; created_at: string; }
interface ReconRow { id: number; row_date: string; description: string | null; amount: number; direction: string; matched_action_id: number | null; status: string; }
interface SessionsResponse { sessions: ReconSession[]; }
interface SessionDetail { session: ReconSession; rows: ReconRow[]; }

export default function ReconciliationPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [showImport, setShowImport] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [activeSession, setActiveSession] = useState<number | null>(null);
  const [matchRow, setMatchRow] = useState<ReconRow | null>(null);
  const [matchActionId, setMatchActionId] = useState('');

  const { data: sessionsData, isLoading: sessionsLoading } = useQuery<SessionsResponse>({
    queryKey: ['recon-sessions'],
    queryFn: () => api.getReconciliationSessions(),
  });
  const { data: detailData, isLoading: detailLoading } = useQuery<SessionDetail>({
    queryKey: ['recon-session', activeSession],
    queryFn: () => api.getReconciliationSession(activeSession!),
    enabled: !!activeSession,
  });
  const { data: actionsData } = useQuery<{ actions: Action[] }>({
    queryKey: ['actions'],
    queryFn: () => api.getActions({ limit: 500 }),
  });

  const importMutation = useMutation({
    mutationFn: (rows: any[]) => api.createReconciliationSession({ filename: 'import.csv', rows }),
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: ['recon-sessions'] });
      setActiveSession(d.session_id);
      setShowImport(false);
      setCsvText('');
      toast.success('تم إنشاء جلسة مطابقة');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر الاستيراد.')),
  });

  const matchMutation = useMutation({
    mutationFn: ({ rowId, actionId }: { rowId: number; actionId: number | null }) =>
      api.matchReconciliation(activeSession!, rowId, actionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recon-session', activeSession] });
      setMatchRow(null);
      toast.success('تمت المطابقة');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر المطابقة.')),
  });

  const ignoreMutation = useMutation({
    mutationFn: (rowId: number) => api.ignoreReconciliation(activeSession!, rowId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recon-session', activeSession] });
      toast.success('تم التجاهل');
    },
  });

  const createActionMutation = useMutation({
    mutationFn: ({ rowId, walletId }: { rowId: number; walletId: number }) =>
      api.createActionFromReconciliation(activeSession!, rowId, walletId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recon-session', activeSession] });
      queryClient.invalidateQueries({ queryKey: ['actions'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      toast.success('تم إنشاء العملية');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر الإنشاء.')),
  });

  const autoMatchMutation = useMutation({
    mutationFn: () => api.autoMatchReconciliation(activeSession!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recon-session', activeSession] });
      toast.success('تمت المطابقة التلقائية');
    },
  });

  const completeMutation = useMutation({
    mutationFn: () => api.completeReconciliation(activeSession!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recon-sessions'] });
      toast.success('تم إكمال الجلسة');
    },
  });

  const parseCsv = () => {
    const lines = csvText.trim().split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lines.length < 2) { toast.error('ملف فارغ'); return; }
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/"/g, ''));
    const dateIdx = headers.findIndex((h) => /date|تاريخ/.test(h));
    const amtIdx = headers.findIndex((h) => /amount|مبلغ|montant/.test(h));
    const descIdx = headers.findIndex((h) => /desc|description|وصف|libelle/.test(h));
    if (amtIdx === -1) { toast.error('لم يتم العثور على عمود المبلغ'); return; }
    const rows = lines.slice(1).map((line) => {
      const cells = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      const amt = parseFloat((cells[amtIdx] || '0').replace(/\s/g, '').replace(',', '.'));
      let date = dateIdx >= 0 ? cells[dateIdx] : new Date().toISOString().slice(0, 10);
      const slash = date.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
      if (slash) date = `${slash[3]}-${slash[2].padStart(2, '0')}-${slash[1].padStart(2, '0')}`;
      return { date, amount: isNaN(amt) ? 0 : amt, description: descIdx >= 0 ? cells[descIdx] : '' };
    }).filter((r) => r.amount !== 0);
    importMutation.mutate(rows);
  };

  const sessions = sessionsData?.sessions || [];
  const detail = detailData;
  const rows = detail?.rows || [];
  const actions = actionsData?.actions || [];
  const wallets = (queryClient.getQueryData(['wallets']) as any)?.wallets || [];

  const statusColor = (s: string) => s === 'matched' ? 'text-emerald-400' : s === 'created' ? 'text-blue-400' : s === 'ignored' ? 'text-gray-500' : s === 'ambiguous' ? 'text-amber-400' : 'text-rose-400';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-medium leading-9 text-gray-100">مطابقة كشف الحساب</h1>
          <p className="mt-1 text-sm text-gray-400">استورد كشف حساب وطابقه مع عملياتك</p>
        </div>
        <button type="button" onClick={() => setShowImport(true)} className="btn-primary">
          + استيراد كشف
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Sessions list */}
        <div className="card">
          <h3 className="mb-3 text-[15px] font-medium text-gray-100">الجلسات</h3>
          {sessionsLoading ? <Spinner label="..." /> : sessions.length === 0 ? (
            <p className="text-sm text-gray-500">لا توجد جلسات</p>
          ) : (
            <ul className="space-y-2">
              {sessions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setActiveSession(s.id)}
                    className={`w-full rounded-lg px-3 py-2 text-right text-sm transition-colors ${activeSession === s.id ? 'bg-blue-500/15 text-blue-400' : 'text-gray-300 hover:bg-gray-800/60'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{s.filename || `جلسة #${s.id}`}</span>
                      <span className={`text-xs ${s.status === 'completed' ? 'text-emerald-400' : 'text-amber-400'}`}>{s.status}</span>
                    </div>
                    <p className="text-xs text-gray-500">{new Date(s.created_at).toLocaleString('ar-DZ')}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Rows */}
        <div className="card lg:col-span-2">
          {!activeSession ? (
            <EmptyState icon="🔄" title="اختر جلسة" description="أو استورد كشف حساب جديداً" />
          ) : detailLoading ? (
            <Spinner label="جاري التحميل..." />
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[15px] font-medium text-gray-100">
                  صفوف كشف الحساب ({rows.length})
                </h3>
                <div className="flex gap-2">
                  <button type="button" onClick={() => autoMatchMutation.mutate()} disabled={autoMatchMutation.isPending} className="btn-secondary text-sm">
                    {autoMatchMutation.isPending ? '...' : 'مطابقة تلقائية'}
                  </button>
                  <button type="button" onClick={() => completeMutation.mutate()} className="btn-secondary text-sm">
                    إكمال
                  </button>
                </div>
              </div>
              <div className="max-h-[500px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-900 text-xs text-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-right font-medium">التاريخ</th>
                      <th className="px-3 py-2 text-right font-medium">الوصف</th>
                      <th className="px-3 py-2 text-left font-medium">المبلغ</th>
                      <th className="px-3 py-2 text-center font-medium">الحالة</th>
                      <th className="px-3 py-2 text-center font-medium">إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-t border-gray-100/[0.04]">
                        <td className="px-3 py-2 font-mono text-xs text-gray-400">{formatShortDate(r.row_date)}</td>
                        <td className="max-w-[200px] truncate px-3 py-2 text-gray-300">{r.description || '—'}</td>
                        <td className={`px-3 py-2 text-left tabular-nums ${r.direction === 'in' ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {r.direction === 'in' ? '+' : '-'}{formatCurrency(r.amount, 0)}
                        </td>
                        <td className={`px-3 py-2 text-center text-xs ${statusColor(r.status)}`}>{r.status}</td>
                        <td className="px-3 py-2 text-center">
                          {r.status === 'unmatched' || r.status === 'ambiguous' ? (
                            <div className="flex justify-center gap-1">
                              <button type="button" className="text-xs text-blue-400 hover:underline" onClick={() => setMatchRow(r)}>مطابقة</button>
                              <button type="button" className="text-xs text-gray-500 hover:underline" onClick={() => ignoreMutation.mutate(r.id)}>تجاهل</button>
                              <button type="button" className="text-xs text-emerald-400 hover:underline" onClick={() => {
                                const wid = (wallets as any)?.[0]?.id;
                                if (wid) createActionMutation.mutate({ rowId: r.id, walletId: wid });
                                else toast.error('أنشئ محفظة أولاً');
                              }}>إنشاء</button>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-500">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Import Modal */}
      <Modal open={showImport} onClose={() => setShowImport(false)} title="استيراد كشف حساب (CSV)" size="max-w-2xl"
        footer={
          <>
            <button type="button" onClick={() => setShowImport(false)} className="btn-secondary flex-1">إلغاء</button>
            <button type="button" onClick={parseCsv} disabled={importMutation.isPending} className="btn-primary flex-1">
              {importMutation.isPending ? 'جاري...' : 'استيراد'}
            </button>
          </>
        }
      >
        <p className="mb-3 text-sm text-gray-400">الصيغة: CSV مع أعمدة (date, amount, description). التواريخ: YYYY-MM-DD أو DD/MM/YYYY.</p>
        <textarea className="input min-h-40 font-mono text-xs" value={csvText} onChange={(e) => setCsvText(e.target.value)} placeholder="date,amount,description&#10;2026-11-10,-500,غداء" />
      </Modal>

      {/* Match Modal */}
      <Modal open={!!matchRow} onClose={() => setMatchRow(null)} title="مطابقة صف بعملية" size="max-w-md"
        footer={
          <>
            <button type="button" onClick={() => setMatchRow(null)} className="btn-secondary flex-1">إلغاء</button>
            <button type="button" onClick={() => matchMutation.mutate({ rowId: matchRow!.id, actionId: matchActionId ? Number(matchActionId) : null })} disabled={matchMutation.isPending} className="btn-primary flex-1">
              {matchMutation.isPending ? 'جاري...' : 'مطابقة'}
            </button>
          </>
        }
      >
        {matchRow && (
          <div className="space-y-4">
            <div className="rounded-lg bg-gray-900/60 p-3 text-sm">
              <p className="text-gray-300">{matchRow.description || '—'}</p>
              <p className="text-xs text-gray-500">{formatShortDate(matchRow.row_date)} · {matchRow.direction === 'in' ? '+' : '-'}{formatCurrency(matchRow.amount, 0)}</p>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">العملية</label>
              <select className="input" value={matchActionId} onChange={(e) => setMatchActionId(e.target.value)}>
                <option value="">— بدون (إلغاء المطابقة) —</option>
                {actions.map((a) => (
                  <option key={a.id} value={a.id}>
                    #{a.id} · {a.description || a.type} · {formatCurrency(Math.abs(a.amount), 0)} · {formatShortDate(a.date)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}