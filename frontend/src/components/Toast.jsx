import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export const showToast = (message, type = 'success', title = '') => {
  window.dispatchEvent(
    new CustomEvent('mosa-toast', {
      detail: {
        id: Date.now() + Math.random(),
        message,
        type,
        title: title || (type === 'success' ? 'Sukses' : type === 'error' ? 'Kesalahan' : type === 'warning' ? 'Peringatan' : 'Informasi'),
      },
    })
  );
};

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handleToastEvent = (e) => {
      const newToast = e.detail;
      setToasts((prev) => [...prev, newToast]);

      // Auto dismiss after 3500ms
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
      }, 3800);
    };

    window.addEventListener('mosa-toast', handleToastEvent);
    return () => window.removeEventListener('mosa-toast', handleToastEvent);
  }, []);

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0 animate-fade-in">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-2xl shadow-xl border backdrop-blur-md transition-all duration-300 transform translate-y-0 ${
            t.type === 'success'
              ? 'bg-blue-900/95 border-blue-500/50 text-white'
              : t.type === 'error'
              ? 'bg-rose-900/95 border-rose-500/50 text-white'
              : t.type === 'warning'
              ? 'bg-amber-900/95 border-amber-500/50 text-white'
              : 'bg-slate-900/95 border-slate-700/50 text-white'
          }`}
        >
          <div className="shrink-0 mt-0.5">
            {t.type === 'success' && <CheckCircle2 className="w-5 h-5 text-blue-400" />}
            {t.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-400" />}
            {t.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-400" />}
            {t.type === 'info' && <Info className="w-5 h-5 text-blue-400" />}
          </div>

          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-bold leading-tight tracking-wide">{t.title}</h4>
            <p className="text-xs text-slate-200 mt-0.5 leading-relaxed break-words whitespace-pre-line">{t.message}</p>
          </div>

          <button
            onClick={() => removeToast(t.id)}
            className="shrink-0 p-1 hover:bg-white/10 rounded-lg text-slate-300 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
