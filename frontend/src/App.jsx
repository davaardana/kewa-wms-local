import React, { useState, useEffect } from 'react';
import ToastContainer, { showToast } from './components/Toast';
import ConfirmDialogContainer from './components/ConfirmDialog';
import GlobalLoading from './components/GlobalLoading';
import { authApi } from './services/api';
import Dashboard from './pages/Dashboard';
import MasterData from './pages/MasterData';
import SpkProcurement from './pages/SpkProcurement';
import WorkOrders from './pages/WorkOrders';
import GateMonitor from './pages/GateMonitor';
import FieldApp from './pages/FieldApp';
import ReturnVerification from './pages/ReturnVerification';
import TagEnrollment from './pages/TagEnrollment';
import AuditTrail from './pages/AuditTrail';
import ApprovalCenter from './pages/ApprovalCenter';
import ApprovalSettings from './pages/ApprovalSettings';
import UserManagement from './pages/UserManagement';
import DevicePairing from './pages/DevicePairing';
import StockCard from './pages/StockCard';
import InstallPwaModal, { useDeviceDetection } from './components/InstallPwaModal';
import ProfileModal from './components/ProfileModal';
import {
  LayoutDashboard,
  Building2,
  PackageCheck,
  FileSpreadsheet,
  Radio,
  Smartphone,
  RotateCcw,
  Tag,
  History,
  LogOut,
  UserCheck,
  Shield,
  Menu,
  X,
  Truck,
  Scan,
  ClipboardCheck,
  FileText,
  Users,
  Sliders,
  FolderKanban,
  Package,
  Warehouse as WhIcon,
  Download,
  Laptop,
  Cpu,
  Boxes,
  User
} from 'lucide-react';

