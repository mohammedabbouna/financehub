'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import Glyph from '@/components/ui/Glyph';
import { formatCurrency, formatShortDate } from '@/lib/format';
import { NAV_ITEMS } from '@/components/ui/Sidebar';
import { OPEN_COMMAND_EVENT } from '@/lib/events';
import type { Action, ParsedAction } from '@/types';

const TYPE_META: Record<string, { label: string; icon: string }> = {
  deposit: { label: 'إيداع', icon: '💰' },
  withdraw: { label: 'سحب', icon: '💸' },
  transfer: { label: 'تحويل', icon: '🔄' },
  invest: { label: 'استثمار', icon: '📈' },
  borrow: { label: 'اقتراض', icon: '💳' },
  repay: { label: 'سداد دين', icon: '✅' },
};

type PaletteItem =
  | { kind: 'entry'; key: 'entry'; parsed: ParsedAction }
  | { kind: 'nav'; key: string; href: string; label: string; icon: string };

/**
 * Global quick-entry palette (⌘K / Ctrl+K).
 *
 * One input does two jobs:
 *  1. Navigation — filters the sidebar destinations, Enter jumps there.
 *  2. Smart entry — after a short debounce the text is sent to the backend
 *     parser (rule-based locally when no AI key is configured), a preview row
 *     appears, and Enter saves the action immediately — including the
 *     automatic contact/debt linking for borrow & repay.
 *
 * Mounted once by AppShell.
 */
