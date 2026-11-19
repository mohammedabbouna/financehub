'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '@/lib/api';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import Glyph from '@/components/ui/Glyph';
import { formatCurrency, formatShortDate } from '@/lib/format';
import type { Action, Category, Wallet, ParsedAction } from '@/types';

const ACTION_TYPES: { value: Action['type']; label: string; icon: string }[] = [
  { value: 'deposit', label: 'إيداع', icon: '💰' },
  { value: 'withdraw', label: 'سحب', icon: '💸' },
  { value: 'transfer', label: 'تحويل', icon: '🔄' },
  { value: 'invest', label: 'استثمار', icon: '📈' },
  { value: 'borrow', label: 'اقتراض', icon: '💳' },
  { value: 'repay', label: 'سداد دين', icon: '✅' },
];

interface ActionsResponse {
  actions: Action[];
}

interface WalletsResponse {
  wallets: Wallet[];
}

interface CategoriesResponse {
  categories: Category[];
}

/** Form fields are kept as raw strings (as the inputs produce them). */
interface ActionFormState {
  type: Action['type'];
  wallet_id: string;
  target_wallet_id: string;
  amount: string;
  category_id: string;
  description: string;
  date: string;
  tag: string;
}

const today = () => new Date().toISOString().split('T')[0];

const EMPTY_ACTION_FORM: ActionFormState = {
  type: 'withdraw',
  wallet_id: '',
  target_wallet_id: '',
  amount: '',
  category_id: '',
  description: '',
  date: today(),
  tag: '',
};

