import React from 'react';
import Link from 'next/link';

export const metadata = {
  title: 'الصفحة غير موجودة',
};

export default function NotFound() {
  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center bg-gray-900 p-6">
      <div className="max-w-md w-full text-center space-y-5">
        <p className="font-mono text-6xl text-gray-700" aria-hidden="true">
          404
        </p>
        <h1 className="text-xl font-medium text-gray-100">الصفحة غير موجودة</h1>
        <p className="text-sm text-gray-400">
          الرابط الذي طلبته غير صحيح أو تم نقل هذه الصفحة.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Link href="/dashboard" className="btn-primary text-sm">
            العودة إلى لوحة التحكم
          </Link>
          <Link href="/" className="btn-secondary text-sm">
            الصفحة الرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}
