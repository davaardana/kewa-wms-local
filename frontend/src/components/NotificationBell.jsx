/**
 * NotificationBell — Rekomendasi #8
 * Bell icon dengan badge unread count + panel notifikasi slide-in.
 * Otomatis menangkap gate mismatch events dari SSE stream.
 * Disimpan di localStorage, max 20 notifikasi.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, X, AlertTriangle, CheckCircle2, Radio, Trash2 } from 'lucide-react';

const STORAGE_KEY = 'mosa_notifications';
const MAX_NOTIFS = 20;

function loadNotifications() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveNotifications(notifs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifs.slice(0, MAX_NOTIFS)));
  } catch {}
}

export function useNotifications() {
  const [notifications, setNotifications] = useState(loadNotifications);

  const addNotification = useCallback((notif) => {
    setNotifications(prev => {
      const next = [{ ...notif, id: Date.now() + Math.random(), at: new Date().toISOString(), read: false }, ...prev]
        .slice(0, MAX_NOTIFS);
      saveNotifications(next);
      return next;
    });
  }, []);

  const markAllRead = () => {
    setNotifications(prev => {
      const next = prev.map(n => ({ ...n, read: true }));
      saveNotifications(next);
      return next;
    });
  };

  const clearAll = () => {
    setNotifications([]);
    saveNotifications([]);
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return { notifications, addNotification, markAllRead, clearAll, unreadCount };
}

// Global emitter: panggil ini dari mana saja untuk push notifikasi
export function pushNotification(notif) {
  window.dispatchEvent(new CustomEvent('mosa-notification', { detail: notif }));
}

export default function NotificationBell({ className = '' }) {
  const { notifications, addNotification, markAllRead, clearAll, unreadCount } = useNotifications();
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  // Subscribe to global notification events — stable ref prevents double-register
  useEffect(() => {
    const handler = (e) => addNotification(e.detail);
    window.addEventListener('mosa-notification', handler);
    return () => window.removeEventListener('mosa-notification', handler);
  }, [addNotification]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleOpen = () => {
    const next = !open;
    setOpen(next);
    // Mark all read when panel is opened (not closed)
    if (next) markAllRead();
  };

  const formatRelative = (iso) => {
    const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (diff < 60) return `${diff}d lalu`;
    if (diff < 3600) return `${Math.floor(diff/60)}m lalu`;
    return `${Math.floor(diff/3600)}j lalu`;
  };

  const typeIcon = (type) => {
    if (type === 'mismatch') return <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />;
    if (type === 'success') return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
    return <Radio className="w-3.5 h-3.5 text-blue-500" />;
  };

  return (
    <div className={`relative ${className}`} ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
        title="Notifikasi"
      >
        <Bell className="w-[18px] h-[18px] text-slate-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center leading-none animate-bounce-once">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl border border-slate-200 shadow-2xl z-[500] overflow-hidden"
          style={{ animation: 'notifPanelIn 0.18s cubic-bezier(0.16,1,0.3,1)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-slate-600" />
              <span className="text-sm font-bold text-slate-800">Notifikasi</span>
              {notifications.length > 0 && (
                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-semibold">
                  {notifications.length}
                </span>
              )}
            </div>
            <button
              onClick={clearAll}
              className="p-1 hover:bg-slate-100 rounded-lg transition text-slate-400 hover:text-rose-500"
              title="Hapus semua"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* List */}
          <ul className="max-h-72 overflow-y-auto divide-y divide-slate-50">
            {notifications.length === 0 && (
              <li className="py-10 text-center text-sm text-slate-400">
                <Bell className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                Tidak ada notifikasi
              </li>
            )}
            {notifications.map(n => (
              <li
                key={n.id}
                className={`flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors ${!n.read ? 'bg-blue-50/40' : ''}`}
              >
                <span className="flex-shrink-0 mt-0.5">{typeIcon(n.type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-800 leading-tight">{n.title}</p>
                  {n.body && <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed line-clamp-2">{n.body}</p>}
                  <p className="text-[10px] text-slate-400 mt-1">{formatRelative(n.at)}</p>
                </div>
                {!n.read && (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
