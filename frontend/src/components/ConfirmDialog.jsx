import React, { useState, useEffect } from 'react';
import { AlertTriangle, Trash2, HelpCircle, X } from 'lucide-react';
import Portal from './Portal';

let confirmResolver = null;

export const showConfirm = ({
  title = 'Konfirmasi Tindakan',
  message = 'Apakah Anda yakin ingin melanjutkan tindakan ini?',
  confirmText = 'Lanjutkan',
  cancelText = 'Batal',
  type = 'warning', // 'warning' | 'danger' | 'info'
}) => {
  return new Promise((resolve) => {
    confirmResolver = resolve;
    window.dispatchEvent(
      new CustomEvent('mosa-confirm', {
        detail: { title, message, confirmText, cancelText, type },
      })
    );
  });
};

export default function ConfirmDialogContainer() {
  const [dialog, setDialog] = useState(null);

  useEffect(() => {
    const handleConfirmEvent = (e) => {
      setDialog(e.detail);
    };

    window.addEventListener('mosa-confirm', handleConfirmEvent);
    return () => window.removeEventListener('mosa-confirm', handleConfirmEvent);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && dialog) {
        handleChoice(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dialog]);

  const handleChoice = (result) => {
    if (confirmResolver) {
      confirmResolver(result);
      confirmResolver = null;
    }
    setDialog(null);
  };

  if (!dialog) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in" onClick={() => handleChoice(false)}>
        <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl border border-slate-100 space-y-5 animate-in zoom-in-95 duration-150" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start gap-3.5">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-xs ${
                dialog.type === 'danger'
                  ? 'bg-rose-100 text-rose-600 border border-rose-200'
                  : dialog.type === 'info'
                  ? 'bg-blue-100 text-blue-600 border border-blue-200'
                  : 'bg-amber-100 text-amber-600 border border-amber-200'
              }`}
            >
              {dialog.type === 'danger' ? (
                <Trash2 className="w-5 h-5" />
              ) : dialog.type === 'info' ? (
                <HelpCircle className="w-5 h-5" />
              ) : (
                <AlertTriangle className="w-5 h-5" />
              )}
            </div>

            <div className="flex-1 min-w-0 pt-0.5">
              <h3 className="text-base font-bold text-slate-900 tracking-tight">{dialog.title}</h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed whitespace-pre-line">{dialog.message}</p>
            </div>

            <button
              type="button"
              aria-label="Tutup dialog konfirmasi"
              onClick={() => handleChoice(false)}
              className="w-11 h-11 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => handleChoice(false)}
              className="min-h-[44px] px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-slate-400 transition cursor-pointer"
            >
              {dialog.cancelText}
            </button>
            <button
              type="button"
              onClick={() => handleChoice(true)}
              className={`min-h-[44px] px-5 py-2.5 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-offset-2 cursor-pointer ${
                dialog.type === 'danger'
                  ? 'bg-rose-600 hover:bg-rose-700 focus:ring-rose-500'
                  : dialog.type === 'info'
                  ? 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
                  : 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500'
              }`}
            >
              {dialog.confirmText}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
