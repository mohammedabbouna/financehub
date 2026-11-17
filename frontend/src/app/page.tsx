'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Landmark } from 'lucide-react';
import { useAuth } from '@/lib/auth';

export default function HomePage() {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (isAuthenticated) {
        router.push('/dashboard');
      } else {
        router.push('/login');
      }
    }
  }, [loading, isAuthenticated, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="flex flex-col items-center gap-4">
        <Landmark size={40} strokeWidth={1.5} className="text-blue-400" />
        <h1 className="text-2xl font-medium text-gray-100">FinanceHub</h1>
        <p className="text-sm text-gray-500">جاري التوجيه…</p>
        <span className="inline-block w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );
}