const navSections = [
  {
    title: null,
    items: [
      { id: 'dashboard', label: 'Dashboard Ringkasan', icon: LayoutDashboard, roles: ['superadmin', 'management', 'pm', 'procurement', 'storeroom'] },
    ],
  },
  {
    title: '1. MASTER & ORGANISASI PROYEK',
    items: [
      { id: 'principals-master', label: 'Principal & Klien Telco', sub: 'Vendor Klien FO', icon: Building2, roles: ['superadmin', 'management', 'pm', 'procurement'] },
      { id: 'projects-master', label: 'Proyek Rollout FO', sub: 'Inisiasi & Kontrol Proyek', icon: FolderKanban, roles: ['superadmin', 'management', 'pm'] },
      { id: 'warehouses-master', label: 'Gudang Transit & Staf Yard', sub: 'Lokasi, PIC, Staf & Antena', icon: WhIcon, roles: ['superadmin', 'management', 'pm'] },
      { id: 'materials-master', label: 'Katalog Material FO', sub: 'Tiang, Kabel & Aksesoris', icon: Package, roles: ['superadmin', 'management', 'pm', 'procurement', 'storeroom'] },
      { id: 'vehicles-master', label: 'Armada Truk Ekspedisi', sub: 'Kendaraan & Supir', icon: Truck, roles: ['superadmin', 'management', 'pm', 'procurement'] },
    ],
  },
  {
    title: '2. PENGADAAN & LOGISTIK',
    items: [
      { id: 'spk-list', label: 'Kontrak SPK & PO Vendor', sub: 'Pengadaan Principal', icon: FileText, roles: ['superadmin', 'management', 'pm', 'procurement'] },
      { id: 'dispatch-scan', label: 'Muat Truk di Principal', sub: 'Handheld 1: Dispatch', icon: Truck, roles: ['superadmin', 'procurement'] },
      { id: 'receiving-scan', label: 'Bongkar & Terima Truk', sub: 'Handheld 2: Receiving', icon: PackageCheck, roles: ['superadmin', 'storeroom'] },
      { id: 'deliveries-monitor', label: 'Status Truk & Pengiriman', sub: 'In-Transit Shrinkage', icon: ClipboardCheck, roles: ['superadmin', 'management', 'pm', 'procurement', 'storeroom'] },
    ],
  },
  {
    title: '3. PERENCANAAN & GOVERNANCE',
    items: [
      { id: 'work-orders', label: 'Work Order & Kuota BOQ', sub: 'Kunci Kuota PM', icon: FileSpreadsheet, roles: ['superadmin', 'management', 'pm', 'storeroom'] },
      { id: 'approval-center', label: 'Pusat Approval & Transaksi', sub: 'Antrean Sign Off Multi-Tier', icon: Shield, roles: ['superadmin', 'management', 'pm', 'procurement'] },
      { id: 'approval-settings', label: 'Master Setting Approval', sub: 'Template, Tiers & SLA', icon: Sliders, roles: ['superadmin', 'management', 'pm'] },
    ],
  },
  {
    title: '4. DISPATCH & SENSOR PORTAL',
    items: [
      { id: 'field-app', label: 'PWA Mandor Lapangan', sub: 'Checkout Muatan Truk', icon: Smartphone, roles: ['superadmin', 'pic_lapangan'] },
      { id: 'gate-monitor', label: 'Monitor Perlintasan RFID', sub: 'Pembacaan Reader & Deteksi Anomali', icon: Radio, roles: ['superadmin', 'management', 'pm', 'storeroom'] },
      { id: 'device-pairing', label: 'Pairing Reader & Device', sub: 'IP Reader, Antena & Port', icon: Cpu, roles: ['superadmin', 'pm'] },
    ],
  },
  {
    title: '5. RETUR & AUDIT TRAIL',
    items: [
      { id: 'stock-card', label: 'Stok & Kartu Stok', sub: 'Saldo Gudang & Riwayat Mutasi', icon: Boxes, roles: ['superadmin', 'management', 'pm', 'procurement', 'storeroom'] },
      { id: 'return-verification', label: 'Verifikasi Retur Sisa', sub: 'Pengecekan Fisik Gudang', icon: RotateCcw, roles: ['superadmin', 'management', 'pm', 'storeroom'] },
      { id: 'stock-opname', label: 'Stock Opname Fisik Yard', sub: 'Bulk Scan Tiang di Gudang', icon: Scan, roles: ['superadmin', 'management', 'storeroom'] },
      { id: 'audit-trail', label: 'Audit Chain of Custody', sub: 'Ledger Mutasi Digital', icon: History, roles: ['superadmin', 'management', 'pm', 'procurement', 'storeroom'] },
    ],
  },
  {
    title: 'PENGATURAN & AKSES SISTEM',
    items: [
      { id: 'user-management', label: 'Pengguna & Hak Akses', sub: 'Role, Akun & Matriks RBAC', icon: Users, roles: ['superadmin'] },
      { id: 'tag-enrollment', label: 'Pendaftaran Tag RFID', sub: 'Registri EPC Baru', icon: Tag, roles: ['superadmin', 'pm', 'procurement'] },
    ],
  },
];

