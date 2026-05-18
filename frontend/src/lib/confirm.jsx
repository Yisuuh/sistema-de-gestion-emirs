import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ExclamationTriangleIcon,
  TrashIcon,
  InformationCircleIcon,
  PaperAirplaneIcon,
  ArrowLeftStartOnRectangleIcon,
} from '@heroicons/react/24/outline';

// ─── Variant configs ───────────────────────────────────────────────────────────
const VARIANTS = {
  danger: {
    Icon: TrashIcon,
    iconColor: '#df000a',
    iconBg: 'rgba(223, 0, 10, 0.14)',
    accentColor: '#df000a',
    confirmCls: 'bg-[#df000a] hover:bg-[#c4000a] text-white',
    defaultLabel: 'Eliminar',
  },
  warning: {
    Icon: ExclamationTriangleIcon,
    iconColor: '#f59e0b',
    iconBg: 'rgba(245, 158, 11, 0.14)',
    accentColor: '#f59e0b',
    confirmCls: 'bg-amber-500 hover:bg-amber-600 text-white',
    defaultLabel: 'Continuar',
  },
  leave: {
    Icon: ArrowLeftStartOnRectangleIcon,
    iconColor: '#f59e0b',
    iconBg: 'rgba(245, 158, 11, 0.14)',
    accentColor: '#f59e0b',
    confirmCls: 'bg-amber-500 hover:bg-amber-600 text-white',
    defaultLabel: 'Salir',
  },
  info: {
    Icon: InformationCircleIcon,
    iconColor: '#3b82f6',
    iconBg: 'rgba(59, 130, 246, 0.14)',
    accentColor: '#3b82f6',
    confirmCls: 'bg-blue-500 hover:bg-blue-600 text-white',
    defaultLabel: 'Confirmar',
  },
  send: {
    Icon: PaperAirplaneIcon,
    iconColor: '#10b981',
    iconBg: 'rgba(16, 185, 129, 0.14)',
    accentColor: '#10b981',
    confirmCls: 'bg-emerald-500 hover:bg-emerald-600 text-white',
    defaultLabel: 'Enviar',
  },
};

// ─── Context ───────────────────────────────────────────────────────────────────
const ConfirmCtx = createContext(null);

// ─── Dialog component ──────────────────────────────────────────────────────────
function ConfirmDialog({ state, onConfirm, onCancel }) {
  const variant = VARIANTS[state.variant ?? 'danger'];
  const { Icon } = variant;

  // Dismiss on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0, 0, 0, 0.78)', backdropFilter: 'blur(5px)' }}
      onClick={onCancel}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl overflow-hidden"
        style={{
          background: 'var(--c-card)',
          border: '1px solid var(--c-border-md)',
          boxShadow: `0 32px 64px rgba(0,0,0,0.55), 0 0 0 1px ${variant.accentColor}20`,
          animation: 'dialog-in 0.22s cubic-bezier(0.34, 1.2, 0.64, 1) both',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Colored accent bar at top */}
        <div style={{ height: '3px', background: variant.accentColor }} />

        {/* Content */}
        <div className="px-6 pt-7 pb-6 text-center">
          {/* Icon circle */}
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-4"
            style={{ background: variant.iconBg }}
          >
            <Icon className="w-7 h-7" style={{ color: variant.iconColor }} />
          </div>

          {/* Title */}
          <h3
            className="font-display font-bold uppercase text-base mb-2"
            style={{ color: 'var(--c-text-1)', letterSpacing: '0.07em' }}
          >
            {state.title}
          </h3>

          {/* Message */}
          {state.message && (
            <p
              className="text-sm leading-relaxed mb-6"
              style={{ color: 'var(--c-text-2)' }}
            >
              {state.message}
            </p>
          )}
          {!state.message && <div className="mb-5" />}

          {/* Actions */}
          <div className="flex gap-2.5">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 hover:brightness-110"
              style={{
                background: 'var(--c-elevated)',
                color: 'var(--c-text-2)',
                border: '1px solid var(--c-border)',
              }}
            >
              {state.cancelLabel ?? 'Cancelar'}
            </button>
            <button
              onClick={onConfirm}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 active:scale-95 ${variant.confirmCls}`}
            >
              {state.confirmLabel ?? variant.defaultLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Provider ──────────────────────────────────────────────────────────────────
export function ConfirmProvider({ children }) {
  const [dialogState, setDialogState] = useState(null);
  const resolveRef = useRef(null);

  const confirm = useCallback((opts) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setDialogState(typeof opts === 'string' ? { title: opts } : opts);
    });
  }, []);

  const handleConfirm = useCallback(() => {
    resolveRef.current?.(true);
    setDialogState(null);
  }, []);

  const handleCancel = useCallback(() => {
    resolveRef.current?.(false);
    setDialogState(null);
  }, []);

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {dialogState && (
        <ConfirmDialog
          state={dialogState}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </ConfirmCtx.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────────────
export function useConfirm() {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error('useConfirm must be used within <ConfirmProvider>');
  return ctx;
}
