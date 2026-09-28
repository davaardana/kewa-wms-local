import React, { useState, useEffect, useRef } from 'react';
import { reportApi, gateApi, devicesApi } from '../services/api';
import { 
  ShieldCheck, 
  Radio, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Package, 
  FileText, 
  ArrowRightLeft, 
  Lock, 
  Unlock,
  RefreshCw,
  Server,
  Wifi,
  WifiOff,
  Cpu,
  Truck,
  RotateCcw,
  Scan,
  ClipboardCheck,
  FileSpreadsheet,
  FolderKanban,
  Tag,
  Warehouse as WhIcon,
  Smartphone,
  PackageCheck
} from 'lucide-react';

export default function Dashboard({ onNavigate, currentUser }) {
  const [kpis, setKpis] = useState(null);
  const [devicesData, setDevicesData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dismissedAlert, setDismissedAlert] = useState(false);
  const [devicesStale, setDevicesStale] = useState(false);

  const userRole = currentUser?.role || 'superadmin';
  const isFetchingKpisRef = useRef(false);

  const fetchKpis = async (isSilent = false) => {
    if (isFetchingKpisRef.current) return;
    if (isSilent && typeof document !== 'undefined' && document.hidden) return;

    try {
      isFetchingKpisRef.current = true;
      if (!isSilent) setLoading(true);
      const [kpiRes, devRes] = await Promise.all([
        reportApi.getDashboardKpis(),
        devicesApi.getStatus().catch(() => ({ data: null })),
      ]);
      setKpis(kpiRes.data);
      if (devRes?.data) {
        setDevicesData(devRes.data);
        setDevicesStale(false);
      } else {
        setDevicesStale(true);
      }
    } catch (err) {
      console.error('Error fetching dashboard KPIs or devices:', err);
    } finally {
      isFetchingKpisRef.current = false;
      if (!isSilent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchKpis(false);
    const interval = setInterval(() => fetchKpis(true), 5000);

    const handleVisibility = () => {
      if (!document.hidden) fetchKpis(true);
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }

    return () => {
      clearInterval(interval);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
    };
  }, []);

  // Role Metadata for Banner & Primary Action
  const getRoleBannerConfig = () => {
    switch (userRole) {
      case 'storeroom':
        return {
          badge: '📦 AREA KERJA STOREROOM STAFF',
          title: 'Dashboard Staf Gudang & Receiving',
          subtitle: 'Monitoring penerimaan truk (Handheld 2), penyiapan material Work Order, verifikasi retur fisik, dan stock opname yard.',
          actionLabel: 'Bongkar & Terima Truk',
          actionIcon: PackageCheck,
          actionTarget: 'receiving-scan',
          bgGradient: 'from-blue-900 to-slate-900',
        };
      case 'procurement':
        return {
          badge: '📋 AREA KERJA TIM PENGADAAN',
          title: 'Dashboard Pengadaan & Logistik',
          subtitle: 'Monitoring kontrak SPK vendor, muat truk di principal (Handheld 1), dan pelacakan in-transit shrinkage antar-gudang.',
          actionLabel: 'Kontrak SPK Baru',
          actionIcon: FileText,
          actionTarget: 'spk-list',
          bgGradient: 'from-teal-900 to-slate-900',
        };
      case 'pm':
        return {
          badge: '👨‍💼 AREA KONTROL PROJECT MANAGER',
          title: 'Dashboard Kontrol Proyek & Approval',
          subtitle: 'Kontrol kuota BOQ proyek, otorisasi approval bertingkat, investigasi selisih muatan truk, dan tata kelola gudang transit.',
          actionLabel: 'Pusat Approval',
          actionIcon: ShieldCheck,
          actionTarget: 'approval-center',
          bgGradient: 'from-amber-950 to-slate-900',
        };
      case 'management':
        return {
          badge: '🏛️ EXECUTIVE SUMMARY DIREKSI',
          title: 'Executive Dashboard & Governance',
          subtitle: 'Pengawasan aset fiber optik lintas proyek, analisis shrinkage pengiriman, dan otorisasi persetujuan bernilai tinggi.',
          actionLabel: 'Pusat Approval',
          actionIcon: ShieldCheck,
          actionTarget: 'approval-center',
          bgGradient: 'from-purple-950 to-slate-900',
        };
      case 'pic_lapangan':
        return {
          badge: '👷 MANDOR LAPANGAN',
          title: 'Dashboard Mandor Lapangan',
          subtitle: 'Perizinan checkout muatan tiang & kabel di titik pemeriksaan RFID dan pelaporan retur material sisa proyek.',
          actionLabel: 'Buka PWA Lapangan',
          actionIcon: Smartphone,
          actionTarget: 'field-app',
          bgGradient: 'from-emerald-950 to-slate-900',
        };
      default: // superadmin
        return {
          badge: '⚡ MASTER ADMINISTRATOR',
          title: 'Dashboard Ringkasan Sistem Terpadu',
          subtitle: 'Monitoring digital chain of custody, rekonsiliasi pengiriman logistik 2 handheld, dan telemetri reader RFID.',
          actionLabel: 'Pusat Approval',
          actionIcon: ShieldCheck,
          actionTarget: 'approval-center',
          bgGradient: 'from-emerald-900 to-teal-950',
        };
    }
  };

  const bannerConfig = getRoleBannerConfig();

  // All Available Quick Navigation Items with Role Filter
  const ALL_QUICK_NAV = [
    { id: 'receiving-scan', label: 'Bongkar & Terima Truk', icon: PackageCheck, roles: ['superadmin', 'storeroom'], desc: 'Handheld 2 Receiving' },
    { id: 'work-orders', label: 'Work Order & Kuota', icon: FileSpreadsheet, roles: ['superadmin', 'management', 'pm', 'storeroom'], desc: 'Penyiapan & Kuota BOQ' },
    { id: 'return-verification', label: 'Verifikasi Retur Sisa', icon: RotateCcw, roles: ['superadmin', 'management', 'pm', 'storeroom'], desc: 'Pemeriksaan Fisik Lapangan' },
    { id: 'stock-opname', label: 'Stock Opname Fisik', icon: Scan, roles: ['superadmin', 'management', 'storeroom'], desc: 'Bulk Scan Tiang di Yard' },
    { id: 'spk-list', label: 'Kontrak SPK & PO', icon: FileText, roles: ['superadmin', 'management', 'pm', 'procurement'], desc: 'Pengadaan Principal Telco' },
    { id: 'dispatch-scan', label: 'Muat Truk Principal', icon: Truck, roles: ['superadmin', 'procurement'], desc: 'Handheld 1 Dispatch' },
    { id: 'deliveries-monitor', label: 'Status Truk & Shrinkage', icon: ClipboardCheck, roles: ['superadmin', 'management', 'pm', 'procurement', 'storeroom'], desc: 'Pelacakan In-Transit' },
    { id: 'approval-center', label: 'Pusat Approval', icon: ShieldCheck, roles: ['superadmin', 'management', 'pm', 'procurement'], desc: 'Antrean Sign-Off Multi-Tier' },
    { id: 'gate-monitor', label: 'Monitor Perlintasan RFID', icon: Radio, roles: ['superadmin', 'management', 'pm', 'storeroom'], desc: 'Reader RFID & Alarm Live' },
    { id: 'materials-master', label: 'Katalog Material FO', icon: Package, roles: ['superadmin', 'management', 'pm', 'procurement', 'storeroom'], desc: 'Spesifikasi Tiang & Kabel' },
    { id: 'warehouses-master', label: 'Gudang Transit', icon: WhIcon, roles: ['superadmin', 'management', 'pm'], desc: 'Master Gudang & PIC' },
    { id: 'audit-trail', label: 'Audit Custody Ledger', icon: ArrowRightLeft, roles: ['superadmin', 'management', 'pm', 'procurement'], desc: 'Jejak Mutasi Digital' },
    { id: 'tag-enrollment', label: 'Pendaftaran Tag RFID', icon: Tag, roles: ['superadmin', 'pm', 'procurement'], desc: 'Registri EPC Baru' },
    { id: 'device-pairing', label: 'Pairing Reader RFID', icon: Cpu, roles: ['superadmin', 'pm'], desc: 'Konfigurasi IP & Socket TCP' },
    { id: 'field-app', label: 'PWA Mandor Lapangan', icon: Smartphone, roles: ['superadmin', 'pic_lapangan'], desc: 'Checkout Muatan Truk' },
  ];

  const authorizedQuickNav = ALL_QUICK_NAV.filter((item) => item.roles.includes(userRole));

  // Render 4 KPI Cards Tailored by Role
  const renderKpiCards = () => {
    if (userRole === 'storeroom') {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Truk Menunggu Bongkar */}
          <div
            onClick={() => onNavigate('receiving-scan')}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:shadow-md hover:border-amber-400 transition cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Truk In-Transit</span>
              <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center group-hover:bg-amber-100 transition">
                <Truck className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-800 mt-2">
              {kpis?.metrics?.in_transit_deliveries ?? 0}
            </div>
            <div className="text-xs text-amber-600 mt-1 font-medium flex items-center gap-1">
              <span>Bongkar di Gudang (Handheld 2) &rarr;</span>
            </div>
          </div>

          {/* Card 2: Work Order Siap Disiapkan */}
          <div
            onClick={() => onNavigate('work-orders')}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:shadow-md hover:border-blue-400 transition cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">WO Siap Disiapkan</span>
              <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-100 transition">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-800 mt-2">
              {kpis?.metrics?.active_work_orders ?? 0}
            </div>
            <div className="text-xs text-blue-600 mt-1 font-medium">
              Lapor Kuantitas Fisik (Prepared) &rarr;
            </div>
          </div>

          {/* Card 3: Retur Menunggu Verifikasi */}
          <div
            onClick={() => onNavigate('return-verification')}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:shadow-md hover:border-rose-400 transition cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Verifikasi Retur Sisa</span>
              <div className="w-9 h-9 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center group-hover:bg-rose-100 transition">
                <RotateCcw className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-800 mt-2">
              {kpis?.metrics?.pending_returns ?? 0}
            </div>
            <div className="text-xs text-rose-600 mt-1 font-medium">
              Pemeriksaan Fisik Lapangan &rarr;
            </div>
          </div>

          {/* Card 4: Tag Fisik Aktif di Gudang */}
          <div
            onClick={() => onNavigate('stock-opname')}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:shadow-md hover:border-emerald-400 transition cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tag Aktif di Gudang</span>
              <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-100 transition">
                <Scan className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-800 mt-2">
              {kpis?.metrics?.active_tags ?? 0}
            </div>
            <div className="text-xs text-emerald-600 mt-1 font-medium">
              Mulai Stock Opname Yard &rarr;
            </div>
          </div>
        </div>
      );
    }

    if (userRole === 'procurement') {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div
            onClick={() => onNavigate('spk-list')}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:shadow-md hover:border-teal-400 transition cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Kontrak SPK</span>
              <div className="w-9 h-9 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center group-hover:bg-teal-100 transition">
                <FileText className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-800 mt-2">
              {kpis?.metrics?.total_spks ?? 0}
            </div>
            <div className="text-xs text-teal-600 mt-1 font-medium">
              {kpis?.metrics?.pending_spks ?? 0} menunggu approval &rarr;
            </div>
          </div>

          <div
            onClick={() => onNavigate('deliveries-monitor')}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:shadow-md hover:border-amber-400 transition cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Truk In-Transit</span>
              <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center group-hover:bg-amber-100 transition">
                <Truck className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-800 mt-2">
              {kpis?.metrics?.in_transit_deliveries ?? 0}
            </div>
            <div className="text-xs text-amber-600 mt-1 font-medium">
              Monitoring In-Transit Shrinkage &rarr;
            </div>
          </div>

          <div
            onClick={() => onNavigate('tag-enrollment')}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:shadow-md hover:border-blue-400 transition cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tag RFID Terdaftar</span>
              <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-100 transition">
                <Tag className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-800 mt-2">
              {kpis?.metrics?.total_tags ?? 0}
            </div>
            <div className="text-xs text-blue-600 mt-1 font-medium">
              Registrasi Tag EPC Baru &rarr;
            </div>
          </div>

          <div
            onClick={() => onNavigate('materials-master')}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:shadow-md hover:border-slate-400 transition cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Katalog Material FO</span>
              <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center group-hover:bg-slate-200 transition">
                <Package className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-800 mt-2">
              {kpis?.metrics?.total_items ?? 0}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Tiang FO, Kabel Drum & Aksesoris
            </div>
          </div>
        </div>
      );
    }

    if (userRole === 'pm') {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div
            onClick={() => onNavigate('approval-center')}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:shadow-md hover:border-amber-400 transition cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Menunggu Approval PM</span>
              <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center group-hover:bg-amber-100 transition">
                <ShieldCheck className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-amber-600 mt-2">
              {kpis?.metrics?.pending_gate_approvals ?? 0}
            </div>
            <div className="text-xs text-amber-600 mt-1 font-medium flex items-center gap-1">
              <span>Buka Pusat Approval PM &rarr;</span>
            </div>
          </div>

          <div
            onClick={() => onNavigate('work-orders')}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:shadow-md hover:border-indigo-400 transition cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Work Order & Kuota BOQ</span>
              <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-100 transition">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-800 mt-2">
              {kpis?.metrics?.active_work_orders ?? 0}
            </div>
            <div className="text-xs text-indigo-600 mt-1 font-medium">
              Kunci Kuota & Alokasi &rarr;
            </div>
          </div>

          <div
            onClick={() => onNavigate('deliveries-monitor')}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:shadow-md hover:border-blue-400 transition cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Truk In-Transit</span>
              <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-100 transition">
                <Truck className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-800 mt-2">
              {kpis?.metrics?.in_transit_deliveries ?? 0}
            </div>
            <div className="text-xs text-blue-600 mt-1 font-medium">
              Pelacakan Selisih Muatan &rarr;
            </div>
          </div>

          <div
            onClick={() => onNavigate('audit-trail')}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:shadow-md hover:border-emerald-400 transition cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Tag Aset Digital</span>
              <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-100 transition">
                <Radio className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-800 mt-2">
              {kpis?.metrics?.total_tags ?? 0}
            </div>
            <div className="text-xs text-emerald-600 mt-1 font-medium">
              {kpis?.metrics?.active_tags ?? 0} aktif di gudang &rarr;
            </div>
          </div>
        </div>
      );
    }

    if (userRole === 'management') {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div
            onClick={() => onNavigate('approval-center')}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:shadow-md hover:border-purple-400 transition cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Approval Direksi</span>
              <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center group-hover:bg-purple-100 transition">
                <ShieldCheck className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-purple-600 mt-2">
              {kpis?.metrics?.pending_gate_approvals ?? 0}
            </div>
            <div className="text-xs text-purple-600 mt-1 font-medium">
              Sign-off Transaksi Multi-Tier &rarr;
            </div>
          </div>

          <div
            onClick={() => onNavigate('audit-trail')}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:shadow-md hover:border-emerald-400 transition cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Aset Material Rollout</span>
              <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-100 transition">
                <Package className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-800 mt-2">
              {kpis?.metrics?.total_tags ?? 0}
            </div>
            <div className="text-xs text-emerald-600 mt-1 font-medium">
              Audit Chain of Custody &rarr;
            </div>
          </div>

          <div
            onClick={() => onNavigate('work-orders')}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:shadow-md hover:border-indigo-400 transition cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Proyek & WO Aktif</span>
              <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-100 transition">
                <FolderKanban className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-800 mt-2">
              {kpis?.metrics?.active_work_orders ?? 0}
            </div>
            <div className="text-xs text-indigo-600 mt-1 font-medium">
              Kemajuan Rollout Lapangan &rarr;
            </div>
          </div>

          <div
            onClick={() => onNavigate('deliveries-monitor')}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:shadow-md hover:border-blue-400 transition cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pengiriman In-Transit</span>
              <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-100 transition">
                <Truck className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-800 mt-2">
              {kpis?.metrics?.in_transit_deliveries ?? 0}
            </div>
            <div className="text-xs text-blue-600 mt-1 font-medium">
              Status Armada Truk Ekspedisi &rarr;
            </div>
          </div>
        </div>
      );
    }

    if (userRole === 'pic_lapangan') {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div
            onClick={() => onNavigate('field-app')}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:shadow-md hover:border-emerald-400 transition cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Work Order Saya</span>
              <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-100 transition">
                <FileText className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-800 mt-2">
              {kpis?.metrics?.active_work_orders ?? 0}
            </div>
            <div className="text-xs text-emerald-600 mt-1 font-medium">
              Siap Checkout Muatan &rarr;
            </div>
          </div>

          <div
            onClick={() => onNavigate('field-app')}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:shadow-md hover:border-amber-400 transition cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Permohonan Izin Pergerakan</span>
              <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center group-hover:bg-amber-100 transition">
                <Unlock className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-800 mt-2">
              {kpis?.metrics?.pending_gate_approvals ?? 0}
            </div>
            <div className="text-xs text-amber-600 mt-1 font-medium">
              Status Otorisasi Perlintasan RFID &rarr;
            </div>
          </div>

          <div
            onClick={() => onNavigate('field-app')}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:shadow-md hover:border-rose-400 transition cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Retur Diajukan</span>
              <div className="w-9 h-9 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center group-hover:bg-rose-100 transition">
                <RotateCcw className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-800 mt-2">
              {kpis?.metrics?.pending_returns ?? 0}
            </div>
            <div className="text-xs text-rose-600 mt-1 font-medium">
              Lapor Sisa Material Proyek &rarr;
            </div>
          </div>

          <div
            onClick={() => onNavigate('field-app')}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:shadow-md hover:border-blue-400 transition cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Scanner Handheld</span>
              <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-100 transition">
                <Cpu className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-800 mt-2">
              Bluetooth
            </div>
            <div className="text-xs text-blue-600 mt-1 font-medium">
              Web Bluetooth API Active &rarr;
            </div>
          </div>
        </div>
      );
    }

    // Default: Superadmin
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => onNavigate('audit-trail')}
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:shadow-md hover:border-emerald-400 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Tag Terdaftar</span>
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-100 transition">
              <Radio className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-800 mt-2">
            {kpis?.metrics?.total_tags ?? 0}
          </div>
          <div className="text-xs text-emerald-600 mt-1 flex items-center gap-1 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {kpis?.metrics?.active_tags ?? 0} tag aktif di gudang
          </div>
        </div>

        <div
          onClick={() => onNavigate('materials-master')}
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:shadow-md hover:border-blue-400 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Katalog Material</span>
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-100 transition">
              <Package className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-800 mt-2">
            {kpis?.metrics?.total_items ?? 0}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Tiang FO, Drum Kabel, Splicer, Tools
          </div>
        </div>

        <div
          onClick={() => onNavigate('work-orders')}
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:shadow-md hover:border-indigo-400 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Work Order Aktif</span>
            <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-100 transition">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-800 mt-2">
            {kpis?.metrics?.active_work_orders ?? 0}
          </div>
          <div className="text-xs text-indigo-600 mt-1 font-medium">
            Kuota BOQ terkunci oleh PM &rarr;
          </div>
        </div>

        <div
          onClick={() => onNavigate('approval-center')}
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:shadow-md hover:border-amber-400 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Antrean Approval</span>
            <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center group-hover:bg-amber-100 transition">
              <Lock className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-600 mt-2">
            {kpis?.metrics?.pending_gate_approvals ?? 0}
          </div>
          <div className="text-xs text-amber-600 mt-1 font-medium flex items-center gap-1">
            <span>Buka Pusat Approval &rarr;</span>
          </div>
        </div>
      </div>
    );
  };

  const PrimaryIcon = bannerConfig.actionIcon;

  return (
    <div className="space-y-6">
      {/* Top Banner / Welcome */}
      <div className={`bg-gradient-to-r ${bannerConfig.bgGradient} rounded-2xl p-6 text-white shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4`}>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-white/15 text-emerald-200 text-xs px-2.5 py-1 rounded-full font-semibold uppercase tracking-wider flex items-center gap-1.5 border border-white/20">
              <Radio className="w-3.5 h-3.5 animate-pulse text-emerald-300" />
              {bannerConfig.badge}
            </span>
          </div>
          <h1 className="text-2xl font-bold">{bannerConfig.title}</h1>
          <p className="text-white/80 text-sm mt-1 max-w-2xl">
            {bannerConfig.subtitle}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => fetchKpis(false)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-semibold backdrop-blur transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          {bannerConfig.actionTarget && (
            <button
              onClick={() => onNavigate(bannerConfig.actionTarget)}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-lg text-xs font-bold text-white shadow transition cursor-pointer"
            >
              <PrimaryIcon className="w-3.5 h-3.5" />
              <span>{bannerConfig.actionLabel}</span>
            </button>
          )}
        </div>
      </div>

      {/* Mismatch Alert Banner if any (Visible to roles with gate monitoring rights) */}
      {['superadmin', 'management', 'pm', 'storeroom'].includes(userRole) && kpis?.recent_mismatches?.length > 0 && !dismissedAlert && (
        <div className="bg-rose-50 border-l-4 border-rose-500 p-4 rounded-xl shadow-xs flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <div className="font-semibold text-rose-900 flex items-center justify-between">
              <span>Riwayat Insiden Perlintasan RFID ({kpis.recent_mismatches.length} Tercatat)</span>
              <span className="text-[10px] text-rose-500 font-mono font-normal">
                {kpis.recent_mismatches[0].created_at ? new Date(kpis.recent_mismatches[0].created_at).toLocaleTimeString('id-ID') : ''}
              </span>
            </div>
            <div className="text-rose-700 text-xs mt-0.5">
              {kpis.recent_mismatches[0].mismatch_details || 'Percobaan pergerakan tanpa persetujuan atau tag tidak cocok.'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate('gate-monitor')}
              className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-medium cursor-pointer"
            >
              Lihat CCTV & Log
            </button>
            <button
              onClick={() => setDismissedAlert(true)}
              className="p-1 hover:bg-rose-100 rounded text-rose-500 text-xs cursor-pointer font-bold px-2"
              title="Tutup banner peringatan ini"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* 4 Tailored KPI Cards */}
      {renderKpiCards()}

      {/* Central Device Fleet Telemetry (Only for IT Admin, PM & Management) */}
      {['superadmin', 'pm', 'management'].includes(userRole) && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Server className="w-4 h-4 text-emerald-600" />
                Monitor Perangkat RFID Terpusat (Central Fleet Telemetry)
              </h2>
              <p className="text-xs text-slate-500">
                Status real-time koneksi perangkat Edge Bridge & RFID Reader di seluruh gudang transit.
              </p>
              {devicesStale && <p className="text-xs font-semibold text-rose-600">Data monitoring tidak dapat diperbarui.</p>}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 font-bold rounded-lg border border-emerald-200 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                {devicesData?.summary?.online || 0} Online
              </span>
              {devicesData?.summary?.offline > 0 && (
                <span className="px-2.5 py-1 bg-rose-50 text-rose-700 font-bold rounded-lg border border-rose-200 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                  {devicesData?.summary?.offline} Terputus
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {devicesData?.devices?.map((dev) => {
              const isOnline = dev.status === 'online';
              const readerHealthy = dev.reader_status === 'responsive';
              return (
                <div
                  key={dev.id}
                  className={`p-4 rounded-xl border transition ${
                    isOnline
                      ? 'bg-slate-50/80 border-slate-200 hover:border-emerald-300'
                      : 'bg-rose-50/60 border-rose-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-ping' : 'bg-rose-500'}`}></span>
                        <strong className="text-xs text-slate-800 font-bold">{dev.device_name}</strong>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Gudang: <span className="font-semibold text-slate-700">{dev.warehouse?.name}</span> ({dev.warehouse?.gate_mode === 'SINGLE_ANTENNA_SESSION' ? '1 Antena' : '2 Antena'})
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        Model: <span className="text-emerald-700 font-semibold">{dev.device_model}</span> · IP: {dev.ip_address}:{dev.tcp_port}
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider flex items-center gap-1 ${
                        isOnline
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                        {isOnline ? (readerHealthy ? 'NORMAL' : `READER ${dev.reader_status}`) : dev.status === 'warning' ? 'TERLAMBAT' : 'EDGE TIDAK TERJANGKAU'}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-1 font-mono">
                        {dev.seconds_ago !== null ? `${dev.seconds_ago} dtk lalu` : 'Belum pernah ping'}
                      </span>
                    </div>
                  </div>

                  {dev.metrics && (
                    <div className="mt-3 pt-2.5 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                      <span>RAM: {dev.metrics.heap_used_mb || dev.metrics.memory_usage || '-'} MB</span>
                      <span>Buffer Offline: {dev.metrics.offline_buffer_count || dev.metrics.buffer_queue || 0} tag</span>
                      <span>Uptime: {dev.metrics.uptime_hours ? `${dev.metrics.uptime_hours} jam` : (dev.metrics.uptime_seconds ? `${Math.round(dev.metrics.uptime_seconds / 60)} mnt` : '-')}</span>
                      <span>Reader: {dev.reader_status || 'unknown'}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Role-Aware Navigation Grid & Live Gate Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Quick Actions & Role Navigation */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-600" />
              <span>Akses Cepat Modul</span>
            </h2>
            <span className="text-[10px] font-mono uppercase bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-bold">
              {userRole}
            </span>
          </div>

          <p className="text-xs text-slate-500">
            Tautan langsung ke modul operasional yang diizinkan untuk wewenang akun Anda.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            {authorizedQuickNav.map((item) => {
              const NavIcon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className="p-3 bg-slate-50 hover:bg-slate-100 hover:border-emerald-300 rounded-xl text-left border border-slate-200 transition cursor-pointer group flex flex-col justify-between"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <NavIcon className="w-4 h-4 text-slate-600 group-hover:text-emerald-600 transition" />
                    <span className="font-bold text-xs text-slate-800 group-hover:text-slate-900 leading-tight">
                      {item.label}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 block">
                    {item.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Live Gate Pass Events Stream */}
        <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-600 animate-pulse" />
              <span>Aktivitas RFID Terkini (Live Stream)</span>
            </h2>
            {['superadmin', 'management', 'pm', 'storeroom'].includes(userRole) && (
              <button
                onClick={() => onNavigate('gate-monitor')}
                className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <span>Lihat Monitor Penuh</span>
                <span>→</span>
              </button>
            )}
          </div>

          <div className="divide-y divide-slate-100 overflow-hidden">
            {!kpis?.recent_gate_events || kpis.recent_gate_events.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-xs">
                Belum ada aktivitas pembacaan RFID hari ini.
              </div>
            ) : (
              kpis.recent_gate_events.map((ev) => (
                <div key={ev.id} className="py-3 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg flex-shrink-0 ${
                      ev.is_valid ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                    }`}>
                      {ev.is_valid ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs text-slate-800">{ev.gate_id}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-semibold ${
                          ev.direction === 'OUT' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {ev.antenna_sequence === 'SINGLE_ANTENNA' || ev.warehouse?.gate_mode === 'SINGLE_ANTENNA_SESSION'
                            ? (ev.direction === 'OUT' ? 'KELUAR (1 Antena)' : 'MASUK (1 Antena)')
                            : (ev.direction === 'OUT' ? 'KELUAR (A→B)' : 'MASUK (B→A)')}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(ev.created_at).toLocaleTimeString('id-ID')}
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 mt-1">
                        {ev.total_tags_detected} tag EPC terdeteksi · {ev.warehouse?.name || 'Gudang Transit'}
                      </div>
                      {ev.mismatch_flag && (
                        <div className="text-[11px] text-rose-600 font-medium mt-0.5 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          <span>{ev.mismatch_details || 'Peringatan anomali kuota'}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider ${
                      ev.is_valid ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {ev.is_valid ? 'PERGERAKAN SAH' : 'DITOLAK'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
