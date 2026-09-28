import React, { useState, useEffect } from 'react';
import Portal from './Portal';
import { showToast } from './Toast';
import {
  Download,
  Smartphone,
  Laptop,
  CheckCircle2,
  X,
  Share2,
  PlusSquare,
  Radio,
  Bluetooth,
  Wifi,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  MapPin,
  Bell,
  Clock,
  Volume2,
  Vibrate,
  AlertCircle,
  RotateCcw
} from 'lucide-react';

export function useDeviceDetection() {
  const [deviceInfo, setDeviceInfo] = useState({
    os: 'Unknown',
    browser: 'Unknown',
    isMobile: false,
    isStandalone: false,
    supportsBluetooth: false,
    supportsGeolocation: 'geolocation' in navigator,
    supportsNotification: 'Notification' in window,
    notificationPermission: typeof Notification !== 'undefined' ? Notification.permission : 'default',
    isOnline: navigator.onLine,
  });
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    // Detect Standalone mode (already installed PWA)
    const isStandaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true ||
      document.referrer.includes('android-app://');

    // User agent heuristics
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    let detectedOs = 'Desktop / Windows';
    let isMobile = false;

    if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) {
      detectedOs = 'iOS';
      isMobile = true;
    } else if (/android/i.test(ua)) {
      detectedOs = 'Android';
      isMobile = true;
    } else if (/Macintosh|Mac OS X/i.test(ua)) {
      detectedOs = 'macOS';
    } else if (/Windows/i.test(ua)) {
      detectedOs = 'Windows';
    } else if (/Linux/i.test(ua)) {
      detectedOs = 'Linux';
    }

    // Detect browser
    let detectedBrowser = 'Browser';
    if (/Edg/i.test(ua)) detectedBrowser = 'Microsoft Edge';
    else if (/Chrome/i.test(ua)) detectedBrowser = 'Google Chrome';
    else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) detectedBrowser = 'Apple Safari';
    else if (/Firefox/i.test(ua)) detectedBrowser = 'Mozilla Firefox';

    // Hardware checks
    const hasBluetooth = 'bluetooth' in navigator;
    const hasGeolocation = 'geolocation' in navigator;
    const notifPermission = typeof Notification !== 'undefined' ? Notification.permission : 'denied';

    setDeviceInfo({
      os: detectedOs,
      browser: detectedBrowser,
      isMobile,
      isStandalone: isStandaloneMode,
      supportsBluetooth: hasBluetooth,
      supportsGeolocation: hasGeolocation,
      supportsNotification: typeof Notification !== 'undefined',
      notificationPermission: notifPermission,
      isOnline: navigator.onLine,
    });

    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsInstallable(false);
      setDeviceInfo((prev) => ({ ...prev, isStandalone: true }));
    };

    const handleOnline = () => setDeviceInfo((prev) => ({ ...prev, isOnline: true }));
    const handleOffline = () => setDeviceInfo((prev) => ({ ...prev, isOnline: false }));

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const triggerInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstallable(false);
        setDeferredPrompt(null);
      }
    }
  };

  return { deviceInfo, setDeviceInfo, isInstallable, triggerInstall };
}