export default function ActionsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [showParse, setShowParse] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [editingAction, setEditingAction] = useState<Action | null>(null);
  const [editForm, setEditForm] = useState<{ category_id: string; description: string; date: string; tag: string }>({
    category_id: '',
    description: '',
    date: today(),
    tag: '',
  });
  const [parseText, setParseText] = useState('');
  const [parseResult, setParseResult] = useState<ParsedAction | null>(null);
  const [form, setForm] = useState<ActionFormState>(EMPTY_ACTION_FORM);

  const { data: walletsData, isError: walletsError, refetch: refetchWallets } = useQuery<WalletsResponse>({
    queryKey: ['wallets'],
    queryFn: () => api.getWallets(),
  });
  const { data: categoriesData, isError: categoriesError, refetch: refetchCategories } = useQuery<CategoriesResponse>({
    queryKey: ['categories'],
    queryFn: () => api.getCategories(),
  });
  const { data: actionsData, isLoading, isError: actionsError, refetch: refetchActions } = useQuery<ActionsResponse>({
    queryKey: ['actions'],
    queryFn: () => api.getActions(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createAction({
        type: form.type,
        wallet_id: Number(form.wallet_id),
        target_wallet_id: form.target_wallet_id ? Number(form.target_wallet_id) : null,
        amount: Number(form.amount),
        category_id: form.category_id ? Number(form.category_id) : null,
        description: form.description,
        date: form.date,
        tag: form.tag || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['actions'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      toast.success('تم تسجيل العملية بنجاح');
      setShowCreate(false);
      setForm(EMPTY_ACTION_FORM);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر تسجيل العملية. حاول مرة أخرى.')),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      api.updateAction(editingAction!.id, {
        category_id: editForm.category_id ? Number(editForm.category_id) : null,
        description: editForm.description,
        date: editForm.date,
        tag: editForm.tag || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['actions'] });
      toast.success('تم تحديث العملية بنجاح');
      setEditingAction(null);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر تحديث العملية. حاول مرة أخرى.')),
  });

  const parseMutation = useMutation({
    mutationFn: () => api.parseActionAi(parseText),
    onSuccess: (data: { parsed_action?: ParsedAction }) => setParseResult(data?.parsed_action ?? null),
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر تحليل النص. حاول مرة أخرى.')),
  });

  const wallets = walletsData?.wallets || [];
  const categories = categoriesData?.categories || [];
  const actions = actionsData?.actions || [];

  // Auto-select the first wallet when the list loads (so the user can submit immediately).
  React.useEffect(() => {
    if (!form.wallet_id && wallets.length > 0) {
      setForm((f) => ({ ...f, wallet_id: String(wallets[0].id) }));
    }
  }, [wallets, form.wallet_id]);

  const fillFromParse = () => {
    if (!parseResult) return;
    setForm({
      type: ACTION_TYPES.find((t) => t.value === parseResult.type)?.value ?? 'withdraw',
      wallet_id: parseResult.wallet_id != null ? String(parseResult.wallet_id) : '',
      target_wallet_id: parseResult.target_wallet_id != null ? String(parseResult.target_wallet_id) : '',
      amount: parseResult.amount != null ? String(parseResult.amount) : '',
      category_id: parseResult.category_id != null ? String(parseResult.category_id) : '',
      description: parseResult.description ?? '',
      date: parseResult.date || today(),
      tag: parseResult.tag ?? '',
    });
    setShowParse(false);
    setParseText('');
    setParseResult(null);
    setShowCreate(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner label="جاري تحميل العمليات..." />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-medium leading-9 text-gray-100">العمليات المالية</h1>
        <div className="flex gap-2">
          <button type="button" onClick={() => setShowParse(true)} className="btn-secondary">
            إدخال ذكي
          </button>
          <button type="button" onClick={() => setShowReceipt(true)} className="btn-secondary">
            مسح إيصال
          </button>
          <button type="button" onClick={() => setShowCreate(true)} className="btn-primary">
            + عملية جديدة
          </button>
        </div>
      </div>

      {/* Parse AI Modal */}
      <Modal
        open={showParse}
        onClose={() => setShowParse(false)}
        title="إدخال ذكي بالذكاء الاصطناعي"
        footer={
          <>
            <button type="button" onClick={() => setShowParse(false)} className="btn-secondary flex-1">
              إلغاء
            </button>
            {parseResult ? (
              <button type="button" onClick={fillFromParse} className="btn-primary flex-1">
                تعبئة النموذج
              </button>
            ) : (
              <button
                type="button"
                onClick={() => parseMutation.mutate()}
                disabled={!parseText || parseMutation.isPending}
                className="btn-primary flex-1"
              >
                {parseMutation.isPending ? 'جاري التحليل...' : 'تحليل'}
              </button>
            )}
          </>
        }
      >
        <p className="text-sm text-gray-400 mb-4">اكتب النص بالعربية وسيقوم المستشار باستخراج المعلومات</p>
        <label htmlFor="parse-text" className="sr-only">
          النص المراد تحليله
        </label>
        <textarea
          id="parse-text"
          className="input min-h-24 resize-none"
          placeholder="مثال: دفعت 2500 دج في السوبيرات اليوم"
          value={parseText}
          onChange={(e) => setParseText(e.target.value)}
        />
        {parseResult && (
          <div className="mt-3 space-y-2 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-sm">
            <p>
              <span className="text-gray-400">المبلغ:</span>{' '}
              {parseResult.amount != null ? (
                <span className="tabular-nums">{formatCurrency(parseResult.amount, 0)}</span>
              ) : null}
            </p>
            <p>
              <span className="text-gray-400">النوع:</span> {parseResult.type}
            </p>
            <p>
              <span className="text-gray-400">الفئة:</span> {parseResult.category_name}
            </p>
            <p>
              <span className="text-gray-400">الوصف:</span> {parseResult.description}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              نسبة الثقة: <span className="tabular-nums">{((parseResult.confidence || 0) * 100).toFixed(0)}%</span>
            </p>
          </div>
        )}
      </Modal>

      {/* Receipt OCR Modal */}
      <Modal
        open={showReceipt}
        onClose={() => { setShowReceipt(false); setReceiptError(null); }}
        title="مسح إيصال (OCR)"
        footer={
          <>
            <button type="button" onClick={() => { setShowReceipt(false); setReceiptError(null); }} className="btn-secondary flex-1">
              إلغاء
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-400">يتطلب مفتاح Anthropic (Claude Vision). ارفع صورة الإيصال.</p>
          {receiptError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{receiptError}</div>
          )}
          <input
            type="file"
            accept="image/*"
            className="input"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setReceiptLoading(true);
              setReceiptError(null);
              try {
                const reader = new FileReader();
                reader.onload = async () => {
                  try {
                    const dataUrl = String(reader.result);
                    const mime = file.type || 'image/jpeg';
                    const base64 = dataUrl.split(',')[1];
                    const res = await api.parseReceiptAi(base64, mime);
                    const pa = res.parsed_action;
                    if (!pa) { setReceiptError(res.error || 'تعذر التحليل'); return; }
                    setForm({
                      type: pa.type || 'withdraw',
                      wallet_id: pa.wallet_id != null ? String(pa.wallet_id) : '',
                      target_wallet_id: '',
                      amount: pa.amount != null ? String(pa.amount) : '',
                      category_id: pa.category_id != null ? String(pa.category_id) : '',
                      description: pa.description || '',
                      date: pa.date || today(),
                      tag: pa.tag || 'receipt',
                    });
                    setShowReceipt(false);
                    setShowCreate(true);
                  } catch (err) {
                    setReceiptError(apiErrorMessage(err, 'تعذر تحليل الإيصال.'));
                  } finally {
                    setReceiptLoading(false);
                  }
                };
                reader.readAsDataURL(file);
              } catch (err) {
                setReceiptError(apiErrorMessage(err, 'تعذر قراءة الملف.'));
                setReceiptLoading(false);
              }
            }}
            disabled={receiptLoading}
          />
          {receiptLoading && <Spinner label="جاري تحليل الإيصال..." />}
        </div>
      </Modal>

      {/* Create Modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="عملية مالية جديدة"
        footer={
          <>
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1">
              إلغاء
            </button>
            <button
              type="button"
              onClick={() => {
                if (!form.wallet_id || !form.amount) {
                  toast.error('يرجى اختيار المحفظة وإدخال المبلغ');
                  return;
                }
                createMutation.mutate();
              }}
              disabled={createMutation.isPending}
              className="btn-primary flex-1"
            >
              {createMutation.isPending ? 'جاري...' : 'تسجيل العملية'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {ACTION_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setForm({ ...form, type: t.value })}
                aria-pressed={form.type === t.value}
                className={`rounded-lg border p-3 text-center transition-colors ${
                  form.type === t.value
                    ? 'border-blue-500/30 bg-blue-500/10 text-gray-100'
                    : 'border-gray-700 text-gray-400 hover:border-gray-600'
                }`}
              >
                <span className="mb-1 flex w-full justify-center">
                  <Glyph name={t.icon} size={18} />
                </span>
                <span className="text-xs">{t.label}</span>
              </button>
            ))}
          </div>

          <div>
            <label htmlFor="action-amount" className="block text-sm text-gray-400 mb-2">
              المبلغ
            </label>
            <input
              id="action-amount"
              className="input"
              type="number"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="0.00"
            />
          </div>

          <div>
            <label htmlFor="action-wallet" className="block text-sm text-gray-400 mb-2">
              المحفظة
            </label>
            {walletsError ? (
              <div
                role="alert"
                className="flex items-center justify-between gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400"
              >
                <span>تعذر تحميل قائمة المحافظ</span>
                <button type="button" onClick={() => refetchWallets()} className="underline">
                  إعادة المحاولة
                </button>
              </div>
            ) : (
              <select
                id="action-wallet"
                className="input"
                value={form.wallet_id}
                onChange={(e) => setForm({ ...form, wallet_id: e.target.value })}
              >
                <option value="">اختر محفظة</option>
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({formatCurrency(w.balance, 0)})
                  </option>
                ))}
              </select>
            )}
          </div>

          {form.type === 'transfer' && (
            <div>
              <label htmlFor="action-target-wallet" className="block text-sm text-gray-400 mb-2">
                المحفظة الهدف
              </label>
              {walletsError ? (
                <div
                  role="alert"
                  className="flex items-center justify-between gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400"
                >
                  <span>تعذر تحميل قائمة المحافظ</span>
                  <button type="button" onClick={() => refetchWallets()} className="underline">
                    إعادة المحاولة
                  </button>
                </div>
              ) : (
                <select
                  id="action-target-wallet"
                  className="input"
                  value={form.target_wallet_id}
                  onChange={(e) => setForm({ ...form, target_wallet_id: e.target.value })}
                >
                  <option value="">اختر محفظة هدف</option>
                  {wallets
                    .filter((w) => w.id !== Number(form.wallet_id))
                    .map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                </select>
              )}
            </div>
          )}

          <div>
            <label htmlFor="action-category" className="block text-sm text-gray-400 mb-2">
              الفئة
            </label>
            {categoriesError ? (
              <div
                role="alert"
                className="flex items-center justify-between gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400"
              >
                <span>تعذر تحميل قائمة الفئات</span>
                <button type="button" onClick={() => refetchCategories()} className="underline">
                  إعادة المحاولة
                </button>
              </div>
            ) : (
              <select
                id="action-category"
                className="input"
                value={form.category_id}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              >
                <option value="">اختر فئة</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label htmlFor="action-description" className="block text-sm text-gray-400 mb-2">
              الوصف
            </label>
            <input
              id="action-description"
              className="input"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="وصف العملية"
            />
          </div>

          <div>
            <label htmlFor="action-date" className="block text-sm text-gray-400 mb-2">
              التاريخ
            </label>
            <input
              id="action-date"
              className="input"
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={!!editingAction}
        onClose={() => setEditingAction(null)}
        title="تعديل العملية"
        size="max-w-md"
        footer={
          <>
            <button type="button" onClick={() => setEditingAction(null)} className="btn-secondary flex-1">
              إلغاء
            </button>
            <button
              type="button"
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending}
              className="btn-primary flex-1"
            >
              {updateMutation.isPending ? 'جاري...' : 'حفظ'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="edit-action-category" className="block text-sm text-gray-400 mb-2">
              الفئة
            </label>
            <select
              id="edit-action-category"
              className="input"
              value={editForm.category_id}
              onChange={(e) => setEditForm({ ...editForm, category_id: e.target.value })}
            >
              <option value="">— بدون فئة —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="edit-action-description" className="block text-sm text-gray-400 mb-2">
              الوصف
            </label>
            <input
              id="edit-action-description"
              className="input"
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="edit-action-date" className="block text-sm text-gray-400 mb-2">
              التاريخ
            </label>
            <input
              id="edit-action-date"
              className="input"
              type="date"
              value={editForm.date}
              onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="edit-action-tag" className="block text-sm text-gray-400 mb-2">
              الوسم
            </label>
            <input
              id="edit-action-tag"
              className="input"
              value={editForm.tag}
              onChange={(e) => setEditForm({ ...editForm, tag: e.target.value })}
            />
          </div>
        </div>
      </Modal>

      {/* Actions List */}
      <div className="card">
        {actionsError ? (
          <div role="alert" className="py-8 text-center">
            <span className="mb-3 flex justify-center">
              <Glyph name="⚠️" size={18} className="text-gray-500" />
            </span>
            <p className="text-gray-100">تعذر تحميل العمليات</p>
            <p className="mt-1 text-sm text-gray-500">حدث خطأ أثناء جلب البيانات. تحقق من اتصالك ثم أعد المحاولة.</p>
            <button type="button" onClick={() => refetchActions()} className="btn-secondary mt-4">
              إعادة المحاولة
            </button>
          </div>
        ) : actions.length === 0 ? (
          <EmptyState icon="🧾" title="لا توجد عمليات مسجلة بعد" description="سجّل أول عملية مالية لتظهر هنا" />
        ) : (
          <div>
            {actions.map((action) => {
              const isInflow = action.type === 'deposit' || action.type === 'borrow';
              const isOutflow = action.type === 'withdraw' || action.type === 'invest' || action.type === 'repay';
              return (
                <div
                  key={action.id}
                  className="flex items-center gap-3 border-b border-gray-100/[0.06] py-3 last:border-0 last:pb-0 first:pt-0"
                >
                  <span className="flex w-[18px] shrink-0 justify-center">
                    <Glyph name={action.category_icon || '💳'} size={16} className="text-gray-500" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-gray-100">
                      {action.description || ACTION_TYPES.find((t) => t.value === action.type)?.label || action.type}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {action.wallet_name}
                      {action.target_wallet_name ? ` → ${action.target_wallet_name}` : ''}
                      {' · '}
                      <span className="font-mono">{formatShortDate(action.date)}</span>
                      {action.category_name ? ` · ${action.category_name}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAction(action);
                      setEditForm({
                        category_id: action.category_id != null ? String(action.category_id) : '',
                        description: action.description ?? '',
                        date: action.date,
                        tag: action.tag ?? '',
                      });
                    }}
                    aria-label={`تعديل عملية ${action.id}`}
                    className="shrink-0 rounded-lg px-2 py-1 text-xs text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-100"
                  >
                    تعديل
                  </button>
                  <div className="w-[104px] shrink-0 text-left">
                    <p
                      className={`font-medium ${isInflow ? 'text-emerald-400' : isOutflow ? 'text-red-400' : 'text-gray-100'}`}
                    >
                      <span dir="ltr" className="tabular-nums">
                        {isInflow ? '+' : isOutflow ? '-' : ''}
                        {formatCurrency(Math.abs(action.amount), 0)}
                      </span>
                    </p>
                    <span
                      className={`badge ${
                        action.type === 'deposit'
                          ? 'badge-green'
                          : action.type === 'withdraw'
                            ? 'badge-red'
                            : action.type === 'transfer'
                              ? 'badge-blue'
                              : action.type === 'invest'
                                ? 'badge-purple'
                                : 'badge-yellow'
                      }`}
                    >
                      {ACTION_TYPES.find((t) => t.value === action.type)?.label || action.type}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
