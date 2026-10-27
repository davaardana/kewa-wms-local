/**
 * CommandPalette — Rekomendasi #5
 * Global search & navigation modal (Cmd+K / Ctrl+K).
 * Navigasi cepat ke semua halaman + pencarian dokumen recent.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, LayoutDashboard, FileText, Tag, Package,
  Radio, History, Users, X, ArrowRight, Command
} from 'lucide-react';

const allPages = [
  { id: 'dashboard',         label: 'Dashboard',          icon: LayoutDashboard, desc: 'Ringkasan sistem & KPI', roles: ['superadmin','pm','pic_lapangan'] },
  { id: 'shipping-documents',label: 'Dokumen Barang',     icon: FileText,         desc: 'Buat & kelola dokumen barang masuk/keluar', roles: ['superadmin','pm','pic_lapangan'] },
  { id: 'tag-enrollment',    label: 'Pendaftaran Tag',    icon: Tag,              desc: 'Daftarkan tag RFID ke item material', roles: ['superadmin','pm'] },
  { id: 'master-data',       label: 'Master Data',        icon: Package,          desc: 'Kelola material, gudang, proyek', roles: ['superadmin','pm'] },
  { id: 'rfid-gate',         label: 'RFID Gate Monitor',  icon: Radio,            desc: 'Pantau perlintasan RFID real-time', roles: ['superadmin','pm','pic_lapangan'] },
  { id: 'laporan',           label: 'Laporan & Audit',    icon: History,          desc: 'Stok, kartu stok, audit trail', roles: ['superadmin','pm','pic_lapangan'] },
  { id: 'user-management',   label: 'Kelola Pengguna',    icon: Users,            desc: 'Tambah & atur akses pengguna', roles: ['superadmin'] },
];

export default function CommandPalette({ isOpen, onClose, onNavigate, currentUser }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  const [activeIdx, setActiveIdx] = useState(0);

  const userRole = currentUser?.role || 'superadmin';

  const filtered = allPages.filter(p =>
    p.roles.includes(userRole) &&
    (query === '' ||
      p.label.toLowerCase().includes(query.toLowerCase()) ||
      p.desc.toLowerCase().includes(query.toLowerCase()))
  );

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleSelect = useCallback((pageId) => {
    onNavigate(pageId);
    onClose();
  }, [onNavigate, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx(i => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[activeIdx]) handleSelect(filtered[activeIdx].id);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, filtered, activeIdx, handleSelect, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9000] bg-slate-950/60 backdrop-blur-sm flex items-start justify-center pt-[10vh] px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
        style={{ animation: 'cmdPaletteIn 0.15s cubic-bezier(0.16,1,0.3,1)' }}>

        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100">
          <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Cari menu atau halaman…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="flex-1 text-sm text-slate-800 placeholder:text-slate-400 outline-none bg-transparent"
          />
          <kbd className="hidden sm:flex items-center gap-1 text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-mono">
            ESC
          </kbd>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg transition">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* Results */}
        <ul className="py-1.5 max-h-[60vh] overflow-y-auto">
          {filtered.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-slate-400">
              Tidak ada halaman yang cocok
            </li>
          )}
          {filtered.map((page, idx) => {
            const Icon = page.icon;
            const isActive = idx === activeIdx;
            return (
              <li key={page.id}>
                <button
                  onClick={() => handleSelect(page.id)}
                  onMouseEnter={() => setActiveIdx(idx)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    isActive ? 'bg-blue-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    isActive ? 'bg-blue-100' : 'bg-slate-100'
                  }`}>
                    <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-slate-500'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-semibold ${isActive ? 'text-blue-700' : 'text-slate-800'}`}>
                      {page.label}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">{page.desc}</div>
                  </div>
                  <ArrowRight className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-blue-400' : 'text-slate-300'}`} />
                </button>
              </li>
            );
          })}
        </ul>

        {/* Footer hint */}
        <div className="px-4 py-2.5 border-t border-slate-100 flex items-center gap-3 text-[10px] text-slate-400">
          <span className="flex items-center gap-1">
            <kbd className="bg-slate-100 px-1 py-0.5 rounded font-mono">↑↓</kbd> navigasi
          </span>
          <span className="flex items-center gap-1">
            <kbd className="bg-slate-100 px-1 py-0.5 rounded font-mono">↵</kbd> pilih
          </span>
          <span className="ml-auto flex items-center gap-1">
            <Command className="w-3 h-3" /> K untuk buka
          </span>
        </div>
      </div>
    </div>
  );
}
