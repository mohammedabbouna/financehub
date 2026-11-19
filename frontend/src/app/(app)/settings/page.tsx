'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import Glyph from '@/components/ui/Glyph';
import { formatCurrency } from '@/lib/format';
import * as push from '@/lib/push';
import type { AllocationRule, Wallet, Category } from '@/types';

const MODELS: Record<string, string[]> = {
  anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'llama-3.1-70b-versatile', 'mixtral-8x7b-32768', 'gemma2-9b-it', 'meta-llama/llama-4-scout-17b-16e-instruct', 'meta-llama/llama-4-maverick-17b-128e-instruct', 'qwen/qwen3-32b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'],
  'openai-compatible': [],
};

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'profile' | 'password' | 'ai' | 'notifications' | 'security' | 'business' | 'allocations'>('profile');

  // Profile form (initialized from context, reset on user change).
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  React.useEffect(() => {
    setName(user?.name || '');
    setEmail(user?.email || '');
  }, [user?.name, user?.email]);

  // Password form.
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // AI key state
  const { data: aiKeyData, refetch: refetchAiKey } = useQuery({
    queryKey: ['ai-key'],
    queryFn: () => api.getAiKey(),
    enabled: activeTab === 'ai',
  });
  React.useEffect(() => {
    if (aiKeyData) {
      setAiProvider(aiKeyData.provider || 'anthropic');
      setAiBaseUrl(aiKeyData.base_url || '');
      setAiModel(aiKeyData.model || '');
    }
  }, [aiKeyData]);
  const [aiKeyInput, setAiKeyInput] = useState('');
  const [aiProvider, setAiProvider] = useState('anthropic');
  const [aiBaseUrl, setAiBaseUrl] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [fetchedModels, setFetchedModels] = useState<string[] | null>(null);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  // 2FA state
  const [totpEnabled, setTotpEnabled] = useState<boolean>(!!user?.totp_enabled);
  const [totpSetup, setTotpSetup] = useState<{ secret: string; otpauth_uri: string; recovery_codes: string[] } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [totpLoading, setTotpLoading] = useState(false);

  // business mode state
  const { data: bizData } = useQuery({
    queryKey: ['business-mode'],
    queryFn: () => api.getBusinessMode(),
    enabled: activeTab === 'business',
  });
  const [bizEnabled, setBizEnabled] = useState(false);
  React.useEffect(() => {
    if (bizData) setBizEnabled(!!bizData.business_mode);
  }, [bizData]);

  React.useEffect(() => {
    if (activeTab !== 'notifications') return;
    push.isPushSubscribed().then(setPushSubscribed).catch(() => {});
    setPushSupported('serviceWorker' in navigator && 'PushManager' in window);
  }, [activeTab]);

  const saveProfile = useMutation({
    mutationFn: () => api.updateProfile({ name: name.trim(), email: email.trim() }),
    onSuccess: async () => {
      toast.success('تم تحديث الملف الشخصي');
      await refreshUser();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر تحديث الملف الشخصي.')),
  });

  const savePassword = useMutation({
    mutationFn: () =>
      api.changePassword({ current_password: currentPassword, new_password: newPassword }),
    onSuccess: () => {
      toast.success('تم تغيير كلمة المرور');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر تغيير كلمة المرور.')),
  });

  const fetchModels = useMutation({
    mutationFn: () => api.getAiModels(),
    onSuccess: (d) => {
      if (d.models && d.models.length > 0) {
        setFetchedModels(d.models);
        if (!d.models.includes(aiModel)) setAiModel(d.models[0]);
        toast.success(`تم جلب ${d.models.length} نموذج`);
      } else {
        toast.error('لم يتم العثور على نماذج');
      }
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر جلب النماذج. تحقق من المفتاح/Base URL.')),
  });

  const saveAiKey = useMutation({
    mutationFn: () =>
      api.setAiKey({
        api_key: aiKeyInput.trim() === '' ? null : aiKeyInput.trim(),
        provider: aiProvider,
        base_url: aiBaseUrl.trim() === '' ? null : aiBaseUrl.trim(),
        model: aiModel.trim() === '' ? null : aiModel.trim(),
        clear_key: aiKeyInput.trim() === '' ? true : undefined,
      }),
    onSuccess: (d) => {
      toast.success(d.message || 'تم حفظ الإعدادات');
      setAiKeyInput('');
      refetchAiKey();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر حفظ الإعدادات.')),
  });
  const submitPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('كلمتا المرور الجديدتان غير متطابقتين');
      return;
    }
    savePassword.mutate();
  };

  const {
    data: rulesData,
    isLoading: rulesLoading,
    isError: rulesError,
    refetch: refetchRules,
  } = useQuery({
    queryKey: ['allocation-rules'],
    queryFn: () => api.getAllocationRules(),
  });

  const { data: walletsData } = useQuery({
    queryKey: ['wallets'],
    queryFn: () => api.getWallets(),
  });

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.getCategories(),
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id: number) => api.deleteAllocationRule(id),
    onSuccess: () => {
      toast.success('تم حذف قاعدة التوزيع بنجاح');
      queryClient.invalidateQueries({ queryKey: ['allocation-rules'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر حذف قاعدة التوزيع. حاول مرة أخرى.')),
  });

  const rules: AllocationRule[] = rulesData?.rules || [];
  const wallets: Wallet[] = walletsData?.wallets || [];
  const categories: Category[] = categoriesData?.categories || [];

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-[28px] font-medium leading-9 text-gray-100">الإعدادات</h1>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          aria-pressed={activeTab === 'profile'}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'profile' ? 'bg-blue-500/15 text-blue-400' : 'bg-gray-800 text-gray-400 hover:text-gray-100'
          }`}
        >
          الملف الشخصي
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('password')}
          aria-pressed={activeTab === 'password'}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'password' ? 'bg-blue-500/15 text-blue-400' : 'bg-gray-800 text-gray-400 hover:text-gray-100'
          }`}
        >
          كلمة المرور
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('ai')}
          aria-pressed={activeTab === 'ai'}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'ai' ? 'bg-blue-500/15 text-blue-400' : 'bg-gray-800 text-gray-400 hover:text-gray-100'
          }`}
        >
          مفتاح الذكاء الاصطناعي
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('notifications')}
          aria-pressed={activeTab === 'notifications'}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'notifications' ? 'bg-blue-500/15 text-blue-400' : 'bg-gray-800 text-gray-400 hover:text-gray-100'
          }`}
        >
          الإشعارات
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('security')}
          aria-pressed={activeTab === 'security'}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'security' ? 'bg-blue-500/15 text-blue-400' : 'bg-gray-800 text-gray-400 hover:text-gray-100'
          }`}
        >
          المصادقة (2FA)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('business')}
          aria-pressed={activeTab === 'business'}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'business' ? 'bg-blue-500/15 text-blue-400' : 'bg-gray-800 text-gray-400 hover:text-gray-100'
          }`}
        >
          وضع الأعمال
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('allocations')}
          aria-pressed={activeTab === 'allocations'}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'allocations'
              ? 'bg-blue-500/15 text-blue-400'
              : 'bg-gray-800 text-gray-400 hover:text-gray-100'
          }`}
        >
          قواعد التوزيع
        </button>
      </div>

      {activeTab === 'profile' && (
        <div className="card max-w-2xl">
          <h3 className="mb-4 text-[15px] font-medium text-gray-100">الملف الشخصي</h3>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim() || !email.trim()) return;
              saveProfile.mutate();
            }}
          >
            <div>
              <label htmlFor="profile-name" className="block text-sm text-gray-400 mb-2">الاسم</label>
              <input
                id="profile-name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
              />
            </div>
            <div>
              <label htmlFor="profile-email" className="block text-sm text-gray-400 mb-2">البريد الإلكتروني</label>
              <input
                id="profile-email"
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                dir="ltr"
              />
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-gray-100/[0.06] bg-gray-800/40 p-3 text-sm text-gray-400">
              <Glyph name="🔒" size={16} />
              يتم تشفير جميع بياناتك بشكل آمن
            </div>
            <button
              type="submit"
              className="btn-primary"
              disabled={saveProfile.isPending || !name.trim() || !email.trim()}
            >
              {saveProfile.isPending ? 'جاري الحفظ...' : 'حفظ التغييرات'}
            </button>
          </form>
        </div>
      )}

      {activeTab === 'password' && (
        <div className="card max-w-2xl">
          <h3 className="mb-4 text-[15px] font-medium text-gray-100">تغيير كلمة المرور</h3>
          <form className="space-y-4" onSubmit={submitPassword}>
            <div>
              <label htmlFor="current-password" className="block text-sm text-gray-400 mb-2">
                كلمة المرور الحالية
              </label>
              <input
                id="current-password"
                type="password"
                className="input"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
                dir="ltr"
              />
            </div>
            <div>
              <label htmlFor="new-password" className="block text-sm text-gray-400 mb-2">
                كلمة المرور الجديدة (6 أحرف على الأقل)
              </label>
              <input
                id="new-password"
                type="password"
                className="input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                dir="ltr"
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-sm text-gray-400 mb-2">
                تأكيد كلمة المرور الجديدة
              </label>
              <input
                id="confirm-password"
                type="password"
                className="input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                dir="ltr"
              />
            </div>
            <button
              type="submit"
              className="btn-primary"
              disabled={
                savePassword.isPending ||
                !currentPassword ||
                newPassword.length < 6 ||
                newPassword !== confirmPassword
              }
            >
              {savePassword.isPending ? 'جاري التغيير...' : 'تغيير كلمة المرور'}
            </button>
          </form>
        </div>
      )}

      {activeTab === 'ai' && (
        <div className="card max-w-2xl">
          <h3 className="mb-4 text-[15px] font-medium text-gray-100">مزود الذكاء الاصطناعي ومفتاح API</h3>
          <p className="mb-4 text-sm text-gray-400">
            اختر المزود (Anthropic/OpenAI/متوافق مع OpenAI) وأدخل المفتاح. إذا لم تُدخل مفتاحاً، يعمل النظام
            بالتحليل المحلي. المفتاح يُخزَّن per-user.
          </p>
          <div className="mb-4 rounded-lg border border-gray-100/[0.06] bg-gray-800/40 p-3 text-sm">
            <p className="text-gray-400">
              الحالة: <span className="text-gray-100">{aiKeyData?.has_key ? 'مفتاح مخصص محفوظ' : aiKeyData?.source === 'env' ? 'يستخدم المفتاح العام (env)' : 'لا يوجد مفتاح — وضع محلي'}</span>
            </p>
            {aiKeyData?.masked && (
              <p className="mt-1 font-mono text-xs text-gray-500" dir="ltr">{aiKeyData.masked}</p>
            )}
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">المزود</label>
              <select className="input" value={aiProvider} onChange={(e) => {
                const p = e.target.value;
                setAiProvider(p);
                // reset model to provider default
                const defaults: Record<string, string> = {
                  anthropic: 'claude-3-5-sonnet-20241022',
                  openai: 'gpt-4o-mini',
                  groq: 'llama-3.3-70b-versatile',
                  'openai-compatible': '',
                };
                setAiModel(defaults[p] || '');
                const urls: Record<string, string> = {
                  anthropic: '',
                  openai: 'https://api.openai.com/v1',
                  groq: 'https://api.groq.com/openai/v1',
                  'openai-compatible': '',
                };
                setAiBaseUrl(urls[p] || '');
              }}>
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="openai">OpenAI</option>
                <option value="groq">Groq (مجاني/سريع)</option>
                <option value="openai-compatible">متوافق مع OpenAI (Mistral, Together, ...)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Base URL (اختياري — للمزودات المتوافقة)</label>
              <input className="input" dir="ltr" placeholder={aiProvider === 'openai' ? 'https://api.openai.com/v1' : aiProvider === 'groq' ? 'https://api.groq.com/openai/v1' : aiProvider === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.example.com/v1'} value={aiBaseUrl} onChange={(e) => setAiBaseUrl(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">النموذج</label>
              <div className="flex gap-2">
                <select className="input flex-1" value={(fetchedModels || MODELS[aiProvider] || []).includes(aiModel) ? aiModel : '__custom__'} onChange={(e) => {
                  const v = e.target.value;
                  if (v !== '__custom__') setAiModel(v);
                }}>
                  {(fetchedModels || MODELS[aiProvider] || []).map((m) => <option key={m} value={m}>{m}</option>)}
                  <option value="__custom__">مخصص (أدخل يدوياً)</option>
                </select>
                <button type="button" onClick={() => fetchModels.mutate()} disabled={fetchModels.isPending} className="btn-secondary shrink-0">
                  {fetchModels.isPending ? '...' : 'جلب النماذج'}
                </button>
              </div>
              {(!(fetchedModels || MODELS[aiProvider] || []).includes(aiModel)) && (
                <input className="input mt-2" dir="ltr" placeholder="model-id" value={aiModel} onChange={(e) => setAiModel(e.target.value)} />
              )}
            </div>
            <div>
              <label htmlFor="ai-key" className="block text-sm text-gray-400 mb-2">
                مفتاح API
              </label>
              <input
                id="ai-key"
                type="password"
                className="input"
                dir="ltr"
                placeholder={aiKeyData?.masked ? 'أدخل مفتاحاً جديداً للاستبدال' : 'sk-...'}
                value={aiKeyInput}
                onChange={(e) => setAiKeyInput(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-primary"
                disabled={saveAiKey.isPending}
                onClick={() => saveAiKey.mutate()}
              >
                {saveAiKey.isPending ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
              </button>
              {aiKeyData?.has_key && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setAiKeyInput('');
                    saveAiKey.mutate();
                  }}
                  disabled={saveAiKey.isPending}
                >
                  حذف المفتاح
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'notifications' && (
        <div className="card max-w-2xl">
          <h3 className="mb-4 text-[15px] font-medium text-gray-100">إشعارات Push (Web Push)</h3>
          <p className="mb-4 text-sm text-gray-400">
            استقبل تذكيرات الفواتير، الميزانيات، والتنبيهات على جهازك حتى عندما يكون التطبيق مغلقاً.
          </p>
          {!pushSupported ? (
            <p className="text-sm text-amber-400">المتصفح لا يدعم إشعارات Push.</p>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-100/[0.06] bg-gray-800/40 p-3 text-sm">
                <p className="text-gray-400">
                  الحالة: <span className="text-gray-100">{pushSubscribed ? 'مشترك ✓' : 'غير مشترك'}</span>
                </p>
              </div>
              <button
                type="button"
                className={pushSubscribed ? 'btn-secondary' : 'btn-primary'}
                disabled={pushLoading}
                onClick={async () => {
                  setPushLoading(true);
                  try {
                    if (pushSubscribed) {
                      await push.unsubscribeFromPush();
                      setPushSubscribed(false);
                      toast.success('تم إلغاء اشتراك الإشعارات');
                    } else {
                      const perm = await Notification.requestPermission();
                      if (perm !== 'granted') {
                        toast.error('لم يتم منح إذن الإشعارات');
                        return;
                      }
                      const sub = await push.subscribeToPush();
                      if (!sub) {
                        toast.error('تعذر الاشتراك');
                        return;
                      }
                      await push.sendSubscriptionToBackend(sub);
                      setPushSubscribed(true);
                      toast.success('تم الاشتراك في الإشعارات');
                    }
                  } catch {
                    toast.error('تعذر تنفيذ العملية');
                  } finally {
                    setPushLoading(false);
                  }
                }}
              >
                {pushLoading ? 'جاري...' : pushSubscribed ? 'إلغاء الاشتراك' : 'تفعيل الإشعارات'}
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'security' && (
        <div className="card max-w-2xl">
          <h3 className="mb-4 text-[15px] font-medium text-gray-100">المصادقة الثنائية (2FA / TOTP)</h3>
          <p className="mb-4 text-sm text-gray-400">
            أضف طبقة أمان إضافية. استخدم تطبيق مصادقة (Google Authenticator, Authy, 1Password...).
          </p>

          {!totpEnabled ? (
            <div className="space-y-4">
              {!totpSetup ? (
                <button
                  type="button"
                  className="btn-primary"
                  disabled={totpLoading}
                  onClick={async () => {
                    setTotpLoading(true);
                    try {
                      const r = await api.setup2fa();
                      setTotpSetup({ secret: r.secret, otpauth_uri: r.otpauth_uri, recovery_codes: r.recovery_codes });
                    } catch (e) {
                      toast.error(apiErrorMessage(e, 'تعذر إعداد 2FA.'));
                    } finally {
                      setTotpLoading(false);
                    }
                  }}
                >
                  {totpLoading ? 'جاري...' : 'تفعيل 2FA'}
                </button>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg border border-gray-100/[0.06] bg-gray-800/40 p-4 text-center">
                    <p className="mb-2 text-sm text-gray-400">امسح رمز QR في تطبيق المصادقة</p>
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(totpSetup.otpauth_uri)}`}
                      alt="QR code for 2FA"
                      className="mx-auto rounded-lg"
                      width={200}
                      height={200}
                    />
                    <p className="mt-3 font-mono text-xs text-gray-500 break-all" dir="ltr">{totpSetup.secret}</p>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">أدخل الرمز (6 أرقام)</label>
                    <input className="input" dir="ltr" maxLength={6} value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))} />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="btn-primary flex-1" disabled={totpLoading || totpCode.length !== 6}
                      onClick={async () => {
                        setTotpLoading(true);
                        try {
                          const r = await api.verifySetup2fa(totpCode);
                          setTotpEnabled(true);
                          setTotpSetup(null);
                          setTotpCode('');
                          toast.success('تم تفعيل 2FA');
                          if (r.recovery_codes) {
                            alert('رموز الاسترداد (احفظها في مكان آمن):\\n' + r.recovery_codes.join('\\n'));
                          }
                        } catch (e) {
                          toast.error(apiErrorMessage(e, 'رمز غير صحيح.'));
                        } finally {
                          setTotpLoading(false);
                        }
                      }}>
                      {totpLoading ? 'جاري...' : 'تأكيد وتفعيل'}
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => { setTotpSetup(null); setTotpCode(''); }}>إلغاء</button>
                  </div>
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-400">
                    <p className="font-medium">رموز الاسترداد (احفظها):</p>
                    <p className="mt-1 font-mono" dir="ltr">{totpSetup.recovery_codes.join('  ')}</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
                ✓ المصادقة الثنائية مُفعَّلة
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">أدخل رمز (أو رمز استرداد) للتعطيل</label>
                <input className="input" dir="ltr" value={totpCode} onChange={(e) => setTotpCode(e.target.value)} />
              </div>
              <button
                type="button"
                className="btn-secondary"
                disabled={totpLoading || !totpCode}
                onClick={async () => {
                  setTotpLoading(true);
                  try {
                    await api.disable2fa(totpCode);
                    setTotpEnabled(false);
                    setTotpCode('');
                    toast.success('تم تعطيل 2FA');
                  } catch (e) {
                    toast.error(apiErrorMessage(e, 'رمز غير صحيح.'));
                  } finally {
                    setTotpLoading(false);
                  }
                }}
              >
                {totpLoading ? 'جاري...' : 'تعطيل 2FA'}
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'business' && (
        <div className="card max-w-2xl">
          <h3 className="mb-4 text-[15px] font-medium text-gray-100">وضع الأعمال (Business Mode)</h3>
          <p className="mb-4 text-sm text-gray-400">
            فعّل وضع الأعمال لعرض أقسام العملاء، الفواتير (Invoices)، والأرباح والخسائر (P&L) في القائمة الجانبية.
          </p>
          <div className="flex items-center justify-between rounded-lg border border-gray-100/[0.06] bg-gray-800/40 p-4">
            <div>
              <p className="text-sm text-gray-200">وضع الأعمال</p>
              <p className="text-xs text-gray-500">{bizEnabled ? 'مُفعَّل' : 'معطّل'}</p>
            </div>
            <button
              type="button"
              className={bizEnabled ? 'btn-secondary' : 'btn-primary'}
              onClick={async () => {
                try {
                  const r = await api.setBusinessMode(!bizEnabled);
                  setBizEnabled(r.business_mode);
                  toast.success(r.message);
                } catch (e) {
                  toast.error(apiErrorMessage(e, 'تعذر التحديث.'));
                }
              }}
            >
              {bizEnabled ? 'تعطيل' : 'تفعيل'}
            </button>
          </div>
          {bizEnabled && (
            <p className="mt-4 text-xs text-gray-500">
              أقسام الأعمال (العملاء، الفواتير، P&L) متاحة الآن في القائمة الجانبية.
            </p>
          )}
        </div>
      )}

      {activeTab === 'allocations' && (
        <div className="card max-w-3xl">
          <h3 className="mb-4 text-[15px] font-medium text-gray-100">قواعد التوزيع الذكي للدخل</h3>

          {rulesLoading ? (
            <Spinner label="جاري تحميل قواعد التوزيع..." />
          ) : rulesError ? (
            <EmptyState
              icon="⚠️"
              title="تعذر تحميل قواعد التوزيع"
              description="تعذر جلب البيانات من الخادم. تحقق من اتصالك ثم أعد المحاولة."
              action={
                <button type="button" onClick={() => refetchRules()} className="btn-secondary">
                  إعادة المحاولة
                </button>
              }
            />
          ) : rules.length > 0 ? (
            <div>
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center justify-between gap-3 border-b border-gray-100/[0.06] py-3 last:border-0 last:pb-0 first:pt-0"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex w-[18px] shrink-0 justify-center">
                      <Glyph
                        name={rule.target_type === 'wallet' ? '💰' : '📂'}
                        size={16}
                        className="text-gray-500"
                      />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-100">
                        {rule.target_type === 'wallet'
                          ? wallets.find((w) => w.id === rule.target_id)?.name || 'محفظة'
                          : categories.find((c) => c.id === rule.target_id)?.name || 'فئة'}
                      </p>
                      <p className="truncate text-xs text-gray-500">
                        <span className="tabular-nums">
                          {rule.allocation_type === 'percentage'
                            ? `${rule.allocation_value}%`
                            : formatCurrency(rule.allocation_value, 0)}
                        </span>
                        {rule.target_type === 'wallet' ? ' من الدخل → محفظة' : ' من الدخل → فئة'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-sm text-red-400 transition-colors hover:text-red-300 disabled:opacity-50"
                    disabled={deleteRuleMutation.isPending}
                    onClick={() => {
                      if (window.confirm('هل تريد حذف قاعدة التوزيع؟')) {
                        deleteRuleMutation.mutate(rule.id);
                      }
                    }}
                  >
                    حذف
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="📋"
              title="لا توجد قواعد توزيع بعد"
              description="عند تسجيل دخل، سيقوم النظام باقتراح توزيع ذكي يمكنك الموافقة عليه"
            />
          )}
        </div>
      )}
    </div>
  );
}
