'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '@/lib/api';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import Glyph from '@/components/ui/Glyph';
import type { Category } from '@/types';

interface CategoriesResponse { categories: Category[]; }

const TYPES = [
  { value: 'expense', label: 'مصروف', icon: '💸' },
  { value: 'income', label: 'دخل', icon: '💰' },
];

export default function CategoriesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: '', type: 'expense', parent_id: '', icon: '📁', color: '#6b7280' });
  const [editForm, setEditForm] = useState({ name: '', type: 'expense', parent_id: '', icon: '📁', color: '#6b7280' });

  const { data, isLoading, isError, refetch } = useQuery<CategoriesResponse>({
    queryKey: ['categories'],
    queryFn: () => api.getCategories(),
  });
  const categories = data?.categories || [];
  const parents = (type: string) => categories.filter((c) => c.type === type && (c as Category).parent_id == null);

  const createMutation = useMutation({
    mutationFn: () =>
      api.createCategory({
        name: form.name.trim(),
        type: form.type,
        icon: form.icon,
        color: form.color,
        parent_id: form.parent_id ? Number(form.parent_id) : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('تم إنشاء الفئة');
      setShowCreate(false);
      setForm({ name: '', type: 'expense', parent_id: '', icon: '📁', color: '#6b7280' });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر إنشاء الفئة.')),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      api.updateCategory(editing!.id, {
        name: editForm.name.trim(),
        type: editForm.type,
        icon: editForm.icon,
        color: editForm.color,
        parent_id: editForm.parent_id ? Number(editForm.parent_id) : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('تم تحديث الفئة');
      setEditing(null);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر تحديث الفئة.')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('تم حذف الفئة');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'تعذر حذف الفئة (قد تكون فئة نظام).')),
  });

  if (isLoading) return <div className="flex justify-center py-20"><Spinner label="جاري تحميل الفئات..." /></div>;

  // group by type then parent
  const grouped = (type: string) => {
    const mains = categories.filter((c) => c.type === type && !(c as Category).parent_id);
    return mains.map((m) => ({
      main: m,
      subs: categories.filter((c) => c.type === type && (c as Category).parent_id === m.id),
    }));
  };
  const orphans = (type: string) => categories.filter((c) => c.type === type && (c as Category).parent_id && !categories.find((c2) => c2.id === (c as Category).parent_id));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-medium leading-9 text-gray-100">الفئات</h1>
          <p className="mt-1 text-sm text-gray-400">إدارة الفئات (رئيسية/ثانوية) — فئات النظام غير قابلة للتعديل</p>
        </div>
        <button type="button" onClick={() => setShowCreate(true)} className="btn-primary">
          + فئة جديدة
        </button>
      </div>

      {isError ? (
        <div className="card py-10 text-center">
          <p className="text-gray-100">تعذر تحميل الفئات</p>
          <button type="button" onClick={() => refetch()} className="btn-secondary mt-4">إعادة المحاولة</button>
        </div>
      ) : categories.length === 0 ? (
        <div className="card"><EmptyState icon="🗂️" title="لا توجد فئات" description="أنشئ فئتك الأولى" /></div>
      ) : (
        TYPES.map((t) => (
          <div key={t.value} className="card">
            <h2 className="mb-4 text-[15px] font-medium text-gray-100">{t.icon} {t.label}</h2>
            <div className="space-y-3">
              {grouped(t.value).map(({ main, subs }) => (
                <div key={main.id} className="rounded-lg border border-white/[0.06] bg-gray-900/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Glyph name={main.icon || '📁'} size={16} className="text-gray-500" />
                      <span className="font-medium text-gray-200">{main.name}</span>
                      {main.is_system && <span className="badge bg-gray-800 text-gray-500 text-[10px]">نظام</span>}
                    </div>
                    {!main.is_system && (
                      <div className="flex gap-2 text-xs">
                        <button type="button" className="text-gray-500 hover:text-gray-200" onClick={() => { setEditing(main); setEditForm({ name: main.name, type: main.type, parent_id: main.parent_id ? String(main.parent_id) : '', icon: main.icon || '📁', color: main.color || '#6b7280' }); }}>تعديل</button>
                        <button type="button" className="text-rose-500 hover:text-rose-400" onClick={() => { if (confirm('حذف هذه الفئة؟')) deleteMutation.mutate(main.id); }}>حذف</button>
                      </div>
                    )}
                  </div>
                  {subs.length > 0 && (
                    <ul className="mt-2 space-y-1 border-r-2 border-white/[0.06] pr-3">
                      {subs.map((s) => (
                        <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                          <div className="flex items-center gap-2 text-gray-300">
                            <Glyph name={s.icon || '📁'} size={14} className="text-gray-500" />
                            <span>{s.name}</span>
                          </div>
                          {!s.is_system && (
                            <div className="flex gap-2 text-xs">
                              <button type="button" className="text-gray-500 hover:text-gray-200" onClick={() => { setEditing(s); setEditForm({ name: s.name, type: s.type, parent_id: s.parent_id ? String(s.parent_id) : '', icon: s.icon || '📁', color: s.color || '#6b7280' }); }}>تعديل</button>
                              <button type="button" className="text-rose-500 hover:text-rose-400" onClick={() => { if (confirm('حذف هذه الفئة؟')) deleteMutation.mutate(s.id); }}>حذف</button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              {orphans(t.value).map((o) => (
                <div key={o.id} className="rounded-lg border border-white/[0.06] bg-gray-900/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Glyph name={o.icon || '📁'} size={16} className="text-gray-500" />
                      <span className="text-gray-200">{o.name}</span>
                    </div>
                    {!o.is_system && (
                      <div className="flex gap-2 text-xs">
                        <button type="button" className="text-gray-500 hover:text-gray-200" onClick={() => { setEditing(o); setEditForm({ name: o.name, type: o.type, parent_id: o.parent_id ? String(o.parent_id) : '', icon: o.icon || '📁', color: o.color || '#6b7280' }); }}>تعديل</button>
                        <button type="button" className="text-rose-500 hover:text-rose-400" onClick={() => { if (confirm('حذف هذه الفئة؟')) deleteMutation.mutate(o.id); }}>حذف</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="فئة جديدة" size="max-w-md"
        footer={
          <>
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1">إلغاء</button>
            <button type="button" onClick={() => createMutation.mutate()} disabled={!form.name.trim() || createMutation.isPending} className="btn-primary flex-1">
              {createMutation.isPending ? 'جاري...' : 'إنشاء'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">الاسم</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">النوع</label>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">الفئة الرئيسية (اختياري)</label>
            <select className="input" value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })}>
              <option value="">— بدون (رئيسية) —</option>
              {parents(form.type).map((p) => <option key={p.id} value={p.id}>{p.icon} {p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">الأيقونة</label>
            <input className="input" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">اللون</label>
            <input className="input" type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="تعديل الفئة" size="max-w-md"
        footer={
          <>
            <button type="button" onClick={() => setEditing(null)} className="btn-secondary flex-1">إلغاء</button>
            <button type="button" onClick={() => updateMutation.mutate()} disabled={!editForm.name.trim() || updateMutation.isPending} className="btn-primary flex-1">
              {updateMutation.isPending ? 'جاري...' : 'حفظ'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">الاسم</label>
            <input className="input" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">النوع</label>
            <select className="input" value={editForm.type} onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}>
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">الفئة الرئيسية (اختياري)</label>
            <select className="input" value={editForm.parent_id} onChange={(e) => setEditForm({ ...editForm, parent_id: e.target.value })}>
              <option value="">— بدون (رئيسية) —</option>
              {parents(editForm.type).filter((p) => p.id !== editing?.id).map((p) => <option key={p.id} value={p.id}>{p.icon} {p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">الأيقونة</label>
            <input className="input" value={editForm.icon} onChange={(e) => setEditForm({ ...editForm, icon: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">اللون</label>
            <input className="input" type="color" value={editForm.color} onChange={(e) => setEditForm({ ...editForm, color: e.target.value })} />
          </div>
        </div>
      </Modal>
    </div>
  );
}