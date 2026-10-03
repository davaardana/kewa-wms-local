import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import Portal from './Portal';

export default function GlobalLoading() {
  const [inFlightCount, setInFlightCount] = useState(0);

  useEffect(() => {
    const handleStart = () => setInFlightCount((c) => c + 1);
    const handleEnd = () => setInFlightCount((c) => Math.max(0, c - 1));

    window.addEventListener('mosa-mutation-start', handleStart);
    window.addEventListener('mosa-mutation-end', handleEnd);

    return () => {
      window.removeEventListener('mosa-mutation-start', handleStart);
      window.removeEventListener('mosa-mutation-end', handleEnd);
    };
  }, []);

  if (inFlightCount === 0) return null;

  return (
    <Portal>
      {/* Top indeterminate animated progress bar */}
      <div className="fixed top-0 left-0 right-0 z-[99999] h-1 bg-slate-200 overflow-hidden">
        <div className="w-full h-full bg-gradient-to-r from-blue-500 via-blue-400 to-blue-600 animate-pulse origin-left" />
      </div>

      {/* Full page transparent barrier to prevent double clicks */}
      <div className="fixed inset-0 z-[99998] bg-slate-950/25 backdrop-blur-[1px] flex items-center justify-center pointer-events-auto cursor-wait select-none animate-fade-in">
        <div className="bg-slate-900/95 text-white border border-slate-700/80 px-6 py-4 rounded-3xl shadow-2xl flex items-center gap-3.5 animate-in zoom-in-95 duration-100">
          <Loader2 className="w-6 h-6 text-blue-400 animate-spin shrink-0" />
          <div>
            <div className="text-xs font-bold tracking-tight text-white">Memproses Transaksi...</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Menghubungi server, mohon tunggu sebentar</div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
