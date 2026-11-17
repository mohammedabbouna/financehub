/**
 * Formatting helpers — single source of truth for currency and dates.
 * Locale/decimal separators are stable so numbers never flip between
 * Arabic-Indic and Latin digits depending on the runtime.
 */

import { isPrivacyHidden } from './privacy';

/** Mask shown instead of every amount while privacy mode is on. */
export const PRIVACY_MASK = '••••';

const CURRENCY = process.env.NEXT_PUBLIC_FINANCE_CURRENCY || 'DZD';

/** Currency symbols used for display next to amounts. */
const CURRENCY_LABELS: Record<string, string> = {
  DZD: 'دج',
  USD: '$',
  EUR: '€',
  MAD: 'د.م.',
  TND: 'د.ت',
};

export function currencySymbol(code: string = CURRENCY): string {
  return CURRENCY_LABELS[code] ?? code;
}

export function formatNumber(value: number | string | null | undefined, decimals = 2): string {
  const num = typeof value === 'string' ? Number.parseFloat(value) : value;
  if (num === null || num === undefined || Number.isNaN(num)) return '0';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** e.g. 1500 → "1,500.00 دج" (→ "•••• دج" in privacy mode) */
export function formatCurrency(value: number | string | null | undefined, decimals = 2): string {
  if (isPrivacyHidden()) return `${PRIVACY_MASK} ${currencySymbol()}`;
  return `${formatNumber(value, decimals)} ${currencySymbol()}`;
}

/** Compact form for tight spaces: 1500000 → "1.5M" (→ "••••" in privacy mode) */
export function formatCompact(value: number | string | null | undefined): string {
  if (isPrivacyHidden()) return PRIVACY_MASK;
  const num = typeof value === 'string' ? Number.parseFloat(value) : value;
  if (num === null || num === undefined || Number.isNaN(num)) return '0';
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(num);
}

/** Format a YYYY-MM-DD (or ISO) date in Arabic without timezone drift. */
export function formatDate(value: string | Date | null | undefined, locale = 'ar-DZ'): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? parseLocalDate(value) : value;
  if (!date || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatShortDate(value: string | Date | null | undefined, locale = 'ar-DZ'): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? parseLocalDate(value) : value;
  if (!date || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(locale, { year: 'numeric', month: '2-digit', day: '2-digit' });
}

/**
 * Parse "YYYY-MM-DD" as a LOCAL date (new Date("YYYY-MM-DD") is UTC and
 * can display the previous day in negative offsets).
 */
export function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Days remaining until a target date (negative = past). */
export function daysUntil(value: string | Date | null | undefined): number | null {
  const date = typeof value === 'string' ? parseLocalDate(value) : value;
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}
