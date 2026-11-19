'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Landmark } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { apiErrorMessage } from '@/lib/api';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await register(name, email, password);
      router.push('/dashboard');
    } catch (err) {
      setError(apiErrorMessage(err, 'حدث خطأ أثناء إنشاء الحساب'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-900">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Landmark size={40} strokeWidth={1.5} className="mx-auto text-blue-400" />
          <h1 className="text-2xl font-medium text-gray-100 mt-4">FinanceHub</h1>
          <p className="text-sm text-gray-500 mt-2">ابدأ بتسجيل مصروفك ودخلك</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-5">
          <h2 className="text-lg font-medium text-center text-gray-100">إنشاء حساب جديد</h2>

          {error && (
            <div className="p-3 rounded-lg text-sm bg-red-500/10 text-red-400 border border-red-500/20">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-400 mb-1.5">الاسم</label>
            <input
              type="text"
              className="input"
              placeholder="الاسم الكامل"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

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
              placeholder="6 أحرف على الأقل"
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
            {loading ? 'جاري إنشاء الحساب...' : 'إنشاء الحساب'}
          </button>

          <p className="text-center text-sm text-gray-400">
            لديك حساب بالفعل؟{' '}
            <a href="/login" className="text-blue-400 hover:text-blue-300">
              تسجيل الدخول
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}
