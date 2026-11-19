'use client';

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Landmark, LogOut, Eye, EyeOff, ChevronDown } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { togglePrivacy, subscribePrivacy, isPrivacyHidden } from '@/lib/privacy';
import { toggleTheme, subscribeTheme, getTheme } from '@/lib/theme';
import { OPEN_COMMAND_EVENT } from '@/lib/events';
import NotificationsBell from '@/components/NotificationsBell';
import Glyph from '@/components/ui/Glyph';

interface NavItem { href: string; label: string; icon: string; }
interface NavGroup { title: string; items: NavItem[]; }

/** Sidebar destinations grouped into principal categories. */
export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'الرئيسية',
    items: [
      { href: '/dashboard', label: 'لوحة التحكم', icon: '📊' },
      { href: '/calendar', label: 'التقويم', icon: '📅' },
      { href: '/ai-chat', label: 'المستشار الذكي', icon: '🤖' },
    ],
  },
  {
    title: 'الإدارة اليومية',
    items: [
      { href: '/wallets', label: 'المحافظ', icon: '💰' },
      { href: '/actions', label: 'العمليات', icon: '💳' },
      { href: '/recurring', label: 'المعاملات المتكررة', icon: '🔄' },
      { href: '/bills', label: 'الفواتير', icon: '🧾' },
      { href: '/installments', label: 'الأقساط', icon: '📆' },
    ],
  },
  {
    title: 'التخطيط والتحكم',
    items: [
      { href: '/budgets', label: 'الميزانيات', icon: '📋' },
      { href: '/goals', label: 'الأهداف', icon: '🎯' },
      { href: '/emergency-fund', label: 'صندوق الطوارئ', icon: '🆘' },
      { href: '/cashflow', label: 'التدفقات المتوقعة', icon: '📈' },
    ],
  },
  {
    title: 'الثروة والأصول',
    items: [
      { href: '/networth', label: 'صافي الثروة', icon: '🏦' },
      { href: '/investments', label: 'الاستثمارات', icon: '📈' },
      { href: '/gold', label: 'الذهب', icon: '🥇' },
      { href: '/currencies', label: 'العملات', icon: '💱' },
      { href: '/real-estate', label: 'العقارات', icon: '🏠' },
    ],
  },
  {
    title: 'الالتزامات والمجتمع',
    items: [
      { href: '/zakat', label: 'الزكاة', icon: '🕌' },
      { href: '/tontines', label: 'العمّارية', icon: '🤝' },
      { href: '/contacts', label: 'الأشخاص والديون', icon: '👥' },
    ],
  },
  {
    title: 'البيانات والتقارير',
    items: [
      { href: '/insights', label: 'الرؤى والتقارير', icon: '💡' },
      { href: '/reports', label: 'التقرير الشهري', icon: '📄' },
      { href: '/reports/annual', label: 'التقرير السنوي (ضريبة)', icon: '📊' },
      { href: '/import', label: 'الاستيراد والتصدير', icon: '📥' },
      { href: '/reconciliation', label: 'مطابقة كشف الحساب', icon: '🔄' },
      { href: '/smart-rules', label: 'القواعد الذكية', icon: '⚙️' },
      { href: '/categories', label: 'الفئات', icon: '🗂️' },
      { href: '/audit', label: 'سجل التدقيق', icon: '📜' },
    ],
  },
  {
    title: 'الأعمال',
    items: [
      { href: '/clients', label: 'العملاء', icon: '👥' },
      { href: '/invoices', label: 'الفواتير (Invoices)', icon: '🧾' },
      { href: '/profit-loss', label: 'الأرباح والخسائر', icon: '📊' },
    ],
  },
];

