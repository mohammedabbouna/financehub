'use client';

import React, { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, apiErrorMessage } from '@/lib/api';
import Glyph from '@/components/ui/Glyph';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatShortDate } from '@/lib/format';
import type { ImportRow } from '@/types';

const TYPE_LABELS: Record<ImportRow['type'], string> = {
  deposit: 'إيداع',
  withdraw: 'سحب',
  borrow: 'اقتراض',
  repay: 'سداد',
  invest: 'استثمار',
};

/**
 * Split one CSV line honoring double quotes ("" = literal quote).
 * Kept tiny on purpose: the file is parsed in the browser, nothing is
 * uploaded until the user confirms the preview.
 */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Fields the browser-side parser can populate from a CSV column. */
type MappableField = 'date' | 'amount' | 'type' | 'description' | 'category';

/** Map common header spellings (Arabic/French/English) to row fields. */
function detectColumns(headers: string[]): Record<number, MappableField | 'raw'> {
  const map: Record<number, MappableField | 'raw'> = {};
  headers.forEach((h, i) => {
    const key = h
      .toLowerCase()
      .replace(/[أإآ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/[ًٌٍَُِّْ]/g, '');
    if (/(تاريخ|date)/.test(key)) map[i] = 'date';
    else if (/(مبلغ|amount|montant|somme)/.test(key)) map[i] = 'amount';
    else if (/(نوع|type|nature)/.test(key)) map[i] = 'type';
    else if (/(وصف|detail|description|libelle|libellé|label)/.test(key)) map[i] = 'description';
    else if (/(فئه|فئا|category|catégorie|categorie)/.test(key)) map[i] = 'category';
    else map[i] = 'raw';
  });
  return map;
}

/** Normalize a parsed cell into the analyze payload shape. */
function buildRow(cells: string[], columns: Record<number, MappableField | 'raw'>): Record<string, unknown> {
  const row: Record<string, unknown> = { date: '', amount: '', type: '', description: '', category: '' };
  cells.forEach((cell, i) => {
    const field = columns[i];
    if (field && field !== 'raw') row[field] = cell;
    else if (field === 'raw' && !row.description) row.description = cell;
  });
  // Dates like 15/11/2026 → 2026-11-15 (Excel's usual export in DZ).
  const d = String(row.date);
  const slash = d.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (slash) row.date = `${slash[3]}-${slash[2].padStart(2, '0')}-${slash[1].padStart(2, '0')}`;
  return row;
}

export default function ImportPage() {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [mapped, setMapped] = useState<ImportRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  const analyze = useMutation({
    mutationFn: (rows: Record<string, unknown>[]) => api.analyzeImport(rows),
    onSuccess: (data) => {
      setMapped(data.rows);
      setParseError(null);
    },
    onError: (error) => {
      setMapped([]);
      setParseError(apiErrorMessage(error, 'تعذر تحليل الملف.'));
    },
  });

  const commit = useMutation({
    mutationFn: (rows: unknown[]) => api.commitImport(rows),
    onSuccess: (data) => {
      toast.success(data.message);
      reset();
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'تعذر حفظ العمليات.')),
  });

  function reset() {
    setFileName(null);
    setMapped([]);
    setParseError(null);
    analyze.reset();
    commit.reset();
    if (fileRef.current) fileRef.current.value = '';
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setMapped([]);
    setParseError(null);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? '').replace(/^\uFEFF/, ''); // strip BOM
        const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
        if (lines.length < 2) {
          setParseError('الملف فارغ أو يحتوي على رأس فقط.');
          return;
        }
        const headers = splitCsvLine(lines[0]);
        const columns = detectColumns(headers);

        const hasAmount = Object.values(columns).includes('amount');
        if (!hasAmount) {
          setParseError('لم يتم العثور على عمود المبلغ (المبلغ/amount/montant).');
          return;
        }

        const rows = lines.slice(1, 2001).map((line) => buildRow(splitCsvLine(line), columns));
        analyze.mutate(rows);
      } catch {
        setParseError('تعذر قراءة الملف — تأكد أنه CSV نصي.');
      }
    };
    reader.onerror = () => setParseError('تعذر قراءة الملف من القرص.');
    reader.readAsText(file, 'utf-8');
  }

  const validRows = mapped.filter((r) => r.valid);
  const badRows = mapped.filter((r) => !r.valid);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-medium leading-9 text-gray-100">الاستيراد والتصدير</h1>
        <p className="mt-1 text-sm text-gray-500">
          استورد عملياتك من ملف CSV (يُحلَّل في متصفحك — لا يرفع شيء حتى تؤكّد المعاينة)
        </p>
      </div>

      {/* Export */}
      <div className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Glyph name="📤" size={16} />
              <h2 className="text-sm font-medium text-gray-200">تصدير CSV</h2>
            </div>
            <p className="mt-2 text-sm text-gray-500">
              ملف UTF-8 مع BOM — يفتح في Excel بأسماء الأعمدة العربية دون تشويش.
            </p>
          </div>
          <button
            type="button"
            onClick={async () => {
              try {
                const blob = await api.exportActionsCsv();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `financehub_actions_${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              } catch (error) {
                toast.error(apiErrorMessage(error, 'تعذر تصدير الملف.'));
              }
            }}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Glyph name="📄" size={16} />
            تنزيل كل العمليات
          </button>
        </div>
      </div>

      {/* Import */}
      <div className="card p-6">
        <div className="flex items-center gap-2">
          <Glyph name="📥" size={16} />
          <h2 className="text-sm font-medium text-gray-200">استيراد CSV</h2>
        </div>

        <label
          htmlFor="csv-file"
          className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-700 bg-gray-900/40 px-6 py-10 text-center transition-colors hover:border-gray-500"
        >
          <Glyph name="📂" size={22} className="text-gray-500" />
          <span className="text-sm text-gray-300">
            {fileName ? fileName : 'اضغط لاختيار ملف CSV'}
          </span>
          <span className="text-xs text-gray-500">
            الأعمدة المتوقعة: التاريخ، المبلغ، النوع، الوصف، الفئة (تُكتشف تلقائياً)
          </span>
          <input
            id="csv-file"
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={onFile}
          />
        </label>

        {parseError && (
          <p role="alert" className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
            {parseError}
          </p>
        )}

        {analyze.isPending && (
          <p className="mt-4 text-sm text-gray-500">جاري تحليل الملف ومطابقة الأعمدة...</p>
        )}

        {/* Preview */}
        {mapped.length > 0 && (
          <div className="mt-5 space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-emerald-400">
                {validRows.length} جاهز للحفظ
              </span>
              {badRows.length > 0 && (
                <span className="rounded-full bg-rose-500/15 px-3 py-1 text-rose-400">
                  {badRows.length} صف مرفوض
                </span>
              )}
              <button type="button" onClick={reset} className="text-gray-500 hover:text-gray-300">
                إلغاء
              </button>
            </div>

            <div className="max-h-[420px] overflow-auto rounded-lg border border-white/[0.06]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-900 text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-right font-medium">التاريخ</th>
                    <th className="px-3 py-2 text-right font-medium">النوع</th>
                    <th className="px-3 py-2 text-left font-medium">المبلغ</th>
                    <th className="px-3 py-2 text-right font-medium">الوصف</th>
                    <th className="px-3 py-2 text-right font-medium">الفئة المقترحة</th>
                    <th className="px-3 py-2 text-center font-medium">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {mapped.map((r) => (
                    <tr key={r.row} className="border-t border-white/[0.04]">
                      <td className="px-3 py-2 font-mono text-xs text-gray-400">{formatShortDate(r.date)}</td>
                      <td className="px-3 py-2 text-gray-300">{TYPE_LABELS[r.type]}</td>
                      <td className="px-3 py-2 text-left tabular-nums text-gray-200">
                        {formatCurrency(r.amount, 2)}
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-2 text-gray-400">{r.description || '—'}</td>
                      <td className="px-3 py-2 text-gray-300">{r.category_name ?? '—'}</td>
                      <td className="px-3 py-2 text-center">
                        {r.valid ? (
                          <span className="text-emerald-400" title={r.warnings.join(' · ')}>✓</span>
                        ) : (
                          <span className="text-rose-400" title={r.warnings.join(' · ')}>✗</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              className="btn-primary"
              disabled={validRows.length === 0 || commit.isPending}
              onClick={() => commit.mutate(validRows)}
            >
              {commit.isPending
                ? 'جاري الحفظ...'
                : `حفظ ${validRows.length} عملية${badRows.length > 0 ? ` (وتجاهل ${badRows.length} صف)` : ''}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
