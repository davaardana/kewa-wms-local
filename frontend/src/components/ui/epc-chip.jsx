/**
 * EpcChip — Rekomendasi #10
 * Tag EPC yang bisa di-klik untuk copy ke clipboard.
 * Menampilkan tooltip dengan EPC lengkap + nama item saat hover.
 */
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export default function EpcChip({ epc, itemName, className = '' }) {
  const [copied, setCopied] = useState(false);

  if (!epc) return <span className="text-slate-400 text-[11px]">—</span>;

  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(epc).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }).catch(() => {
      // fallback for older browsers
      const el = document.createElement('textarea');
      el.value = epc;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  const display = epc.length > 14 ? `${epc.slice(0, 8)}…${epc.slice(-4)}` : epc;

  return (
    <span className={`relative group inline-flex items-center ${className}`}>
      <button
        type="button"
        onClick={handleCopy}
        title={`Klik untuk copy: ${epc}`}
        className={`
          inline-flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded-md border
          transition-all duration-150 cursor-pointer
          ${copied
            ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
            : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700'
          }
        `}
      >
        {copied
          ? <Check className="w-2.5 h-2.5 flex-shrink-0" />
          : <Copy className="w-2.5 h-2.5 flex-shrink-0 opacity-50 group-hover:opacity-100" />
        }
        <span>{display}</span>
      </button>

      {/* Tooltip */}
      <span className="
        pointer-events-none absolute bottom-full left-0 mb-1.5
        hidden group-hover:flex flex-col
        bg-slate-900 text-white text-[10px] px-2.5 py-1.5 rounded-lg
        whitespace-nowrap z-50 shadow-xl
        before:content-[''] before:absolute before:top-full before:left-3
        before:border-4 before:border-transparent before:border-t-slate-900
      ">
        <span className="font-mono tracking-wider">{epc}</span>
        {itemName && <span className="text-slate-400 font-sans mt-0.5">{itemName}</span>}
      </span>
    </span>
  );
}
