/**
 * AnimatedCounter — Rekomendasi #1
 * Animasi angka naik dari 0 ke target saat pertama kali mount.
 * Menggunakan framer-motion animate() yang sudah tersedia di package.json.
 */
import { useEffect, useRef, useState } from 'react';

export function useAnimatedCounter(target, duration = 1000) {
  const [display, setDisplay] = useState(0);
  const raf = useRef(null);

  useEffect(() => {
    if (target === 0 || target == null) { setDisplay(0); return; }
    const start = performance.now();
    const from = 0;
    const to = Number(target);

    const tick = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (progress < 1) {
        raf.current = requestAnimationFrame(tick);
      }
    };

    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);

  return display;
}

/**
 * KpiCard — KPI card dengan animated counter, ikon, label, dan trend indicator.
 */
export function KpiCard({ icon: Icon, iconBg, iconColor, value, label, sub, trend }) {
  const displayValue = useAnimatedCounter(value);

  return (
    <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs hover:shadow-md transition-shadow duration-200 group">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconBg}`}>
          <Icon className={`w-[18px] h-[18px] ${iconColor}`} />
        </div>
        {trend != null && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${trend >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}
          </span>
        )}
      </div>
      <div className="tabular-nums text-2xl font-black text-slate-800 tracking-tight leading-none">
        {displayValue.toLocaleString('id-ID')}
        {sub && <span className="text-sm text-slate-400 font-medium ml-1">{sub}</span>}
      </div>
      <div className="text-[11px] text-slate-500 font-semibold mt-1.5">{label}</div>
    </div>
  );
}
