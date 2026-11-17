import React from 'react';
import './globals.css';
import Providers from '@/components/Providers';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';

export const metadata = {
  title: {
    default: 'FinanceHub - نظام التشغيل المالي الشخصي',
    template: '%s | FinanceHub',
  },
  description: 'منصة إدارة مالية شاملة مع مستشار ذكي',
  icons: { icon: '/favicon.svg' },
  manifest: '/manifest.json',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#3b82f6',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="antialiased">
        <Providers>{children}</Providers>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