export default function CommandPalette() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [parsed, setParsed] = useState<ParsedAction | null>(null);
  const [parseLoading, setParseLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  /** Monotonic sequence so stale parse responses are discarded. */
  const parseSeq = useRef(0);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setParsed(null);
    setParseError(null);
    setParseLoading(false);
    setSelectedIndex(0);
  }, []);

  // ─── Global open/close bindings ────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (open) close();
        else setOpen(true);
      }
    };
    const onOpenEvent = () => setOpen(true);

    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_COMMAND_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_COMMAND_EVENT, onOpenEvent);
    };
  }, [open, close]);

  // Escape anywhere closes; background scroll is locked while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('keydown', onKey, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  // ─── Debounced smart parse ─────────────────────────────────────────────────

  useEffect(() => {
    const text = query.trim();
    setParsed(null);
    setParseError(null);

    const seq = ++parseSeq.current;

    if (text.length < 3) {
      setParseLoading(false);
      return;
    }

    setParseLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const data = await api.parseActionAi(text);
        if (seq !== parseSeq.current) return;
        setParsed(data?.parsed_action ?? null);
      } catch (err) {
        if (seq !== parseSeq.current) return;
        setParseError(apiErrorMessage(err, 'تعذر تحليل النص'));
      } finally {
        if (seq === parseSeq.current) setParseLoading(false);
      }
    }, 500);

    return () => window.clearTimeout(timer);
  }, [query]);

  // ─── Result items ──────────────────────────────────────────────────────────

  const items = useMemo<PaletteItem[]>(() => {
    const list: PaletteItem[] = [];
    const q = query.trim();

    // Smart-entry preview first when the parser produced something usable.
    if (parsed && !parsed.error && parsed.amount !== null && parsed.amount !== undefined && Number(parsed.amount) > 0) {
      list.push({ kind: 'entry', key: 'entry', parsed });
    }

    for (const item of NAV_ITEMS) {
      if (!q || item.label.includes(q)) {
        list.push({ kind: 'nav', key: item.href, href: item.href, label: item.label, icon: item.icon });
      }
    }

    return list;
  }, [query, parsed]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  // ─── Save the parsed action ────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: (p: ParsedAction) => {
      const amount = Number(p.amount);
      const walletId = Number(p.wallet_id);
      if (!Number.isFinite(amount) || amount <= 0) {
        return Promise.reject(new Error('المبلغ غير محدد في النص — أضف مبلغاً صريحاً'));
      }
      if (!Number.isFinite(walletId) || walletId <= 0) {
        return Promise.reject(new Error('أنشئ محفظة أولاً قبل تسجيل العمليات'));
      }
      return api.createAction({
        type: (p.type ?? 'withdraw') as Action['type'],
        wallet_id: walletId,
        target_wallet_id: p.target_wallet_id !== null && p.target_wallet_id !== undefined ? Number(p.target_wallet_id) : null,
        amount,
        category_id: p.category_id !== null && p.category_id !== undefined ? Number(p.category_id) : null,
        description: p.description?.trim() || query.trim(),
        date: p.date || new Date().toISOString().split('T')[0],
        tag: p.tag ?? null,
        contact_id: p.contact_id !== null && p.contact_id !== undefined ? Number(p.contact_id) : null,
        contact_name: p.contact_name ?? null,
      });
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['actions'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      toast.success(
        vars.type === 'borrow' || vars.type === 'repay'
          ? 'تم تسجيل العملية وربطها بسجل الديون'
          : 'تم تسجيل العملية بنجاح'
      );
      close();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر تسجيل العملية')),
  });

  // ─── Interaction ───────────────────────────────────────────────────────────

  const activate = useCallback(
    (item: PaletteItem) => {
      if (item.kind === 'nav') {
        router.push(item.href);
        close();
        return;
      }
      saveMutation.mutate(item.parsed);
    },
    [router, close, saveMutation]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => (items.length === 0 ? 0 : (i + 1) % items.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => (items.length === 0 ? 0 : (i - 1 + items.length) % items.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[selectedIndex];
      if (item) activate(item);
    }
  };

  if (!open) return null;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="الإدخال السريع"
        className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-gray-700 bg-gray-800"
      >
        {/* Input row */}
        <div className="flex items-center gap-3 border-b border-gray-700 px-4">
          <Glyph name="🔍" size={18} className="shrink-0 text-gray-500" />
          <input
            autoFocus
            className="flex-1 bg-transparent py-4 text-sm text-gray-100 placeholder-gray-500 outline-none"
            placeholder="اكتب عملية مالية أو ابحث… مثال: دفعت 500 دج امس"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="الإدخال السريع"
            aria-controls="command-results"
          />
          {parseLoading && <span className="text-xs text-gray-500">جاري التحليل…</span>}
          <kbd className="kbd hidden sm:inline-flex">Esc</kbd>
        </div>

        {/* Parse notes */}
        {parseError && (
          <p className="border-b border-gray-700 px-4 py-2 text-xs text-amber-400">{parseError}</p>
        )}
        {parsed?.error && (
          <p className="border-b border-gray-700 px-4 py-2 text-xs text-amber-400">{parsed.error}</p>
        )}

        {/* Results */}
        <div id="command-results" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-gray-500">
              لا نتائج — جرّب نصاً مثل «اشتريت خبز 300 دج» أو «استلفت 10000 من أحمد»
            </p>
          ) : (
            items.map((item, index) => {
              const selected = index === selectedIndex;
              const baseClasses = `flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-right transition-colors ${
                selected ? 'bg-blue-500/15 text-gray-100' : 'text-gray-300 hover:bg-gray-700/60'
              }`;

              if (item.kind === 'nav') {
                return (
                  <button
                    key={item.key}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => activate(item)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={baseClasses}
                  >
                    <span className="flex w-[18px] shrink-0 justify-center text-gray-400">
                      <Glyph name={item.icon} size={18} />
                    </span>
                    <span className="flex-1 truncate text-sm">{item.label}</span>
                    <span className="text-[11px] text-gray-500">انتقال ↵</span>
                  </button>
                );
              }

              const p = item.parsed;
              const meta = TYPE_META[p.type ?? 'withdraw'] ?? TYPE_META.withdraw;
              const contact = p.contact_name ? ` · ${p.contact_name}` : '';

              return (
                <button
                  key={item.key}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => activate(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  disabled={saveMutation.isPending}
                  className={`${baseClasses} border border-blue-500/40`}
                >
                  <span className="flex w-[18px] shrink-0 justify-center text-gray-400">
                    <Glyph name={meta.icon} size={18} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm">
                      سجّل: {meta.label}{' '}
                      <span className="font-medium tabular-nums">{formatCurrency(Number(p.amount))}</span>
                    </span>
                    <span className="block text-xs text-gray-500 truncate">
                      {p.wallet_name ?? 'محفظة'} · {formatShortDate(p.date)}
                      {p.category_name ? ` · ${p.category_name}` : ''}
                      {contact}
                    </span>
                  </span>
                  <span className="text-[11px] text-blue-400">
                    {saveMutation.isPending ? 'جاري الحفظ...' : 'حفظ ↵'}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center justify-between border-t border-gray-700 px-4 py-2 text-[11px] text-gray-500">
          <span>↑↓ للتنقل · Enter للتأكيد · Esc للإغلاق</span>
          <span>يعمل بدون مفتاح AI — اكتب بالعربية مباشرة</span>
        </div>
      </div>
    </div>
  );
}
