'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import Glyph from '@/components/ui/Glyph';
import type { AppNotification } from '@/types';

interface NotificationsResponse {
  notifications: AppNotification[];
  unread_count: number;
}

const TYPE_ICONS: Record<string, string> = {
  bill_due: '🧾',
  bill_overdue: '🧾',
  budget_warning: '📊',
  budget_exceeded: '📊',
  debt_due: '🤝',
  debt_overdue: '🤝',
  recurring_failed: '🔄',
  anomaly: '⚠️',
};

/** Arabic counted noun: 1 → singular, 2 → dual, 3–10 → plural, 11+ → singular. */
function counted(n: number, one: string, two: string, few: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return few;
  return one;
}

/** "منذ 5 دقائق" style label without pulling in a date library. */
function relativeTime(value: string): string {
  const timestamp = new Date(value.replace(' ', 'T')).getTime();
  if (Number.isNaN(timestamp)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'الآن';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `منذ ${minutes} ${counted(minutes, 'دقيقة', 'دقيقتين', 'دقائق')}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} ${counted(hours, 'ساعة', 'ساعتين', 'ساعات')}`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `منذ ${days} ${counted(days, 'يوم', 'يومين', 'أيام')}`;
  const months = Math.floor(days / 30);
  return `منذ ${months} ${counted(months, 'شهر', 'شهرين', 'أشهر')}`;
}

/**
 * Sidebar bell: polls the inbox every minute, opens a dropdown with the
 * latest notifications, marks one/all as read, and deep-links to the
 * relevant screen (bills, budgets, contacts, insights, recurring).
 */
export default function NotificationsBell() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: async (): Promise<NotificationsResponse> => api.getNotifications(),
    refetchInterval: 60_000,
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unread_count ?? 0;

  // Close when clicking outside (or on Escape).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const markReadMutation = useMutation({
    mutationFn: (id: number) => api.markNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر تعليم الإشعار كمقروء')),
  });

  const markAllMutation = useMutation({
    mutationFn: () => api.markAllNotificationsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('تم تعليم كل الإشعارات كمقروءة');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر تعليم الإشعارات')),
  });

  const openNotification = (notification: AppNotification) => {
    if (!notification.is_read) {
      markReadMutation.mutate(notification.id);
    }
    setOpen(false);
    if (notification.link) {
      router.push(notification.link);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`الإشعارات${unreadCount > 0 ? ` (${unreadCount} غير مقروء)` : ''}`}
        aria-expanded={open}
        className="relative rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-100"
      >
        <Glyph name="🔔" size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -left-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 font-mono text-[10px] text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="قائمة الإشعارات"
          className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-gray-700 bg-gray-800"
        >
          <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3">
            <h3 className="text-sm font-medium text-gray-100">الإشعارات</h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllMutation.mutate()}
                disabled={markAllMutation.isPending}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                تعليم الكل كمقروء
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-500">لا توجد إشعارات</p>
            ) : (
              notifications.slice(0, 20).map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  role="menuitem"
                  onClick={() => openNotification(notification)}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-right transition-colors hover:bg-gray-700/60 ${
                    notification.is_read ? 'opacity-70' : 'bg-blue-500/5'
                  }`}
                >
                  <span className="mt-0.5 flex w-[18px] shrink-0 justify-center text-gray-400">
                    <Glyph name={TYPE_ICONS[notification.type] ?? '🔔'} size={18} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="flex-1 truncate text-sm text-gray-100">
                        {notification.title}
                      </span>
                      {!notification.is_read && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" aria-label="غير مقروء" />
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-gray-400">
                      {notification.body}
                    </span>
                    <span className="mt-1 block text-[11px] text-gray-500">
                      {relativeTime(notification.created_at)}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
