'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Landmark } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { apiErrorMessage } from '@/lib/api';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const { login, pending2FA, verify2FA, cancel2FA } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      if (!pending2FA) {
        router.push('/dashboard');
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'حدث خطأ أثناء تسجيل الدخول'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setVerifying(true);
    try {
      await verify2FA(code);
      router.push('/dashboard');
    } catch (err) {
      setError(apiErrorMessage(err, 'رمز غير صحيح'));
    } finally {
      setVerifying(false);
    }
  };

  if (pending2FA) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-900">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Landmark size={40} strokeWidth={1.5} className="mx-auto text-blue-400" />
            <h1 className="text-2xl font-medium text-gray-100 mt-4">المصادقة (2FA)</h1>
            <p className="text-sm text-gray-500 mt-2">أدخل الرمز من تطبيق المصادقة</p>
          </div>
          <form onSubmit={handleVerify} className="card space-y-5">
            {error && (
              <div className="p-3 rounded-lg text-sm bg-red-500/10 text-red-400 border border-red-500/20">{error}</div>
            )}
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">رمز التحقق (6 أرقام)</label>
              <input
                type="text"
                className="input"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                minLength={6}
                dir="ltr"
                autoFocus
              />
            </div>
            <button type="submit" disabled={verifying || code.length < 6} className="btn-primary w-full">
              {verifying ? 'جاري التحقق...' : 'تحقق'}
            </button>
            <button type="button" onClick={cancel2FA} className="btn-secondary w-full">
              إلغاء
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-900">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Landmark size={40} strokeWidth={1.5} className="mx-auto text-blue-400" />
          <h1 className="text-2xl font-medium text-gray-100 mt-4">FinanceHub</h1>
          <p className="text-sm text-gray-500 mt-2">نظام التشغيل المالي الشخصي</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-5">
          <h2 className="text-lg font-medium text-center text-gray-100">تسجيل الدخول</h2>

          {error && (
            <div className="p-3 rounded-lg text-sm bg-red-500/10 text-red-400 border border-red-500/20">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-400 mb-1.5">البريد الإلكتروني</label>
            <input
              type="email"
              className="input"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              dir="ltr"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1.5">كلمة المرور</label>
            <input
              type="password"
              className="input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-gray-100/30 border-t-white rounded-full animate-spin" />
            ) : null}
            {loading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'}
          </button>

          <p className="text-center text-sm text-gray-400">
            ليس لديك حساب؟{' '}
            <a href="/register" className="text-blue-400 hover:text-blue-300">
              إنشاء حساب جديد
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}
