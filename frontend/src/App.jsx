import React, { lazy, Suspense, useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LuminousTopography } from './components/ui/luminous-topography';
import { FlameButton } from './components/ui/flame-button';
import ToastContainer, { showToast } from './components/Toast';
import ConfirmDialogContainer from './components/ConfirmDialog';
import GlobalLoading from './components/GlobalLoading';
import CommandPalette from './components/CommandPalette';
import NotificationBell from './components/NotificationBell';
import { authApi } from './services/api';

const Dashboard       = lazy(() => import('./pages/Dashboard'));
const MasterData      = lazy(() => import('./pages/MasterData'));
const ShippingDocuments = lazy(() => import('./pages/ShippingDocuments'));
const RfidGate        = lazy(() => import('./pages/RfidGate'));
const TagEnrollment   = lazy(() => import('./pages/TagEnrollment'));
const Laporan         = lazy(() => import('./pages/AuditTrail'));
const UserManagement  = lazy(() => import('./pages/UserManagement'));

import InstallPwaModal, { useDeviceDetection } from './components/InstallPwaModal';
import ProfileModal from './components/ProfileModal';
import ErrorPage from './components/ui/ghost-404-page';
import ErrorBoundary from './components/ErrorBoundary';
import {
  LayoutDashboard, Radio, Tag, History, LogOut, Shield, Menu, X,
  FileText, Users, FolderKanban, Package, Download, User,
  ArrowDownCircle, ArrowUpCircle, ClipboardCheck, Eye, EyeOff, Command
} from 'lucide-react';

// ─── Nav items ────────────────────────────────────────────────────────────────
const navItems = [
  { id: 'dashboard',          label: 'Dashboard',       icon: LayoutDashboard, roles: ['superadmin','pm','pic_lapangan'] },
  { id: 'shipping-documents', label: 'Dokumen Barang',  icon: FileText,         roles: ['superadmin','pm','pic_lapangan'] },
  { id: 'tag-enrollment',     label: 'Pendaftaran Tag', icon: Tag,              roles: ['superadmin','pm'] },
  { id: 'master-data',        label: 'Master Data',     icon: Package,          roles: ['superadmin','pm'] },
  { id: 'rfid-gate',          label: 'RFID Gate',       icon: Radio,            roles: ['superadmin','pm','pic_lapangan'] },
  { id: 'laporan',            label: 'Laporan',         icon: History,          roles: ['superadmin','pm','pic_lapangan'] },
  { id: 'user-management',    label: 'Kelola Pengguna', icon: Users,            roles: ['superadmin'] },
];

// Rekomendasi #9: mobile bottom nav items (5 terpenting)
const mobileNavItems = [
  { id: 'dashboard',          icon: LayoutDashboard, label: 'Home' },
  { id: 'shipping-documents', icon: FileText,         label: 'Dokumen' },
  { id: 'tag-enrollment',     icon: Tag,              label: 'Tag' },
  { id: 'rfid-gate',          icon: Radio,            label: 'Gate' },
  { id: 'laporan',            icon: History,          label: 'Laporan' },
];

// ─── Demo accounts ────────────────────────────────────────────────────────────
const DEMO_USERS = [
  {
    name: 'Super Administrator', email: 'superadmin@mosa.id',
    role: 'Super Admin', roleKey: 'superadmin', category: 'it',
    desc: 'Akses penuh semua fitur PM & PIC',
    icon: Shield,
  },
  {
    name: 'Budi Santoso', email: 'pm.budi@mosa.id',
    role: 'Project Manager', roleKey: 'pm', category: 'management',
    desc: 'Buat dokumen, approve barang masuk/keluar',
    icon: FolderKanban,
  },
  {
    name: 'Joko Prasetyo', email: 'pic.joko@mosa.id',
    role: 'PIC Lapangan', roleKey: 'pic_lapangan', category: 'field',
    desc: 'Daftarkan tag, verifikasi gate, ACC dokumen',
    icon: ClipboardCheck,
  },
];

// ─── Page transition variants (Rekomendasi #7) ────────────────────────────────
const pageVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] } },
  exit:    { opacity: 0, y: -6, transition: { duration: 0.12 } },
};