/** Back-compat: flat list used by the command palette. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [isMac, setIsMac] = useState(false);
  const privacyHidden = useSyncExternalStore(subscribePrivacy, isPrivacyHidden, () => false);
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => 'dark');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    NAV_GROUPS.forEach((g) => (init[g.title] = true));
    return init;
  });

  useEffect(() => {
    setIsMac(navigator.platform.toLowerCase().includes('mac'));
  }, []);

  const toggleGroup = (title: string) =>
    setOpenGroups((prev) => ({ ...prev, [title]: !prev[title] }));

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-l border-gray-800 bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="flex w-[18px] shrink-0 justify-center">
            <Landmark size={18} strokeWidth={1.5} className="text-gray-500" />
          </span>
          <span className="text-base font-medium text-gray-100">FinanceHub</span>
        </Link>
        <NotificationsBell />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(OPEN_COMMAND_EVENT))}
          className="mb-2 flex w-full items-center gap-2.5 rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-1.5 text-sm text-gray-400 transition-colors hover:border-gray-700 hover:text-gray-100"
          title="الإدخال السريع (بحث + تسجيل عملية)"
        >
          <NavIcon name="🔍" />
          <span className="flex-1 truncate text-right">بحث وإدخال سريع</span>
          <kbd className="kbd">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
        </button>

        {NAV_GROUPS.map((group) => {
          const isOpen = openGroups[group.title] !== false;
          return (
            <div key={group.title} className="pt-2">
              <button
                type="button"
                onClick={() => toggleGroup(group.title)}
                className="flex w-full items-center justify-between px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-gray-500 transition-colors hover:text-gray-300"
                aria-expanded={isOpen}
              >
                <span>{group.title}</span>
                <ChevronDown
                  size={12}
                  className={`transition-transform ${isOpen ? '' : '-rotate-90'}`}
                />
              </button>
              {isOpen && (
                <div className="mt-0.5 space-y-0.5">
                  {group.items.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={isActive ? 'page' : undefined}
                        className={`flex items-center gap-2.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                          isActive
                            ? 'border-blue-500/30 bg-blue-500/10 font-medium text-blue-400'
                            : 'border-transparent text-gray-400 hover:bg-gray-800/60 hover:text-gray-100'
                        }`}
                      >
                        <NavIcon name={item.icon} />
                        <span className="flex-1 truncate text-right">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        <Link
          href="/settings"
          aria-current={pathname === '/settings' || pathname.startsWith('/settings/') ? 'page' : undefined}
          className={`mt-3 flex items-center gap-2.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
            pathname === '/settings' || pathname.startsWith('/settings/')
              ? 'border-blue-500/30 bg-blue-500/10 font-medium text-blue-400'
              : 'border-transparent text-gray-400 hover:bg-gray-800/60 hover:text-gray-100'
          }`}
        >
          <NavIcon name="⚙️" />
          <span className="flex-1 truncate text-right">الإعدادات</span>
        </Link>

        <button
          type="button"
          onClick={toggleTheme}
          className="mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-500 transition-colors hover:text-gray-200"
          title={theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي'}
        >
          <span className="flex w-[18px] shrink-0 justify-center">
            {theme === 'dark' ? '☀️' : '🌙'}
          </span>
          <span className="flex-1 text-right">{theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي'}</span>
        </button>
        <button
          type="button"
          onClick={togglePrivacy}
          aria-pressed={privacyHidden}
          className="mt-3 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-500 transition-colors hover:text-gray-200"
          title={privacyHidden ? 'إظهار المبالغ' : 'إخفاء المبالغ (وضع الخصوصية)'}
        >
          <span className="flex w-[18px] shrink-0 justify-center">
            {privacyHidden ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
          </span>
          <span className="flex-1 text-right">{privacyHidden ? 'إظهار المبالغ' : 'إخفاء المبالغ'}</span>
        </button>
      </nav>

      <div className="border-t border-gray-800 p-3">
        <div className="mb-2 flex items-center gap-2 px-2 text-sm text-gray-400">
          <span className="flex w-[18px] shrink-0 justify-center">
            <Glyph name="👤" size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-gray-200">{user?.name || 'مستخدم'}</p>
            <p className="truncate text-xs text-gray-500">{user?.email}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-500 transition-colors hover:text-gray-200"
        >
          <span className="flex w-[18px] shrink-0 justify-center">
            <LogOut size={16} strokeWidth={1.5} />
          </span>
          <span className="flex-1 text-right">تسجيل الخروج</span>
        </button>
      </div>
    </aside>
  );
}

function NavIcon({ name }: { name: string }) {
  // Map emoji to lucide via Glyph (already handles emoji→lucide).
  return <Glyph name={name} size={16} className="text-gray-500" />;
}