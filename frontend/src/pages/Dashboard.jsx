import React, { useState, useEffect } from 'react';
import { reportApi, shippingApi, devicesApi } from '../services/api';
import {
  LayoutDashboard, FileText, Tag, Radio, Package,
  Boxes, ArrowDownCircle, ArrowUpCircle, CheckCircle,
  Clock, Loader2, AlertTriangle, RefreshCw, Cpu,
  Wifi, WifiOff, Server
} from 'lucide-react';

export default function Dashboard({ onNavigate, currentUser }) {
  const [stats, setStats] = useState(null);
  const [recentDocs, setRecentDocs] = useState([]);
  const [devicesData, setDevicesData] = useState(null);
  const [loading, setLoading] = useState(true);

  const userRole = currentUser?.role || 'superadmin';

  const fetchData = async () => {
    try {
      setLoading(true);
      const [kpiRes, docsRes, devRes] = await Promise.all([
        reportApi.getDashboardKpis().catch(() => ({ data: null })),
        shippingApi.getDocuments({ per_page: 5 }).catch(() => ({ data: { data: [] } })),
        devicesApi.getStatus().catch(() => ({ data: null })),
      ]);
      setStats(kpiRes.data);
      setRecentDocs(docsRes.data?.data || []);
      if (devRes?.data) setDevicesData(devRes.data);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // Status badge
  const StatusBadge = ({ status }) => {
    const styles = {
      draft: 'bg-slate-100 text-slate-600',
      approved: 'bg-blue-50 text-blue-700',
      in_progress: 'bg-amber-50 text-amber-700',
      completed: 'bg-blue-50 text-blue-700',
      cancelled: 'bg-red-50 text-red-600',
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

  const roleLabel = {
    superadmin: 'Super Administrator',
    pm: 'Project Manager',
    pic_lapangan: 'PIC Lapangan',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
      </div>
    );
  }

  const totalItems = stats?.total_items || 0;
  const totalTags = stats?.total_tags || 0;
  const totalWarehouses = stats?.total_warehouses || 0;

  // Device summary
  const deviceOnline = devicesData?.online_count || 0;
  const deviceTotal = devicesData?.total_count || 0;

  return (
    <div className="space-y-5">
      {/* Welcome Header */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 rounded-2xl p-5 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black tracking-tight flex items-center gap-2">
              <LayoutDashboard className="w-5 h-5 text-amber-400" />
              Dashboard
            </h1>
            <p className="text-blue-200 text-xs mt-1">
              Selamat datang, <span className="font-semibold text-white">{currentUser?.name || 'User'}</span>
              <span className="ml-2 px-2 py-0.5 bg-blue-800/60 text-blue-200 rounded-md text-[10px] font-mono">
                {roleLabel[userRole] || userRole}
              </span>
            </p>
          </div>
          <button onClick={fetchData} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition" title="Refresh">
            <RefreshCw className="w-4 h-4 text-blue-200" />
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <Package className="w-4 h-4 text-blue-600" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-800">{totalItems}</div>
          <div className="text-[10px] text-slate-500 font-semibold mt-0.5">Total Material</div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <Tag className="w-4 h-4 text-amber-600" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-800">{totalTags}</div>
          <div className="text-[10px] text-slate-500 font-semibold mt-0.5">Tag RFID Terdaftar</div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
              <Boxes className="w-4 h-4 text-indigo-600" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-800">{totalWarehouses}</div>
          <div className="text-[10px] text-slate-500 font-semibold mt-0.5">Gudang Aktif</div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              {deviceOnline > 0 ? <Wifi className="w-4 h-4 text-blue-600" /> : <WifiOff className="w-4 h-4 text-slate-400" />}
            </div>
          </div>
          <div className="text-2xl font-black text-slate-800">
            {deviceOnline}<span className="text-sm text-slate-400 font-medium">/{deviceTotal}</span>
          </div>
          <div className="text-[10px] text-slate-500 font-semibold mt-0.5">Reader Online</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {['pm', 'superadmin'].includes(userRole) && (
          <button onClick={() => onNavigate('shipping-documents')}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl p-4 text-left transition shadow-md cursor-pointer">
            <FileText className="w-5 h-5 mb-2 text-blue-200" />
            <div className="text-sm font-bold">Buat Dokumen</div>
            <div className="text-[10px] text-blue-200 mt-0.5">Dokumen barang masuk/keluar</div>
          </button>
        )}
        <button onClick={() => onNavigate('tag-enrollment')}
          className="bg-amber-500 hover:bg-amber-600 text-white rounded-xl p-4 text-left transition shadow-md cursor-pointer">
          <Tag className="w-5 h-5 mb-2 text-amber-200" />
          <div className="text-sm font-bold">Daftarkan Tag</div>
          <div className="text-[10px] text-amber-200 mt-0.5">Pasangkan tag ke item</div>
        </button>
        <button onClick={() => onNavigate('gate-monitor')}
          className="bg-slate-800 hover:bg-slate-700 text-white rounded-xl p-4 text-left transition shadow-md cursor-pointer">
          <Radio className="w-5 h-5 mb-2 text-slate-300" />
          <div className="text-sm font-bold">Monitor Gate</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Pantau perlintasan RFID</div>
        </button>
      </div>

      {/* Recent Shipping Documents */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-bold text-slate-800">Dokumen Terbaru</span>
          </div>
          <button onClick={() => onNavigate('shipping-documents')}
            className="text-[10px] font-semibold text-blue-600 hover:text-blue-700 cursor-pointer">
            Lihat Semua →
          </button>
        </div>
        {recentDocs.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            <FileText className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            Belum ada dokumen. Buat dokumen pertama Anda.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentDocs.map(doc => (
              <button key={doc.id} onClick={() => onNavigate('shipping-documents')}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50/80 transition text-left cursor-pointer">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${doc.type === 'inbound' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'}`}>
                    {doc.type === 'inbound' ? <ArrowDownCircle className="w-4 h-4" /> : <ArrowUpCircle className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-800 truncate">{doc.document_number}</div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {doc.creator?.name} • {doc.warehouse?.name}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {(doc.total_tags > 0) && (
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