// ─── Skeleton page fallback ───────────────────────────────────────────────────
function PageSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 bg-slate-200 rounded-xl w-48" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-white rounded-xl border border-slate-200" />
        ))}
      </div>
      <div className="h-64 bg-white rounded-xl border border-slate-200" />
    </div>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [currentUser, setCurrentUser]     = useState(null);
  const [httpError, setHttpError]         = useState(null);
  const [sidebarOpen, setSidebarOpen]     = useState(false);
  const [profileOpen, setProfileOpen]     = useState(false);
  const [cmdOpen, setCmdOpen]             = useState(false);   // #5 Command Palette
  const [previewRole, setPreviewRole]     = useState('ALL');

  // Login form
  const [email, setEmail]               = useState('pm.budi@mosa.id');
  const [password, setPassword]         = useState('password');
  const [showPassword, setShowPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  // HTTP error listener
  useEffect(() => {
    const handler = (e) => setHttpError(e.detail);
    window.addEventListener('mosa-http-error', handler);
    return () => window.removeEventListener('mosa-http-error', handler);
  }, []);

  // Initial page from URL hash
  const getInitialPage = () => {
    const hash = window.location.hash.replace(/^#\/?/, '');
    return hash || 'dashboard';
  };
  const [activePage, setActivePage] = useState(getInitialPage);

  // PWA
  const { deviceInfo, setDeviceInfo, isInstallable, triggerInstall } = useDeviceDetection();
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);

  // Navigate
  const navigateTo = (pageId, replace = false) => {
    if (!pageId) return;
    setHttpError(null);
    setActivePage(pageId);
    const targetHash = `#/${pageId}`;
    if (window.location.hash !== targetHash) {
      if (replace) window.history.replaceState({ page: pageId }, '', targetHash);
      else window.history.pushState({ page: pageId }, '', targetHash);
    }
  };

  // Restore session
  useEffect(() => {
    const savedUser = localStorage.getItem('mosa_user');
    const token = localStorage.getItem('mosa_token');
    if (savedUser && token) {
      try { setCurrentUser(JSON.parse(savedUser)); }
      catch { localStorage.removeItem('mosa_user'); localStorage.removeItem('mosa_token'); }
    }
  }, []);

  // Browser back/forward
  useEffect(() => {
    const handleLocationChange = () => {
      const hash = window.location.hash.replace(/^#\/?/, '');
      setActivePage(hash || 'dashboard');
    };
    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    if (!window.location.hash && currentUser) {
      window.history.replaceState({ page: activePage }, '', `#/${activePage}`);
    }
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, [currentUser]);

  // ── Rekomendasi #5: Cmd+K / Ctrl+K to open Command Palette ──────────────────
  useEffect(() => {
    if (!currentUser) return;
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen(o => !o);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentUser]);

  // ── Percepatan #7: Prefetch chunk saat browser idle berdasarkan role ──────────
  // requestIdleCallback dijalankan SETELAH paint pertama — zero impact on load
  useEffect(() => {
    if (!currentUser) return;
    const role = currentUser.role;
    const prefetchFns = [];

    // Semua role hampir pasti buka shipping-documents
    prefetchFns.push(() => import('./pages/ShippingDocuments'));

    if (role === 'pm' || role === 'superadmin') {
      prefetchFns.push(() => import('./pages/MasterData'));
    }
    if (role === 'pic_lapangan' || role === 'superadmin') {
      prefetchFns.push(() => import('./pages/RfidGate'));
    }
    if (role === 'superadmin') {
      prefetchFns.push(() => import('./pages/UserManagement'));
    }

    const ids = [];
    prefetchFns.forEach((fn, i) => {
      if ('requestIdleCallback' in window) {
        ids.push(window.requestIdleCallback(() => fn().catch(() => {}), { timeout: 3000 + i * 1000 }));
      } else {
        // Fallback for Safari
        const t = setTimeout(() => fn().catch(() => {}), 2000 + i * 500);
        ids.push(t);
      }
    });

    return () => {
      ids.forEach(id => {
        if ('cancelIdleCallback' in window) window.cancelIdleCallback(id);
        else clearTimeout(id);
      });
    };
  }, [currentUser]);

  const effectiveRole = (currentUser?.role === 'superadmin' && previewRole !== 'ALL')
    ? previewRole : currentUser?.role;
  const userWithEffectiveRole = currentUser ? { ...currentUser, role: effectiveRole } : null;

  const filteredNav = navItems.filter(item => {
    if (currentUser?.role === 'superadmin' && previewRole === 'ALL') return true;
    return item.roles?.includes(effectiveRole);
  });
  const activePageAllowed = filteredNav.some(item => item.id === activePage);

  // Mobile bottom nav items filtered by role
  const visibleMobileNav = mobileNavItems.filter(item => {
    const navDef = navItems.find(n => n.id === item.id);
    if (!navDef) return false;
    if (currentUser?.role === 'superadmin' && previewRole === 'ALL') return true;
    return navDef.roles?.includes(effectiveRole);
  });

  // Auth
  const handleLogin = async (e, directEmail = null, directPassword = null) => {
    if (e) e.preventDefault();
    setLoginLoading(true);
    const loginEmail    = directEmail    || email;
    const loginPassword = directPassword || password;
    try {
      const res = await authApi.login(loginEmail, loginPassword);
      localStorage.setItem('mosa_token', res.data.token);
      localStorage.setItem('mosa_user', JSON.stringify(res.data.user));
      setCurrentUser(res.data.user);
      const target = ['pm', 'pic_lapangan'].includes(res.data.user.role)
        ? 'shipping-documents' : 'dashboard';
      navigateTo(target, true);
    } catch (err) {
      showToast('Login gagal: ' + (err.response?.data?.message || err.message), 'error');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    try { await authApi.logout(); } catch {}
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

  // ── Login Screen ─────────────────────────────────────────────────────────────
  if (!currentUser) {
    return (
      <LuminousTopography
        className="min-h-screen"
        style={{ backgroundColor: '#060d1f' }}
        density={1.0} depth={3} drift={0.5} intensity={0.8}
        interactive accent="#3b82f6"
        safeArea={{ x: 0.2, y: 0.05, w: 0.6, h: 0.9 }}
        seed={42}
      >
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="w-full max-w-sm">
            <div
              className="rounded-3xl overflow-hidden shadow-2xl"
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.22)',
                boxShadow: '0 20px 50px rgba(0, 0, 0, 0.35), 0 1px 0 rgba(255,255,255,0.3) inset',
              }}
            >
              {/* Header */}
              <div className="px-8 pt-10 pb-7 text-white text-center">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5 mx-auto"
                  style={{ background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.35)', boxShadow: '0 4px 16px rgba(37,99,235,0.25)' }}>
                  <Radio className="w-7 h-7 text-white" />
                </div>
                <h1 className="text-2xl font-black text-white tracking-tight leading-tight"
                  style={{ textShadow: '0 2px 10px rgba(0,0,0,0.35)' }}>KESA WMS</h1>
                <p className="text-white/80 text-sm font-medium mt-1">Warehouse RFID Management System</p>
                <div className="mt-5 flex items-center justify-center gap-2">
                  <div className="h-1 w-10 rounded-full" style={{ background: '#facc15' }} />
                  <div className="h-1 w-5 rounded-full" style={{ background: 'rgba(250,204,21,0.5)' }} />
                  <div className="h-1 w-2 rounded-full" style={{ background: 'rgba(250,204,21,0.25)' }} />
                </div>
              </div>

              <div style={{ height: '1px', background: 'rgba(255,255,255,0.18)', margin: '0 24px' }} />

              {/* Body */}
              <div className="px-8 py-7">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-white/90 uppercase tracking-wide block">Email</label>
                    <input
                      type="email" required value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="nama@mosa.id"
                      className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder:text-white/50 focus:outline-none transition font-medium"
                      style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.25)' }}
                      onFocus={e => { e.target.style.background='rgba(255,255,255,0.18)'; e.target.style.borderColor='rgba(255,255,255,0.55)'; }}
                      onBlur={e  => { e.target.style.background='rgba(255,255,255,0.10)'; e.target.style.borderColor='rgba(255,255,255,0.25)'; }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-white/90 uppercase tracking-wide block">Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'} required value={password}
                        onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                        className="w-full pl-4 pr-11 py-3 rounded-xl text-sm text-white placeholder:text-white/50 focus:outline-none transition font-medium"
                        style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.25)' }}
                        onFocus={e => { e.target.style.background='rgba(255,255,255,0.18)'; e.target.style.borderColor='rgba(255,255,255,0.55)'; }}
                        onBlur={e  => { e.target.style.background='rgba(255,255,255,0.10)'; e.target.style.borderColor='rgba(255,255,255,0.25)'; }}
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition-colors p-1.5 rounded-lg cursor-pointer">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="pt-2">
                    <FlameButton type="submit" disabled={loginLoading} fullWidth height={48}
                      flameColor="amber" showArrow={!loginLoading}
                      text={loginLoading ? 'Memproses...' : 'Masuk ke Sistem'} />
                  </div>
                </form>

                <div className="flex items-center gap-3 my-5">
                  <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.18)' }} />
                  <span className="text-[10px] font-bold text-white/60 uppercase tracking-wider">Demo Akun</span>
                  <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.18)' }} />
                </div>

                <div className="space-y-2">
                  {DEMO_USERS.map(user => {
                    const Icon = user.icon || User;
                    const roleGlow = { superadmin:'rgba(59,130,246,0.3)', pm:'rgba(245,158,11,0.3)', pic_lapangan:'rgba(14,165,233,0.3)' };
                    const badgeColors = { superadmin:'bg-blue-500/20 text-blue-200 border-blue-400/30', pm:'bg-amber-500/20 text-amber-200 border-amber-400/30', pic_lapangan:'bg-sky-500/20 text-sky-200 border-sky-400/30' };
                    const bc = badgeColors[user.roleKey] || badgeColors.superadmin;
                    const glow = roleGlow[user.roleKey] || roleGlow.superadmin;
                    return (
                      <button key={user.email} type="button" onClick={() => quickSwitchUser(user.email)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl text-left cursor-pointer transition-all border"
                        style={{ background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.15)' }}
                        onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.16)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.35)'; e.currentTarget.style.boxShadow=`0 4px 20px ${glow}`; }}
                        onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.15)'; e.currentTarget.style.boxShadow='none'; }}
                      >
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)' }}>
                          <Icon className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white">{user.name}</span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${bc}`}>{user.role}</span>
                          </div>
                          <p className="text-[10px] text-white/70 truncate mt-0.5">{user.desc}</p>
                        </div>
                        <span className="text-white/40 text-xs flex-shrink-0">›</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <p className="text-center text-[10px] text-white/30 mt-5">KESA WMS v2.0 · PT KESA</p>
          </div>
        </div>
        <InstallPwaModal isOpen={isInstallModalOpen} onClose={() => setIsInstallModalOpen(false)}
          triggerInstall={triggerInstall} deviceInfo={deviceInfo}
          setDeviceInfo={setDeviceInfo} isInstallable={isInstallable} />
      </LuminousTopography>
    );
  }

  // ── Authenticated Layout ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-800 antialiased font-sans w-full max-w-full overflow-x-hidden">

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-30 md:hidden" />
      )}

      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-60 bg-slate-950 text-slate-200 flex flex-col p-3.5 border-r border-slate-800/80 transform transition-transform duration-200 ease-in-out md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>

        {/* Logo */}
        <div className="flex items-center justify-between px-2 pt-1 pb-3 border-b border-slate-800/60 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black shadow-xs">
              <Radio className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm tracking-tight text-white">KESA WMS</span>
                <span className="text-[9px] bg-amber-500/20 text-amber-400 font-mono font-semibold px-1 rounded border border-amber-500/30">RFID</span>
              </div>
              <span className="text-[10px] text-slate-400 block font-normal leading-none mt-0.5">Warehouse Management System</span>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden text-slate-400 p-1 hover:bg-slate-800 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Rekomendasi #5: Cmd+K hint di sidebar */}
        <button
          onClick={() => { setCmdOpen(true); setSidebarOpen(false); }}
          className="flex items-center gap-2 mt-3 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 transition text-xs cursor-pointer group"
        >
          <Command className="w-3.5 h-3.5 group-hover:text-blue-400 transition" />
          <span>Cari menu…</span>
          <kbd className="ml-auto text-[9px] bg-slate-800 px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
        </button>

        {/* Role simulation (superadmin only) */}
        {currentUser.role === 'superadmin' && (
          <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800 text-xs space-y-1 flex-shrink-0 mt-3">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Shield className="w-3 h-3 text-amber-400" />
              <span>Simulasi Role:</span>
            </div>
            <select value={previewRole} onChange={e => setPreviewRole(e.target.value)}
              className="w-full min-h-[36px] bg-slate-950 border border-slate-700/80 text-slate-200 rounded-md p-1.5 text-[11px] font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer">
              <option value="ALL">Semua Menu (Super Administrator)</option>
              <option value="pm">Project Manager (PM)</option>
              <option value="pic_lapangan">PIC Lapangan</option>
            </select>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto space-y-0.5 mt-3 pr-1">
          {filteredNav.map(item => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button key={item.id} onClick={() => { navigateTo(item.id); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer ${
                  isActive
                    ? 'bg-blue-600/20 text-white font-semibold border-l-2 border-amber-400 pl-2.5'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 font-medium'
                }`}>
                <Icon className={`w-[18px] h-[18px] flex-shrink-0 ${isActive ? 'text-amber-400' : 'text-slate-500'}`} />
                <span className="truncate text-[13px]">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Bottom: Install + User + Logout */}
        <div className="pt-2 border-t border-slate-800/80 space-y-2">
          <button onClick={() => setIsInstallModalOpen(true)}
            className="w-full flex items-center justify-between p-2 bg-slate-900/90 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 text-xs transition group cursor-pointer">
            <span className="flex items-center gap-2">
              <Download className="w-3.5 h-3.5 text-blue-400 group-hover:animate-bounce" />
              <span className="text-[11px] font-medium text-slate-200">Device & Install</span>
            </span>
            <span className="text-[9px] bg-blue-500/20 text-blue-400 font-mono px-1.5 py-0.5 rounded border border-blue-500/30">
              {deviceInfo.os}
            </span>
          </button>

          <button type="button" onClick={() => { setProfileOpen(true); setSidebarOpen(false); }}
            className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1 text-left hover:bg-slate-800 transition">
            <div className="w-7 h-7 rounded-md bg-blue-600/20 border border-blue-500/30 text-blue-400 flex items-center justify-center font-bold text-xs flex-shrink-0">
              {(currentUser?.name || 'User')[0]}
            </div>
            <div className="overflow-hidden flex-1">
              <div className="text-xs font-semibold truncate text-white">{currentUser?.name || 'User'}</div>
              <div className="text-[10px] font-mono text-slate-400 uppercase tracking-tight">{currentUser?.role || ''}</div>
            </div>
            <User className="w-4 h-4 text-slate-400" />
          </button>

          <button onClick={handleLogout}
            className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-slate-900 hover:bg-rose-950/60 hover:text-rose-300 text-slate-400 border border-slate-800 rounded-lg text-xs font-medium transition cursor-pointer">
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar Akun</span>
          </button>
        </div>
      </aside>

      {/* ── Main Content ────────────────────────────────────────────────────── */}
      <div className="flex-1 md:pl-60 flex flex-col min-h-screen min-w-0 overflow-x-hidden">

        {/* Desktop Topbar */}
        <header className="hidden md:flex bg-white border-b border-slate-100 px-6 py-3 justify-between items-center sticky top-0 z-20 shadow-xs">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 font-medium">KESA</span>
            <span className="text-slate-300">/</span>
            <span className="font-semibold text-slate-700 capitalize">{activePage.replace(/-/g, ' ')}</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Rekomendasi #5: Cmd+K trigger di topbar */}
            <button onClick={() => setCmdOpen(true)}
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 hover:border-blue-300 hover:bg-blue-50 rounded-lg text-xs font-medium text-slate-500 hover:text-blue-600 transition cursor-pointer">
              <Command className="w-3.5 h-3.5" />
              <span>Cari menu…</span>
              <kbd className="text-[9px] bg-slate-200 px-1 py-0.5 rounded font-mono ml-1">⌘K</kbd>
            </button>
            {/* Rekomendasi #8: Notification Bell */}
            <NotificationBell />
            <button onClick={() => setIsInstallModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 rounded-lg text-xs font-medium text-slate-600 hover:text-blue-700 transition cursor-pointer">
              <Download className="w-3.5 h-3.5" />
              {deviceInfo.isStandalone ? deviceInfo.os : 'Install App (' + deviceInfo.os + ')'}
            </button>
            <span className="text-[11px] font-bold bg-slate-900 text-white px-2.5 py-1 rounded-lg uppercase tracking-wide">
              {userWithEffectiveRole?.role || currentUser?.role || ''}
            </span>
          </div>
        </header>

        {/* Mobile Topbar */}
        <header className="md:hidden bg-white border-b border-slate-100 px-4 py-3 flex justify-between items-center sticky top-0 z-30 shadow-xs">
          <div className="flex items-center gap-2">
            <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600">
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <span className="font-bold text-sm text-slate-900">KESA WMS</span>
              <span className="block text-[10px] text-slate-400 capitalize leading-none">{activePage.replace(/-/g, ' ')}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Rekomendasi #8: Notification Bell mobile */}
            <NotificationBell />
            <button onClick={() => setIsInstallModalOpen(true)} className="p-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
              <Download className="w-4 h-4" />
            </button>
            <span className="text-[10px] font-bold bg-slate-900 text-white px-2 py-1 rounded-lg uppercase">{currentUser.role}</span>
          </div>
        </header>

        {/* Page Content — Rekomendasi #7: AnimatePresence page transitions */}
        <main className="flex-1 p-4 sm:p-5 lg:p-6 w-full max-w-[1600px] mx-auto pb-24 md:pb-6">
          {httpError ? (
            <ErrorPage status={httpError.status} onHome={() => navigateTo('dashboard', true)} />
          ) : !navItems.some(item => item.id === activePage) ? (
            <ErrorPage status={404} onHome={() => navigateTo('dashboard', true)} />
          ) : !activePageAllowed ? (
            <ErrorPage status={405} onHome={() => navigateTo('dashboard', true)} />
          ) : (
            <ErrorBoundary key={activePage} onReset={() => navigateTo('dashboard', true)}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={activePage}
                  variants={pageVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  <Suspense fallback={<PageSkeleton />}>
                    {activePage === 'dashboard'          && <Dashboard onNavigate={navigateTo} currentUser={userWithEffectiveRole} />}
                    {activePage === 'shipping-documents' && <ShippingDocuments currentUser={userWithEffectiveRole} />}
                    {activePage === 'tag-enrollment'     && <TagEnrollment currentUser={userWithEffectiveRole} />}
                    {activePage === 'master-data'        && <MasterData defaultTab="items" onNavigate={navigateTo} currentUser={userWithEffectiveRole} />}
                    {activePage === 'rfid-gate'          && <RfidGate onNavigate={navigateTo} currentUser={userWithEffectiveRole} />}
                    {activePage === 'laporan'            && <Laporan defaultTab="trail" currentUser={userWithEffectiveRole} />}
                    {activePage === 'user-management'    && <UserManagement currentUser={userWithEffectiveRole} />}
                  </Suspense>
                </motion.div>
              </AnimatePresence>
            </ErrorBoundary>
          )}
        </main>

        {/* ── Rekomendasi #9: Mobile Bottom Navigation Bar ─────────────────── */}
        {visibleMobileNav.length > 0 && (
          <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 flex items-stretch"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
            {visibleMobileNav.map(item => {
              const Icon = item.icon;
              const isActive = activePage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => { navigateTo(item.id); setSidebarOpen(false); }}
                  className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors cursor-pointer min-w-0 ${
                    isActive
                      ? 'text-blue-600'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <div className="relative">
                    <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
                    {isActive && (
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-blue-600 rounded-full" />
                    )}
                  </div>
                  <span className={`text-[9px] font-semibold leading-tight truncate max-w-full px-0.5 ${isActive ? 'text-blue-600' : 'text-slate-400'}`}>
                    {item.label}
                  </span>
                </button>
              );
            })}
          </nav>
        )}
      </div>

      {/* ── Global Modals ─────────────────────────────────────────────────── */}

      {/* Rekomendasi #5: Command Palette */}
      <CommandPalette
        isOpen={cmdOpen}
        onClose={() => setCmdOpen(false)}
        onNavigate={navigateTo}
        currentUser={userWithEffectiveRole}
      />

      <InstallPwaModal isOpen={isInstallModalOpen} onClose={() => setIsInstallModalOpen(false)}
        triggerInstall={triggerInstall} deviceInfo={deviceInfo}
        setDeviceInfo={setDeviceInfo} isInstallable={isInstallable} />
      <ProfileModal isOpen={profileOpen} user={currentUser}
        onClose={() => setProfileOpen(false)} onUserUpdated={handleUserUpdated} />
      <ToastContainer />
      <ConfirmDialogContainer />
      <GlobalLoading />
    </div>
  );
}
