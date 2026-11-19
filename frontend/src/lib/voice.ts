'use client';

import { useCallback, useRef, useState } from 'react';

export interface VoiceInputResult {
  supported: boolean;
  listening: boolean;
  transcript: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

/**
 * Thin wrapper around the Web Speech API (SpeechRecognition).
 * Falls back gracefully when unsupported (returns supported=false).
 */
export function useVoiceInput(lang = 'ar-DZ'): VoiceInputResult {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<any>(null);

  const supported =
    typeof window !== 'undefined' &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const start = useCallback(() => {
    if (!supported) {
      setError('المتصفح لا يدعم الإدخال الصوتي');
      return;
    }
    setError(null);
    setTranscript('');
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e: any) => {
      let t = '';
      for (let i = 0; i < e.results.length; i++) {
        t += e.results[i][0].transcript;
      }
      setTranscript(t);
    };
    rec.onerror = (e: any) => {
      setError(e?.error || 'خطأ في الإدخال الصوتي');
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setError('تعذر بدء الإدخال الصوتي');
      setListening(false);
    }
  }, [supported, lang]);

  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* ignore */ }
    setListening(false);
  }, []);

  const reset = useCallback(() => {
    setTranscript('');
    setError(null);
  }, []);

  return { supported, listening, transcript, error, start, stop, reset };
}