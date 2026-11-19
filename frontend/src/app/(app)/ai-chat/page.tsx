'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api, apiErrorMessage } from '@/lib/api';
import Glyph from '@/components/ui/Glyph';
import type { AffordabilityAnalysis, ChatResponse } from '@/types';

interface ChatMessage {
  role: 'user' | 'assistant';
  message: string;
  analysis?: AffordabilityAnalysis | null;
}

export default function AIChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: historyData, isLoading: historyLoading, isError: historyError } = useQuery({
    queryKey: ['chat-history'],
    queryFn: () => api.getChatHistory(),
    enabled: messages.length === 0,
  });

  const { data: aiKeyStatus } = useQuery({
    queryKey: ['ai-key'],
    queryFn: () => api.getAiKey(),
  });

  useEffect(() => {
    if (historyData?.history && messages.length === 0) {
      setMessages(
        historyData.history.map((m: { role: string; message: string }) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          message: m.message,
        }))
      );
    }
  }, [historyData, messages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const chatMutation = useMutation({
    mutationFn: (text: string) => api.sendChatMessage(text),
    onSuccess: (data: ChatResponse) => {
      setSendError(null);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          message: data.response ?? 'لم يتم استلام رد.',
          analysis: data.analysis ?? null,
        },
      ]);
    },
    onError: (error, text) => {
      // Roll back the optimistic bubble and restore the draft.
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'user' && last.message === text) {
          next.pop();
        }
        return next;
      });
      setInput(text);
      setSendError(apiErrorMessage(error, 'تعذر إرسال الرسالة. حاول مرة أخرى.'));
    },
  });

  const handleSend = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!text || chatMutation.isPending) return;

      setMessages((prev) => [...prev, { role: 'user', message: text }]);
      setInput('');
      setSendError(null);
      chatMutation.mutate(text);
    },
    [input, chatMutation]
  );

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] animate-fade-in">
      <div className="mb-4">
        <h1 className="text-[28px] font-medium leading-9 text-gray-100">المستشار المالي الذكي</h1>
        <p className="mt-1 text-sm text-gray-400">
          اسأل عن أموالك، حلل إنفاقك، احصل على نصائح مخصصة
        </p>
        {aiKeyStatus && !aiKeyStatus.ai_available && (
          <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-400">
            ⚠️ لا يوجد مفتاح API — يعمل النظام بالتحليل المحلي.{' '}
            <a href="/settings" className="underline hover:text-amber-300">ضبط مفتاح في الإعدادات</a>
          </div>
        )}
        {aiKeyStatus && aiKeyStatus.ai_available && aiKeyStatus.source === 'user' && (
          <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-400">
            ✓ مفتاح {aiKeyStatus.provider || 'AI'} مُفعَّل — التحليل الذكي متاح.
          </div>
        )}
      </div>

      <div className="card flex flex-col flex-1 overflow-hidden min-h-0">
        {/* Messages */}
        <div
          className="flex-1 overflow-y-auto space-y-4 p-4"
          aria-live="polite"
          aria-label="سجل المحادثة"
        >
          {messages.length === 0 && !historyLoading && (
            <div className="py-12 text-center">
              <span
                aria-hidden="true"
                className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-gray-800 bg-gray-900/60"
              >
                <Glyph name="🤖" size={18} className="text-gray-500" />
              </span>
              <p className="text-gray-400">ابدأ محادثة مع مستشارك المالي</p>
              <p className="mt-2 text-sm text-gray-500">
                مثال: كم صرفت على المطاعم هذا الشهر؟
              </p>
            </div>
          )}

          {historyLoading && (
            <div className="flex justify-center py-8">
              <span
                aria-hidden="true"
                className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-gray-500 border-t-transparent"
              />
            </div>
          )}

          {historyError && messages.length === 0 && !historyLoading && (
            <div className="py-12 text-center">
              <p className="text-gray-400">تعذر تحميل سجل المحادثة</p>
              <p className="mt-2 text-sm text-gray-500">
                يمكنك بدء محادثة جديدة — سيُحفظ تلقائياً
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={`${msg.role}-${i}`}
              className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl p-4 ${
                  msg.role === 'user'
                    ? 'bg-blue-500/10 text-gray-100 rounded-br-sm'
                    : 'bg-gray-800 text-gray-100 rounded-bl-sm'
                }`}
              >
                {msg.role === 'assistant' && (
                  <p className="mb-2 text-xs text-gray-500">المستشار المالي</p>
                )}

                {/* Structured affordability verdict («هل أ semiclass؟») */}
                {msg.role === 'assistant' && msg.analysis && (
                  <div className="mb-3 rounded-xl border border-gray-100/[0.06] bg-gray-900/70 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-gray-400">نتيجة التحليل</span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          msg.analysis.verdict === 'yes'
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : msg.analysis.verdict === 'caution'
                              ? 'bg-amber-500/15 text-amber-400'
                              : 'bg-rose-500/15 text-rose-400'
                        }`}
                      >
                        {msg.analysis.verdict_label}
                      </span>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {msg.analysis.checks.map((c) => (
                        <li key={c.key} className="flex items-start gap-2 text-xs leading-5">
                          <span className={c.passed ? 'text-emerald-400' : 'text-rose-400'} aria-hidden>
                            {c.passed ? '✓' : '✗'}
                          </span>
                          <span className="text-gray-400">{c.label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.message}</p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {sendError && (
          <div
            role="alert"
            className="mx-4 mb-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400"
          >
            {sendError}
          </div>
        )}

        {/* Input */}
        <form onSubmit={handleSend} className="flex gap-3 border-t border-gray-100/[0.06] p-4">
          <label htmlFor="chat-input" className="sr-only">
            اكتب سؤالك
          </label>
          <input
            id="chat-input"
            className="input flex-1"
            placeholder="اكتب سؤالك هنا..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={chatMutation.isPending}
            maxLength={2000}
          />
          <button
            type="submit"
            disabled={!input.trim() || chatMutation.isPending}
            className="btn-primary px-6 disabled:opacity-50"
          >
            {chatMutation.isPending ? (
              <span
                aria-hidden="true"
                className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-900/30 border-t-gray-900"
              />
            ) : (
              'إرسال'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
