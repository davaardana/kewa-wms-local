import React, { useState, useEffect, useCallback } from 'react';
import { reportApi, shippingApi, devicesApi } from '../services/api';
import { KpiCard } from '../components/ui/animated-counter';
import { SkeletonDashboard } from '../components/ui/skeleton-loader';
import {
  LayoutDashboard, FileText, Tag, Radio, Package,
  Boxes, ArrowDownCircle, ArrowUpCircle,
  RefreshCw, Wifi, WifiOff, TrendingUp
} from 'lucide-react';



// ─── Status badge ─────────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const styles = {
    draft:       'bg-slate-100 text-slate-600',
    approved:    'bg-blue-50 text-blue-700',
    in_progress: 'bg-amber-50 text-amber-700',
    completed:   'bg-emerald-50 text-emerald-700',
    cancelled:   'bg-red-50 text-red-600',
  };
  const labels = {
    draft: 'Draft', approved: 'Disetujui', in_progress: 'Proses',
    completed: 'Selesai', cancelled: 'Batal',
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${styles[status] || styles.draft}`}>
      {labels[status] || status}
    </span>
  );
};

// ─── Build hourly sparkline data from recent gate events ─────────────────────
function buildSparklineData(recentEvents, hoursBack = 12) {
  const now = Date.now();
  const buckets = Array(hoursBack).fill(0);
  (recentEvents || []).forEach(ev => {
    const age = (now - new Date(ev.created_at).getTime()) / 3600000; // hours ago
    const idx = Math.floor(age);
    if (idx >= 0 && idx < hoursBack) {
      buckets[hoursBack - 1 - idx]++;
    }
  });
  return buckets;
}

export default function Dashboard({ onNavigate, currentUser }) {
  const [stats, setStats]         = useState(null);
  const [recentDocs, setRecentDocs] = useState([]);
  const [devicesData, setDevicesData] = useState(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const userRole = currentUser?.role || 'superadmin';

  const roleLabel = {
    superadmin: 'Super Administrator',
    pm: 'Project Manager',
    pic_lapangan: 'PIC Lapangan',
  };

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [kpiRes, docsRes, devRes] = await Promise.all([
        reportApi.getDashboardKpis().catch(() => ({ data: null })),
        shippingApi.getDocuments({ per_page: 5 }).catch(() => ({ data: { data: [] } })),
        devicesApi.getStatus().catch(() => ({ data: null })),
      ]);
      setStats(kpiRes?.data || null);
      const docs = Array.isArray(docsRes?.data?.data)
        ? docsRes.data.data
        : (Array.isArray(docsRes?.data) ? docsRes.data : []);
      setRecentDocs(docs);
      if (devRes?.data) setDevicesData(devRes.data);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Derived values ──────────────────────────────────────────────────────────
  const totalItems      = stats?.metrics?.total_items      ?? stats?.total_items      ?? 0;
  const totalTags       = stats?.metrics?.total_tags        ?? stats?.total_tags        ?? 0;
  const activeTags      = stats?.metrics?.active_tags       ?? 0;
  const activeShipDocs  = stats?.metrics?.active_shipping_docs ?? 0;
  const completedToday  = stats?.metrics?.completed_today   ?? 0;

  const deviceList   = Array.isArray(devicesData?.devices) ? devicesData.devices : [];
  const deviceOnline = deviceList.filter(d => d?.status === 'online').length;
  const deviceTotal  = devicesData?.summary?.total ?? deviceList.length;

  // Sparkline: gate event volume per jam (12 jam terakhir)
  const recentGateEvents = stats?.recent_gate_events || [];
  const sparkData = buildSparklineData(recentGateEvents, 12);
  const sparkHasData = sparkData.some(v => v > 0);

  // ── Skeleton loading (rekomendasi #4) ───────────────────────────────────────
  if (loading) return <SkeletonDashboard />;

  return (
    <div className="space-y-5">

      {/* ── Welcome Header ────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 rounded-2xl p-5 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black tracking-tight flex items-center gap-2">
              <LayoutDashboard className="w-5 h-5 text-amber-400" />
              Dashboard
            </h1>
            <p className="text-blue-200 text-xs mt-1">
              Selamat datang,{' '}
              <span className="font-semibold text-white">{currentUser?.name || 'User'}</span>
              <span className="ml-2 px-2 py-0.5 bg-blue-800/60 text-blue-200 rounded-md text-[10px] font-mono">
                {roleLabel[userRole] || userRole}
              </span>
            </p>
          </div>
          <button
            onClick={() => fetchData(true)}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 text-blue-200 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── KPI Cards — Rekomendasi #1: Animated Counter ─────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          icon={Package}
          iconBg="bg-blue-100"
          iconColor="text-blue-600"
          value={totalItems}
          label="Total Material"
        />
        <KpiCard
          icon={Tag}
          iconBg="bg-amber-100"
          iconColor="text-amber-600"
          value={totalTags}
          label="Tag RFID Terdaftar"
          sub={activeTags > 0 ? `/${activeTags} aktif` : undefined}
        />
        <KpiCard
          icon={Boxes}
          iconBg="bg-indigo-100"
          iconColor="text-indigo-600"
          value={activeShipDocs}
          label="Dokumen Aktif"
          trend={completedToday > 0 ? completedToday : undefined}
        />
        <KpiCard
          icon={deviceOnline > 0 ? Wifi : WifiOff}
          iconBg={deviceOnline > 0 ? 'bg-emerald-100' : 'bg-slate-100'}
          iconColor={deviceOnline > 0 ? 'text-emerald-600' : 'text-slate-400'}
          value={deviceOnline}
          label="Reader Online"
          sub={deviceTotal > 0 ? `/${deviceTotal}` : undefined}
        />
      </div>

      {/* ── Rekomendasi #6: Mini Sparkline Gate Activity ──────────────────── */}
      {sparkHasData && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-bold text-slate-700">Aktivitas Gate — 12 Jam Terakhir</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              {recentGateEvents.length} event
            </span>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <div className="flex items-end gap-1 h-8">
                {sparkData.map((val, i) => {
                  const max = Math.max(...sparkData, 1);
                  const heightPct = (val / max) * 100;
                  return (
                    <div key={i} className="flex-1 flex items-end" title={`${val} event`}>
                      <div
                        className="w-full rounded-sm transition-all duration-500"
                        style={{
                          height: `${Math.max(heightPct, val > 0 ? 8 : 2)}%`,
                          minHeight: val > 0 ? '3px' : '1px',
                          backgroundColor: val > 0
                            ? (sparkData[sparkData.length - 1] === val ? '#3b82f6' : '#93c5fd')
                            : '#e2e8f0',
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[9px] text-slate-400">-12j</span>
                <span className="text-[9px] text-slate-400">sekarang</span>
              </div>
            </div>
            {/* Mismatch summary */}
            {(stats?.recent_mismatches || []).length > 0 && (
              <div className="flex-shrink-0 flex flex-col items-center gap-0.5 pb-4">
                <span className="text-lg font-black text-rose-600">
                  {stats.recent_mismatches.length}
                </span>
                <span className="text-[9px] text-rose-500 font-semibold text-center leading-tight">
                  Anomali<br/>Terbaru
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Quick Actions ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {['pm', 'superadmin'].includes(userRole) && (
          <button
            onClick={() => onNavigate('shipping-documents')}
            className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl p-4 text-left transition-all shadow-md cursor-pointer"
          >
            <FileText className="w-5 h-5 mb-2 text-blue-200" />
            <div className="text-sm font-bold">Buat Dokumen</div>
            <div className="text-[10px] text-blue-200 mt-0.5">Dokumen barang masuk/keluar</div>
          </button>
        )}
        <button
          onClick={() => onNavigate('tag-enrollment')}
          className="bg-amber-500 hover:bg-amber-600 active:scale-95 text-white rounded-xl p-4 text-left transition-all shadow-md cursor-pointer"
        >
          <Tag className="w-5 h-5 mb-2 text-amber-200" />
          <div className="text-sm font-bold">Daftarkan Tag</div>
          <div className="text-[10px] text-amber-200 mt-0.5">Pasangkan tag ke item</div>
        </button>
        <button
          onClick={() => onNavigate('rfid-gate')}
          className="bg-slate-800 hover:bg-slate-700 active:scale-95 text-white rounded-xl p-4 text-left transition-all shadow-md cursor-pointer"
        >
          <Radio className="w-5 h-5 mb-2 text-slate-300" />
          <div className="text-sm font-bold">Monitor Gate</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Pantau perlintasan RFID</div>
        </button>
      </div>

      {/* ── Recent Shipping Documents ──────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-bold text-slate-800">Dokumen Terbaru</span>
          </div>
          <button
            onClick={() => onNavigate('shipping-documents')}
            className="text-[10px] font-semibold text-blue-600 hover:text-blue-700 cursor-pointer transition-colors"
          >
            Lihat Semua →
          </button>
        </div>
        {recentDocs.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">
            <FileText className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            Belum ada dokumen. Buat dokumen pertama Anda.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentDocs.map(doc => (
              <button
                key={doc.id}
                onClick={() => onNavigate('shipping-documents')}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50/80 transition text-left cursor-pointer group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105 ${doc.type === 'inbound' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'}`}>
                    {doc.type === 'inbound'
                      ? <ArrowDownCircle className="w-4 h-4" />
                      : <ArrowUpCircle className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-800 truncate">{doc.document_number}</div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {doc.creator?.name} • {doc.warehouse?.name}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {doc.total_tags > 0 && (
                    <span className="text-[9px] font-mono text-slate-500">
                      {doc.scanned_tags || 0}/{doc.total_tags}
                    </span>
                  )}
                  <StatusBadge status={doc.status} />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