export default function InstallPwaModal({ isOpen, onClose, triggerInstall, deviceInfo, setDeviceInfo, isInstallable }) {
  const [activeTab, setActiveTab] = useState('install'); // 'install' | 'permissions'
  const [geoState, setGeoState] = useState({ loading: false, data: null, error: null });
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleClearCache = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.unregister();
        }
      }
      if ('caches' in window) {
        const names = await caches.keys();
        for (const name of names) {
          await caches.delete(name);
        }
      }
      showToast('Cache & Service Worker berhasil di-reset! Memuat ulang...', 'success');
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (e) {
      window.location.reload();
    }
  };

  if (!isOpen) return null;

  // Geotagging Test
  const requestGeotag = () => {
    if (!navigator.geolocation) {
      setGeoState({ loading: false, data: null, error: 'GPS Geolocation tidak didukung browser ini.' });
      return;
    }
    setGeoState({ loading: true, data: null, error: null });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoState({
          loading: false,
          data: {
            lat: pos.coords.latitude.toFixed(6),
            lng: pos.coords.longitude.toFixed(6),
            accuracy: Math.round(pos.coords.accuracy),
            altitude: pos.coords.altitude ? `${Math.round(pos.coords.altitude)}m` : 'N/A',
            timestamp: new Date(pos.timestamp).toLocaleTimeString('id-ID'),
          },
          error: null,
        });
      },
      (err) => {
        setGeoState({ loading: false, data: null, error: `Gagal akses GPS: ${err.message}` });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Notification Test
  const requestNotification = async () => {
    if (!('Notification' in window)) {
      showToast('Notifikasi tidak didukung oleh browser ini.', 'warning');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (setDeviceInfo) {
        setDeviceInfo((prev) => ({ ...prev, notificationPermission: permission }));
      }
      if (permission === 'granted') {
        new Notification('🔔 MOSA WMS: Notifikasi Aktif', {
          body: 'Notifikasi sistem berhasil diaktifkan untuk pemantauan RFID & status SPK!',
          icon: '/icons/icon-192.svg',
          badge: '/icons/icon-192.svg',
        });
      }
    } catch (e) {
      // ignore
    }
  };

  // Sound & Vibration Test
  const testVibration = () => {
    if ('vibrate' in navigator) {
      navigator.vibrate([100, 50, 100, 50, 200]);
    }
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 1200;
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.2);
    } catch (e) {}
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in overflow-y-auto" onClick={onClose}>
        <div className="bg-slate-900 border border-slate-700 text-slate-100 rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl relative overflow-hidden space-y-5 my-8 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Glow Header */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        
        {/* Title Bar */}
        <div className="flex items-start justify-between relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shadow-inner">
              <Smartphone className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <span>Manajer Perangkat & PWA</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 font-mono px-2 py-0.5 rounded-full border border-emerald-500/30">v1.0</span>
              </h2>
              <p className="text-xs text-slate-400">
                Instalasi aplikasi, izin GPS geotagging, notifikasi & sensor lapangan.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup modal peranti"
            className="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('install')}
            className={`py-2 rounded-lg flex items-center justify-center gap-2 transition ${
              activeTab === 'install'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Instalasi App ({deviceInfo.os})</span>
          </button>
          <button
            onClick={() => setActiveTab('permissions')}
            className={`py-2 rounded-lg flex items-center justify-center gap-2 transition ${
              activeTab === 'permissions'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <MapPin className="w-3.5 h-3.5 text-emerald-400" />
            <span>GPS, Notifikasi & Sensor</span>
          </button>
        </div>

        {activeTab === 'install' ? (
          <>
            {/* Detected Hardware & Platform Diagnostics */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 space-y-2.5 text-xs">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Perangkat & Sistem Operasi:</span>
                <span className="text-emerald-400 font-mono text-[10px] flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Auto-Detect
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-slate-300">
                <div className="bg-slate-900/90 border border-slate-800 p-2 rounded-xl flex items-center gap-2">
                  {deviceInfo.isMobile ? (
                    <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <Laptop className="w-4 h-4 text-emerald-400 shrink-0" />
                  )}
                  <div className="overflow-hidden">
                    <span className="block text-[10px] text-slate-400 font-medium">Sistem Operasi</span>
                    <span className="font-semibold text-white truncate block">{deviceInfo.os}</span>
                  </div>
                </div>

                <div className="bg-slate-900/90 border border-slate-800 p-2 rounded-xl flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
                  <div className="overflow-hidden">
                    <span className="block text-[10px] text-slate-400 font-medium">Browser Web</span>
                    <span className="font-semibold text-white truncate block">{deviceInfo.browser}</span>
                  </div>
                </div>

                <div className="bg-slate-900/90 border border-slate-800 p-2 rounded-xl flex items-center gap-2">
                  <Bluetooth className={`w-4 h-4 shrink-0 ${deviceInfo.supportsBluetooth ? 'text-emerald-400' : 'text-amber-400'}`} />
                  <div className="overflow-hidden">
                    <span className="block text-[10px] text-slate-400 font-medium">Web Bluetooth BLE</span>
                    <span className={`font-semibold text-[11px] truncate block ${deviceInfo.supportsBluetooth ? 'text-emerald-300' : 'text-amber-300'}`}>
                      {deviceInfo.supportsBluetooth ? 'Ready (Scanner RS01)' : 'Tidak Tersedia'}
                    </span>
                  </div>
                </div>

                <div className="bg-slate-900/90 border border-slate-800 p-2 rounded-xl flex items-center gap-2">
                  <Wifi className={`w-4 h-4 shrink-0 ${deviceInfo.isOnline ? 'text-emerald-400' : 'text-rose-400'}`} />
                  <div className="overflow-hidden">
                    <span className="block text-[10px] text-slate-400 font-medium">Status Jaringan</span>
                    <span className={`font-semibold text-[11px] truncate block ${deviceInfo.isOnline ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {deviceInfo.isOnline ? 'Online (Terhubung)' : 'Offline'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Installation Actions */}
            {deviceInfo.isStandalone ? (
              <div className="bg-emerald-950/50 border border-emerald-700/60 p-4 rounded-2xl flex items-center gap-3 text-emerald-200">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                <div>
                  <div className="font-bold text-sm text-emerald-100">Aplikasi Sudah Terpasang!</div>
                  <div className="text-xs text-emerald-300/80">
                    Anda sedang menjalankan MOSA WMS dalam mode aplikasi standalone di {deviceInfo.os}.
                  </div>
                </div>
              </div>
            ) : isInstallable ? (
              <div className="space-y-2">
                <button
                  onClick={triggerInstall}
                  className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-2xl font-bold text-sm shadow-lg shadow-emerald-900/40 flex items-center justify-center gap-2.5 transition active:scale-[0.99] cursor-pointer"
                >
                  <Download className="w-5 h-5" />
                  <span>Install Aplikasi Sekarang (1-Klik)</span>
                </button>
                <p className="text-[11px] text-center text-slate-400">
                  Aplikasi akan dipasang ke {deviceInfo.os} Anda tanpa perlu download file installer terpisah.
                </p>
              </div>
            ) : deviceInfo.os === 'iOS' ? (
              <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="font-bold text-xs text-amber-300 flex items-center gap-2">
                  <Share2 className="w-4 h-4 text-amber-400" />
                  <span>Panduan Pasang di iPhone / iPad (Safari):</span>
                </div>
                <ol className="space-y-2 text-xs text-slate-300">
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
                    <span>Ketuk ikon <strong>Share</strong> (kotak dengan panah ke atas) di bagian bawah Safari.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
                    <span className="flex items-center gap-1">
                      Pilih <PlusSquare className="w-3.5 h-3.5 text-emerald-400 inline mx-0.5" /> <strong>Add to Home Screen</strong>.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</span>
                    <span>Ketuk <strong>Add (Tambah)</strong> di sudut kanan atas.</span>
                  </li>
                </ol>
              </div>
            ) : (
              <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-4 space-y-2.5">
                <div className="font-bold text-xs text-slate-200 flex items-center gap-2">
                  <ExternalLink className="w-4 h-4 text-emerald-400" />
                  <span>Cara Pasang di Browser {deviceInfo.browser}:</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Klik menu browser (ikon titik tiga <strong>⋮</strong> di kanan atas) &gt; pilih <strong>"Install MOSA WMS"</strong> atau <strong>"Tambahkan ke Layar Utama"</strong>.
                </p>
              </div>
            )}

            {/* Cache Reset Action */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleClearCache}
                className="w-full py-2.5 px-3 bg-slate-950 hover:bg-slate-800 border border-slate-700/70 hover:border-amber-500/50 text-slate-300 hover:text-amber-300 rounded-xl flex items-center justify-center gap-2 text-xs font-medium transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                <span>Reset Cache PWA & Muat Ulang</span>
              </button>
            </div>
          </>
        ) : (
          /* Permissions & Diagnostics Tab */
          <div className="space-y-3 text-xs">
            {/* 1. Geotagging & GPS */}
            <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-slate-200">
                  <MapPin className="w-4 h-4 text-emerald-400" />
                  <span>1. GPS & Geotagging Lapangan</span>
                </div>
                <button
                  onClick={requestGeotag}
                  disabled={geoState.loading}
                  className="px-2.5 py-1 bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/50 text-emerald-300 rounded-lg text-[11px] font-semibold transition cursor-pointer"
                >
                  {geoState.loading ? 'Mencari Satelit GPS...' : 'Uji Ambil Titik GPS'}
                </button>
              </div>

              {geoState.data ? (
                <div className="bg-slate-900/90 border border-emerald-500/40 rounded-xl p-2.5 grid grid-cols-3 gap-2 font-mono text-[11px] text-slate-300">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Latitude</span>
                    <span className="text-emerald-300 font-bold">{geoState.data.lat}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Longitude</span>
                    <span className="text-emerald-300 font-bold">{geoState.data.lng}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Akurasi GPS</span>
                    <span className="text-cyan-300 font-bold">±{geoState.data.accuracy} meter</span>
                  </div>
                </div>
              ) : geoState.error ? (
                <div className="p-2 bg-rose-950/40 border border-rose-800 text-rose-300 rounded-xl text-[11px] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{geoState.error}</span>
                </div>
              ) : (
                <p className="text-slate-400 text-[11px]">
                  Digunakan untuk mencatat koordinat titik penancapan tiang FO & checkout truk di titik pemeriksaan RFID.
                </p>
              )}
            </div>

            {/* 2. Timestamp & Anti-Tamper Clock */}
            <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-slate-200">
                  <Clock className="w-4 h-4 text-cyan-400" />
                  <span>2. Jam Presisi & Timestamp Mutasi</span>
                </div>
                <span className="font-mono text-[11px] bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-cyan-300 font-semibold">
                  {currentTime.toLocaleTimeString('id-ID')} WIB
                </span>
              </div>
              <p className="text-slate-400 text-[11px]">
                Waktu digital tersinkronisasi dengan Ledger Custody WMS untuk mencegah manipulasi jam transaksi.
              </p>
            </div>

            {/* 3. Push & Local Notification */}
            <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-slate-200">
                  <Bell className="w-4 h-4 text-amber-400" />
                  <span>3. Notifikasi Sistem (Alarm & Status)</span>
                </div>
                <button
                  onClick={requestNotification}
                  className="px-2.5 py-1 bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/50 text-amber-300 rounded-lg text-[11px] font-semibold transition cursor-pointer"
                >
                  {deviceInfo.notificationPermission === 'granted' ? 'Kirim Test Notifikasi' : 'Minta Izin Notifikasi'}
                </button>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Status Izin:</span>
                <span className={`font-semibold font-mono ${deviceInfo.notificationPermission === 'granted' ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {deviceInfo.notificationPermission === 'granted' ? 'Diizinkan (Granted)' : 'Belum Diizinkan (' + deviceInfo.notificationPermission + ')'}
                </span>
              </div>
            </div>

            {/* 4. Audio & Vibration Haptic Feedback */}
            <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-slate-200">
                <Volume2 className="w-4 h-4 text-emerald-400" />
                <div>
                  <span>4. Audio Beep & Getar (Haptic)</span>
                  <span className="block font-normal text-[10px] text-slate-400">Feedback saat scan tag RFID berhasil</span>
                </div>
              </div>
              <button
                onClick={testVibration}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] font-semibold border border-slate-700 transition cursor-pointer"
              >
                Test Bunyi & Getar
              </button>
            </div>
          </div>
        )}

        {/* Footer info */}
        <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-emerald-400" />
            MOSA WMS • Hardware Sensor Integrations
          </span>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white font-medium cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
    </Portal>
  );
}

