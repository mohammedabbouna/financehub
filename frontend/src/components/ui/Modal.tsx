'use client';

import React, { useEffect, useRef } from 'react';
import Glyph from '@/components/ui/Glyph';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Optional footer actions rendered under the body. */
  footer?: React.ReactNode;
  /** Width class override, e.g. "max-w-lg". */
  size?: string;
}

/**
 * Accessible dialog: Escape closes, focus moves in on open and returns to the
 * trigger on close, background scroll is locked, and ARIA roles are set.
 */
export default function Modal({ open, onClose, title, children, footer, size = 'max-w-lg' }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  // Keep the latest onClose without re-running the effect on every render:
  // an unstable onClose (inline arrow) would otherwise retrigger the
  // focus-timer on each keystroke and jump the caret to the first field.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus the first field/button inside the dialog — ONCE, on open.
    const focusTimer = window.setTimeout(() => {
      const target = panelRef.current?.querySelector<HTMLElement>(
        'input, select, textarea, button:not([aria-label="إغلاق"])'
      );
      (target ?? panelRef.current)?.focus();
    }, 30);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(focusTimer);
      previousFocusRef.current?.focus?.();
    };
  }, [open]); // only `open`: onClose is read via ref to keep focus stable

  if (!open) return null;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`relative w-full ${size} max-h-[90vh] overflow-y-auto rounded-2xl border border-gray-700 bg-gray-800 p-6`}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-medium text-gray-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-700 hover:text-gray-100"
          >
            <Glyph name="✕" size={18} />
          </button>
        </div>

        <div>{children}</div>

        {footer && <div className="mt-6 flex items-center justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
}