const DEMO_USERS = [
  {
    name: 'Super Administrator',
    email: 'superadmin@mosa.id',
    role: 'Super Admin',
    roleKey: 'superadmin',
    category: 'it',
    desc: 'Master IT & Akses Sensor Pintu',
    theme: 'bg-slate-900 text-white border-slate-800 hover:bg-slate-800',
    badge: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/50',
    icon: Shield,
    iconColor: 'text-emerald-400',
  },
  {
    name: 'Hendra Wijaya',
    email: 'direksi.hendra@mosa.id',
    role: 'Direksi / BOD',
    roleKey: 'management',
    category: 'management',
    desc: 'Top Management & Final Approval',
    theme: 'bg-indigo-950 text-white border-indigo-800/80 hover:bg-indigo-900',
    badge: 'bg-indigo-900 text-indigo-200 border-indigo-600/50',
    icon: Building2,
    iconColor: 'text-indigo-400',
  },
  {
    name: 'Budi Santoso',
    email: 'pm.budi@mosa.id',
    role: 'Project Manager',
    roleKey: 'pm',
    category: 'management',
    desc: 'Approval Transaksi & Kuota BOQ',
    theme: 'bg-amber-50/70 border-amber-200/80 hover:bg-amber-100/70 text-slate-900',
    badge: 'bg-amber-100 text-amber-800 border-amber-300',
    icon: FolderKanban,
    iconColor: 'text-amber-600',
  },
  {
    name: 'Siti Aminah',
    email: 'procurement.siti@mosa.id',
    role: 'Procurement',
    roleKey: 'procurement',
    category: 'logistics',
    desc: 'Kontrak SPK & PO Vendor Principal',
    theme: 'bg-blue-50/70 border-blue-200/80 hover:bg-blue-100/70 text-slate-900',
    badge: 'bg-blue-100 text-blue-800 border-blue-300',
    icon: FileText,
    iconColor: 'text-blue-600',
  },
  {
    name: 'Joko Prasetyo',
    email: 'storeroom.joko@mosa.id',
    role: 'Storeroom Staff',
    roleKey: 'storeroom',
    category: 'logistics',
    desc: 'Bongkar Muat, Receiving & Retur Yard',
    theme: 'bg-emerald-50/70 border-emerald-200/80 hover:bg-emerald-100/70 text-slate-900',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    icon: WhIcon,
    iconColor: 'text-emerald-600',
  },
  {
    name: 'Agus Pratama',
    email: 'pic.agus@mosa.id',
    role: 'PIC Lapangan 1',
    roleKey: 'pic_lapangan',
    category: 'field',
    desc: 'Mandor Yard Bogor (PWA Checkout)',
    theme: 'bg-cyan-50/70 border-cyan-200/80 hover:bg-cyan-100/70 text-slate-900',
    badge: 'bg-cyan-100 text-cyan-800 border-cyan-300',
    icon: Smartphone,
    iconColor: 'text-cyan-600',
  },
  {
    name: 'Dani Kurniawan',
    email: 'pic.dani@mosa.id',
    role: 'PIC Lapangan 2',
    roleKey: 'pic_lapangan',
    category: 'field',
    desc: 'Mandor Yard Depok (PWA Checkout)',
    theme: 'bg-cyan-50/70 border-cyan-200/80 hover:bg-cyan-100/70 text-slate-900',
    badge: 'bg-cyan-100 text-cyan-800 border-cyan-300',
    icon: Smartphone,
    iconColor: 'text-cyan-600',
  },
];

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  // Initialize activePage from current URL hash
  const getInitialPage = () => {
    const hash = window.location.hash.replace(/^#\/?/, '');
    return hash || 'dashboard';
  };
  const [activePage, setActivePage] = useState(getInitialPage);

  // Device Detection & PWA Installation
  const { deviceInfo, setDeviceInfo, isInstallable, triggerInstall } = useDeviceDetection();
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);

  // Login form state
  const [email, setEmail] = useState('pm.budi@mosa.id');
  const [password, setPassword] = useState('password');
  const [loginLoading, setLoginLoading] = useState(false);
  const [previewRole, setPreviewRole] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('all');

  // Navigation function that synchronizes with Browser History Stack
  const navigateTo = (pageId, replace = false) => {
    if (!pageId) return;
    setActivePage(pageId);
    const targetHash = `#/${pageId}`;
    if (window.location.hash !== targetHash) {
      if (replace) {
        window.history.replaceState({ page: pageId }, '', targetHash);
      } else {
        window.history.pushState({ page: pageId }, '', targetHash);
      }
    }
  };

  useEffect(() => {
    const savedUser = localStorage.getItem('mosa_user');
    const token = localStorage.getItem('mosa_token');
    if (savedUser && token) {
      try {
        setCurrentUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem('mosa_user');
        localStorage.removeItem('mosa_token');
      }
    }
  }, []);

  // Listen to Browser Back / Forward buttons & Hash Changes
  useEffect(() => {
    const handleLocationChange = () => {
      const hash = window.location.hash.replace(/^#\/?/, '');
      if (hash) {
        setActivePage(hash);
      } else {
        setActivePage('dashboard');
      }
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);

    // If logged in and no hash exists in URL, synchronize initial hash
    if (!window.location.hash && currentUser) {
      window.history.replaceState({ page: activePage }, '', `#/${activePage}`);
    }

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, [currentUser]);

  const effectiveRole = (currentUser?.role === 'superadmin' && previewRole !== 'ALL')
    ? previewRole
    : currentUser?.role;

  const userWithEffectiveRole = currentUser ? { ...currentUser, role: effectiveRole } : null;

  const filteredSections = navSections.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (currentUser?.role === 'superadmin' && previewRole === 'ALL') return true;
      return item.roles?.includes(effectiveRole);
    }),
  })).filter((section) => section.items.length > 0);

  // Auto-redirect if current active page is not in the allowed list
  useEffect(() => {
    if (currentUser) {
      const allowedIds = filteredSections.flatMap((s) => s.items.map((i) => i.id));
      if (allowedIds.length > 0 && !allowedIds.includes(activePage)) {
        navigateTo(allowedIds[0], true);
      }
    }
  }, [currentUser?.role, previewRole]);

  const handleLogin = async (e, directEmail = null, directPassword = null) => {
    if (e) e.preventDefault();
    setLoginLoading(true);
    const loginEmail = directEmail || email;
    const loginPassword = directPassword || password;
    try {
      const res = await authApi.login(loginEmail, loginPassword);
      localStorage.setItem('mosa_token', res.data.token);
      localStorage.setItem('mosa_user', JSON.stringify(res.data.user));
      setCurrentUser(res.data.user);
      let target = 'dashboard';
      if (res.data.user.role === 'pic_lapangan') {
        target = 'field-app';
      } else if (res.data.user.role === 'storeroom') {
        target = 'receiving-scan';
      } else if (res.data.user.role === 'procurement') {
        target = 'spk-list';
      }
      navigateTo(target, true);
    } catch (err) {
      showToast('Login gagal: ' + (err.response?.data?.message || err.message), 'error');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch (e) {
      // ignore
    }
    localStorage.removeItem('mosa_token');
    localStorage.removeItem('mosa_user');
    setCurrentUser(null);
    setPreviewRole('ALL');
    window.history.replaceState(null, '', window.location.pathname);
  };

  const handleUserUpdated = (user) => {
    localStorage.setItem('mosa_user', JSON.stringify(user));
    setCurrentUser(user);
  };

  const quickSwitchUser = (userEmail) => {
    setEmail(userEmail);
    setPassword('password');
    handleLogin(null, userEmail, 'password');
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4 py-8 overflow-y-auto w-full max-w-full">
        <div className="max-w-lg w-full bg-white rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5 my-auto">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-emerald-100 text-emerald-700 rounded-2xl mb-1 shadow-inner">
              <Radio className="w-8 h-8 animate-pulse" />
            </div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">MOSA WMS RFID</h1>
            <p className="text-xs text-slate-500">
              Sistem Rantai Kepemilikan Digital & Anti-Theft Material FO
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4 text-xs">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Email Personal Akun</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-md transition"
            >
              {loginLoading ? 'Memproses Login...' : 'Masuk ke Sistem'}
            </button>
          </form>

          {/* Quick Demo Role & User Switcher */}
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Pintasan Akun Personal & Role:
              </span>
              <span className="text-[10px] text-slate-400">
                Klik untuk auto-login
              </span>
            </div>

            {/* Category Filter Pills */}
            <div className="flex flex-wrap gap-1 text-[10px]">
              {[
                { id: 'all', label: `Semua (${DEMO_USERS.length})` },
                { id: 'management', label: 'BOD & PM' },
                { id: 'logistics', label: 'Logistik & Gudang' },
                { id: 'field', label: 'Mandor Lapangan' },
                { id: 'it', label: 'Superadmin' },
              ].map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setRoleFilter(filter.id)}
                  className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                    roleFilter === filter.id
                      ? 'bg-slate-800 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            {/* User Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] max-h-60 overflow-y-auto pr-1">
              {DEMO_USERS
                .filter((u) => roleFilter === 'all' || u.category === roleFilter)
                .map((user) => {
                  const Icon = user.icon || User;
                  return (
                    <button
                      key={user.email}
                      type="button"
                      onClick={() => quickSwitchUser(user.email)}
                      className={`p-2.5 rounded-xl text-left border transition active:scale-[0.98] cursor-pointer flex flex-col justify-between gap-1.5 shadow-xs ${user.theme}`}
                    >
                      <div className="flex items-center justify-between gap-1 w-full">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Icon className={`w-3.5 h-3.5 shrink-0 ${user.iconColor}`} />
                          <span className="font-bold truncate text-[11px]">
                            {user.name}
                          </span>
                        </div>
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md border shrink-0 ${user.badge}`}>
                          {user.role}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] opacity-80">
                        <span className="font-mono text-[9px] truncate">{user.email}</span>
                      </div>
                      <div className="text-[10px] opacity-70 truncate">
                        {user.desc}
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Device & PWA Install Quick Banner */}
          <div className="border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => setIsInstallModalOpen(true)}
              className="w-full p-2.5 bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200/80 text-emerald-800 rounded-xl flex items-center justify-between text-xs font-semibold transition"
            >
              <span className="flex items-center gap-2">
                <Download className="w-4 h-4 text-emerald-600 animate-bounce" />
                <span>{deviceInfo.isStandalone ? 'Status Perangkat: ' + deviceInfo.os : 'Install Aplikasi ke ' + deviceInfo.os}</span>
              </span>
              <span className="text-[10px] bg-emerald-600 text-white font-mono px-2 py-0.5 rounded-md">
                {deviceInfo.isStandalone ? 'Terpasang' : 'Auto Install'}
              </span>
            </button>
          </div>
        </div>

        {/* PWA & Device Modal */}
        <InstallPwaModal
          isOpen={isInstallModalOpen}
          onClose={() => setIsInstallModalOpen(false)}
          triggerInstall={triggerInstall}
          deviceInfo={deviceInfo}
          setDeviceInfo={setDeviceInfo}
          isInstallable={isInstallable}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-100/75 text-slate-800 antialiased font-sans w-full max-w-full overflow-x-hidden">
      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-30 md:hidden animate-fade-in"
        />
      )}

      {/* Sidebar Desktop */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-slate-950 text-slate-200 flex flex-col justify-between p-3.5 border-r border-slate-800/80 transform transition-transform duration-200 ease-in-out md:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="space-y-3 flex-1 flex flex-col min-h-0">
          {/* Logo */}
          <div className="flex items-center justify-between px-2 pt-1 pb-1 flex-shrink-0 border-b border-slate-800/60">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500 text-slate-950 flex items-center justify-center font-black shadow-xs">
                <Radio className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-sm tracking-tight text-white">MOSA WMS</span>
                  <span className="text-[9px] bg-emerald-500/20 text-emerald-400 font-mono font-semibold px-1 rounded border border-emerald-500/30">RFID</span>
                </div>
                <span className="text-[10px] text-slate-400 block font-normal leading-none mt-0.5">Digital Custody Tracking</span>
              </div>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="md:hidden text-slate-400 p-1 hover:bg-slate-800 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Superadmin Role Simulation Dropdown */}
          {currentUser.role === 'superadmin' && (
            <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800 text-xs space-y-1 flex-shrink-0">
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Shield className="w-3 h-3 text-emerald-400" />
                <span>Simulasi Role Akses:</span>
              </div>
              <select
                value={previewRole}
                onChange={(e) => setPreviewRole(e.target.value)}
                className="w-full min-h-[36px] bg-slate-950 border border-slate-700/80 text-slate-200 rounded-md p-1.5 text-[11px] font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 cursor-pointer"
              >
                <option value="ALL">Semua Menu (Super Administrator)</option>
                <option value="pm">Project Manager (PM Approver)</option>
                <option value="procurement">Procurement (Pengadaan & SPK)</option>
                <option value="storeroom">Storeroom Staff (Gudang & Receiving)</option>
                <option value="pic_lapangan">PIC Lapangan (Mandor PWA)</option>
              </select>
            </div>
          )}

          {/* Navigation Links Grouped Chronologically & Filtered by Role */}
          <nav className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs custom-scrollbar">
            {filteredSections.map((section, sIdx) => (
              <div key={sIdx} className="space-y-0.5">
                {section.title && (
                  <div className="px-2.5 pt-2 pb-1 text-[10px] font-mono font-semibold text-slate-400 tracking-wider uppercase">
                    {section.title}
                  </div>
                )}
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activePage === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        navigateTo(item.id);
                        setSidebarOpen(false);
                      }}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left transition-all cursor-pointer ${
                        isActive
                          ? 'bg-slate-800/90 text-white font-semibold border-l-2 border-emerald-400 pl-2 shadow-xs'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 font-medium'
                      }`}
                    >
                      <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                      <div className="overflow-hidden">
                        <span className="block truncate text-xs">{item.label}</span>
                        {item.sub && (
                          <span className={`block text-[10px] font-normal truncate leading-tight ${isActive ? 'text-slate-300' : 'text-slate-400'}`}>
                            {item.sub}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        {/* Device & PWA Auto-Install Quick Action */}
        <div className="pt-2 px-1 border-t border-slate-800/80">
          <button
            onClick={() => setIsInstallModalOpen(true)}
            className="w-full flex items-center justify-between p-2 bg-slate-900/90 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 text-xs transition group cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Download className="w-3.5 h-3.5 text-emerald-400 group-hover:animate-bounce" />
              <span className="text-[11px] font-medium text-slate-200">Device & Install</span>
            </span>
            <span className="text-[9px] bg-emerald-500/20 text-emerald-400 font-mono px-1.5 py-0.5 rounded border border-emerald-500/30">
              {deviceInfo.os}
            </span>
          </button>
        </div>

        {/* User Card & Logout */}
        <div className="border-t border-slate-800/80 pt-2.5 space-y-2">
          <button
            type="button"
            onClick={() => { setProfileOpen(true); setSidebarOpen(false); }}
            className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1 text-left hover:bg-slate-800"
          >
            <div className="w-7 h-7 rounded-md bg-slate-800 border border-slate-700 text-emerald-400 flex items-center justify-center font-bold text-xs">
              {currentUser.name[0]}
            </div>
            <div className="overflow-hidden flex-1">
              <div className="text-xs font-semibold truncate text-white">{currentUser.name}</div>
              <div className="text-[10px] font-mono text-slate-400 uppercase tracking-tight">
                {currentUser.role}
              </div>
            </div>
            <User className="w-4 h-4 text-slate-400" />
          </button>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-slate-900 hover:bg-rose-950/60 hover:text-rose-300 text-slate-400 border border-slate-800 rounded-lg text-xs font-medium transition cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar Akun</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 md:pl-64 flex flex-col min-h-screen min-w-0 w-full max-w-full overflow-x-hidden">
        {/* Desktop Header Bar */}
        <header className="hidden md:flex bg-white/95 backdrop-blur-md border-b border-slate-200/90 px-6 py-2.5 justify-between items-center sticky top-0 z-20 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-medium text-slate-400">MOSA</span>
            <span className="text-xs text-slate-300">/</span>
            <span className="text-xs font-semibold text-slate-800 capitalize">{activePage.replace(/-/g, ' ')}</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Install PWA / Device Button */}
            <button
              onClick={() => setIsInstallModalOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100/90 border border-emerald-200 rounded-lg text-xs font-semibold text-emerald-800 transition cursor-pointer shadow-2xs"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>{deviceInfo.isStandalone ? 'Perangkat: ' + deviceInfo.os : 'Install App (' + deviceInfo.os + ')'}</span>
            </button>

            <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-slate-50 border border-slate-200 rounded-md text-[11px] font-mono text-slate-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Monitoring: lihat status perangkat
            </div>
            <span className="text-[11px] bg-slate-900 text-slate-100 px-2 py-0.5 rounded font-mono font-medium uppercase">
              {userWithEffectiveRole.role}
            </span>
          </div>
        </header>

        {/* Mobile Header Bar */}
        <header className="md:hidden bg-slate-950 text-white p-3 flex justify-between items-center sticky top-0 z-30 shadow-xs border-b border-slate-800">
          <div className="flex items-center gap-2">
            <button onClick={() => setSidebarOpen(true)} className="p-1 rounded-md hover:bg-slate-800 text-slate-300">
              <Menu className="w-5 h-5" />
            </button>
            <div className="font-bold text-xs leading-tight">
              <span>MOSA WMS</span>
              <span className="block text-[10px] text-slate-400 font-mono capitalize">{activePage.replace(/-/g, ' ')}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsInstallModalOpen(true)}
              className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 text-[10px] font-mono font-semibold"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{deviceInfo.isStandalone ? 'PWA' : 'Install'}</span>
            </button>
            <span className="text-[10px] bg-slate-800 text-emerald-400 border border-slate-700 px-2 py-0.5 rounded font-mono uppercase">
              {currentUser.role}
            </span>
          </div>
        </header>

        {/* Page Container (High Information Density) */}
        <main className="flex-1 p-3.5 sm:p-5 lg:p-6 w-full max-w-[1600px] mx-auto min-h-0 min-w-0 overflow-x-hidden">
          {activePage === 'dashboard' && <Dashboard onNavigate={navigateTo} currentUser={userWithEffectiveRole} />}
          {activePage === 'projects-master' && <MasterData defaultTab="projects" onNavigate={navigateTo} currentUser={userWithEffectiveRole} />}
          {activePage === 'warehouses-master' && <MasterData defaultTab="warehouses" onNavigate={navigateTo} currentUser={userWithEffectiveRole} />}
          {activePage === 'principals-master' && <MasterData defaultTab="principals" onNavigate={navigateTo} currentUser={userWithEffectiveRole} />}
          {activePage === 'materials-master' && <MasterData defaultTab="items" onNavigate={navigateTo} currentUser={userWithEffectiveRole} />}
          {activePage === 'vehicles-master' && <MasterData defaultTab="vehicles" onNavigate={navigateTo} currentUser={userWithEffectiveRole} />}
          {activePage === 'gate-monitor' && <GateMonitor onNavigate={navigateTo} currentUser={userWithEffectiveRole} />}
          {(activePage === 'device-pairing' || activePage === 'device-pairing-settings') && <DevicePairing currentUser={userWithEffectiveRole} />}
          {activePage === 'field-app' && <FieldApp currentUser={userWithEffectiveRole} />}
          {activePage === 'spk-list' && <SpkProcurement defaultView="spk" onNavigate={navigateTo} currentUser={userWithEffectiveRole} />}
          {activePage === 'dispatch-scan' && <SpkProcurement defaultView="dispatch_scan" onNavigate={navigateTo} currentUser={userWithEffectiveRole} />}
          {activePage === 'receiving-scan' && <SpkProcurement defaultView="receiving_scan" onNavigate={navigateTo} currentUser={userWithEffectiveRole} />}
          {activePage === 'deliveries-monitor' && <SpkProcurement defaultView="deliveries" onNavigate={navigateTo} currentUser={userWithEffectiveRole} />}
          {activePage === 'work-orders' && <WorkOrders currentUser={userWithEffectiveRole} />}
          {activePage === 'approval-center' && <ApprovalCenter currentUser={userWithEffectiveRole} />}
          {activePage === 'return-verification' && <ReturnVerification currentUser={userWithEffectiveRole} />}
          {activePage === 'stock-card' && <StockCard />}
          {activePage === 'stock-opname' && <AuditTrail defaultTab="opname" currentUser={userWithEffectiveRole} />}
          {activePage === 'audit-trail' && <AuditTrail defaultTab="trail" currentUser={userWithEffectiveRole} />}
          {activePage === 'tag-enrollment' && <TagEnrollment currentUser={userWithEffectiveRole} />}
          {activePage === 'master-data' && <MasterData defaultTab="items" onNavigate={navigateTo} currentUser={userWithEffectiveRole} />}
          {activePage === 'approval-settings' && <ApprovalSettings currentUser={userWithEffectiveRole} />}
          {activePage === 'user-management' && <UserManagement currentUser={userWithEffectiveRole} />}
        </main>
      </div>

      {/* Device & PWA Install Modal */}
      <InstallPwaModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
        triggerInstall={triggerInstall}
        deviceInfo={deviceInfo}
        setDeviceInfo={setDeviceInfo}
        isInstallable={isInstallable}
      />
      <ProfileModal
        isOpen={profileOpen}
        user={currentUser}
        onClose={() => setProfileOpen(false)}
        onUserUpdated={handleUserUpdated}
      />

      {/* Global Notifications, Confirm Dialog & Loading Overlay */}
      <ToastContainer />
      <ConfirmDialogContainer />
      <GlobalLoading />
    </div>
  );
}
