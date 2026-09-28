import React, { useState, useEffect, useRef, useCallback } from 'react';
import { gateApi, masterApi } from '../services/api';
import { openAuthenticatedEdgeSocket } from '../services/edgeWebSocket';
import { showToast } from '../components/Toast';
import Portal from '../components/Portal';
import { 
  Radio, 
  Lock, 
  Unlock, 
  ShieldAlert, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw, 
  Bell, 
  ArrowRight, 
  Volume2, 
  VolumeX, 
  PhoneCall, 
  X,
  Layers,
  Send,
  Trash2,
  AlertOctagon,
  Cpu,
  Zap
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' && window.location.port !== '5173' ? '/api' : `http://${typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1'}:8000/api`);
export default function GateMonitor({ onNavigate = null, currentUser = null }) {
  const [events, setEvents] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('ALL');
  const [loading, setLoading] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [lastPass, setLastPass] = useState(null);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [streamMode, setStreamMode] = useState('CONNECTING'); // 'WEBSOCKET' | 'SSE_STREAM' | 'POLLING_FALLBACK'
  const [soundAlert, setSoundAlert] = useState(false); // Default false / muted to prevent unexpected ringing
  const [dismissedAlertIds, setDismissedAlertIds] = useState(new Set());
  const [showClearModal, setShowClearModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [liveTagDetection, setLiveTagDetection] = useState(null);

  const soundAlertRef = useRef(soundAlert);
  const dismissedAlertIdsRef = useRef(new Set());
  const lastSeenEventIdRef = useRef(null);
  const wsRef = useRef(null);
  const isFetchingRef = useRef(false);

  // Keep soundAlertRef updated synchronously
  useEffect(() => {
    soundAlertRef.current = soundAlert;
  }, [soundAlert]);

  // Second counter tick for live latency visualization
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsAgo((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Audio Siren helper for Mismatch / Anomaly detection
  const playSiren = useCallback(() => {
    if (!soundAlertRef.current) return;
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, audioCtx.currentTime);
      osc.frequency.linearRampToValueAtTime(880, audioCtx.currentTime + 0.25);
      osc.frequency.linearRampToValueAtTime(440, audioCtx.currentTime + 0.5);
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.6);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.6);
    } catch (e) {
      // ignore audio playback errors
    }
  }, []);

  const handleDismissAlert = (eventId) => {
    dismissedAlertIdsRef.current.add(eventId);
    setDismissedAlertIds(new Set(dismissedAlertIdsRef.current));
    showToast('Peringatan sensor RFID telah dimatikan', 'info');
  };

  const handleDeleteSingle = async (eventId) => {
    try {
      await gateApi.deleteEvent(eventId);
      setEvents((prev) => prev.filter((e) => e.id !== eventId));
      if (lastPass?.id === eventId) {
        setLastPass(null);
      }
      showToast(`Log #${eventId} berhasil dihapus`, 'success');
    } catch (err) {
      showToast(err.response?.data?.message || 'Gagal menghapus log RFID', 'error');
    }
  };

  const handleClearAll = async () => {
    setDeleting(true);
    try {
      const res = await gateApi.clearHistory(selectedWarehouse);
      setEvents([]);
      setLastPass(null);
      lastSeenEventIdRef.current = null;
      setShowClearModal(false);
      showToast(res.data.message || 'Riwayat log RFID berhasil dibersihkan', 'success');
    } catch (err) {
      showToast(err.response?.data?.message || 'Gagal membersihkan log RFID', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const loadEvents = useCallback(async (isSilent = true) => {
    if (isFetchingRef.current) return;
    try {
      isFetchingRef.current = true;
      if (!isSilent) setLoading(true);
      const res = await gateApi.getLiveFeed(selectedWarehouse);
      setEvents(res.data);
      setSecondsAgo(0);

      if (res.data.length > 0) {
        const newest = res.data[0];
        const isNewEvent = lastSeenEventIdRef.current !== null && lastSeenEventIdRef.current !== newest.id;
        const isDismissed = dismissedAlertIdsRef.current.has(newest.id);
        const isUnderCount = newest.mismatch_details?.includes('MUATAN BELUM LENGKAP');

        if (newest.mismatch_flag && !isDismissed && isNewEvent && !isUnderCount) {
          playSiren();
        }

        lastSeenEventIdRef.current = newest.id;
        setLastPass(newest);
      }
    } catch (err) {
      console.error('Error fetching live gate feed:', err);
    } finally {
      isFetchingRef.current = false;
      if (!isSilent) setLoading(false);
    }
  }, [selectedWarehouse, playSiren]);

  useEffect(() => {
    masterApi.getWarehouses().then((res) => setWarehouses(res.data));
  }, []);

  const [bridgeMode, setBridgeMode] = useState('GATE_SECURITY');
  const [testingScan, setTestingScan] = useState(false);

  // Optimized Live Stream: Direct WebSocket (Hardware edge push) + Non-blocking Polling Fallback
  useEffect(() => {
    let ws = null;
    let pollTimer = null;
    let heartbeatTimer = null;
    let reconnectTimer = null;
    let isDisposed = false;

    // Helper: start smart polling fallback when WebSocket is unavailable
    const startPollingFallback = () => {
      if (isDisposed) return;
      setStreamMode('POLLING_FALLBACK');

      if (!pollTimer) {
        pollTimer = setInterval(() => {
          if (isDisposed) return;
          // Avoid flooding if browser tab is hidden/minimized
          if (typeof document !== 'undefined' && document.hidden) return;
          loadEvents(true);
        }, 3500);
      }

      // Periodically attempt to reconnect to Edge Bridge WebSocket
      if (!reconnectTimer) {
        reconnectTimer = setInterval(() => {
          if (isDisposed) return;
          if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
            connectWebSocket();
          }
        }, 15000);
      }
    };

    // Helper: connect to Edge Bridge WebSocket
    const warehouseId = selectedWarehouse === 'ALL' ? null : Number(selectedWarehouse);

    const connectWebSocket = async () => {
      if (isDisposed || !warehouseId) return startPollingFallback();
      try {
        setStreamMode((prev) => (prev === 'POLLING_FALLBACK' ? prev : 'CONNECTING'));
        const socket = await openAuthenticatedEdgeSocket(warehouseId, ['GET_MODE', 'SET_MODE:GATE_SECURITY', 'SET_MODE:ENROLLMENT'], {
          onAuthenticated: (authenticatedSocket) => {
            if (isDisposed) return authenticatedSocket.close();
            setStreamMode('WEBSOCKET');
            setSecondsAgo(0);
            if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
            if (reconnectTimer) { clearInterval(reconnectTimer); reconnectTimer = null; }
            if (!heartbeatTimer) heartbeatTimer = setInterval(() => {
              if (!isDisposed && (typeof document === 'undefined' || !document.hidden)) loadEvents(true);
            }, 30000);
            authenticatedSocket.send(JSON.stringify({ action: 'GET_MODE' }));
          },
          onMessage: (data) => {
            if (isDisposed) return;
            setSecondsAgo(0);
            setStreamMode('WEBSOCKET');
            if (data.type === 'MODE_CHANGED' || data.type === 'MODE_INFO' || data.type === 'HANDSHAKE') {
              const activeM = data.mode || data.operational_mode;
              if (activeM) setBridgeMode(activeM);
            } else if (data.type === 'TAG_READ') {
              setLiveTagDetection({ epc: data.epc, antenna: data.antenna, rssi: data.rssi, timestamp: data.timestamp });
            } else if (data.type === 'GATE_EVENT') loadEvents(true);
          },
          onError: () => { if (!isDisposed) startPollingFallback(); },
          onClose: () => { if (!isDisposed) startPollingFallback(); },
        });
        if (isDisposed) return socket.close();
        ws = socket;
        wsRef.current = socket;
      } catch (err) {
        startPollingFallback();
      }
    };

    // Initial load
    loadEvents(false);

    // Initiate connection
    connectWebSocket();

    // Tab visibility listener: instantly refresh when user switches back to this tab
    const handleVisibilityChange = () => {
      if (!document.hidden && !isDisposed) {
        loadEvents(true);
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      isDisposed = true;
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }

      if (pollTimer) clearInterval(pollTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (reconnectTimer) clearInterval(reconnectTimer);

      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        try {
          ws.close();
        } catch (e) {}
      }
      wsRef.current = null;
    };
  }, [selectedWarehouse, loadEvents]);

  // Handle various simulation scenarios focusing on Workflow & Sensor Mismatch
  const handleSimulate = async (scenarioType) => {
    setSimulating(true);
    try {
      const whId = selectedWarehouse === 'ALL' ? (warehouses[0]?.id || 1) : parseInt(selectedWarehouse, 10);
      const whObj = warehouses.find((w) => w.id === whId);
      const isSingleAntenna = whObj?.gate_mode === 'SINGLE_ANTENNA_SESSION';

      let payload = {
        warehouse_id: whId,
        gate_id: whObj?.code ? `GATE-${whObj.code}` : 'GATE-01',
        antenna_sequence: isSingleAntenna ? 'SINGLE_ANTENNA' : 'A_TO_B',
        direction: 'OUT',
        epc_list: ['E28011606000020410000001'],
      };

      if (scenarioType === 'VALID_PASS') {
        // Normal valid pass (needs active session, or system evaluates)
        payload.epc_list = ['E28011606000020410000001'];
      } else if (scenarioType === 'UNAPPROVED_BREACH') {
        // No session exists for this or wrong warehouse
        payload.antenna_sequence = isSingleAntenna ? 'SINGLE_ANTENNA' : 'A_TO_B';
        payload.direction = 'OUT';
        payload.epc_list = ['E28011606000020410000001', 'E28011606000020410000002', 'E28011606000020410000003'];
      } else if (scenarioType === 'OVER_QUOTA') {
        // Sensor detects 6 tags when session only authorizes 1
        payload.epc_list = [
          'E28011606000020410000001',
          'E28011606000020410000002',
          'E28011606000020410000003',
          'E28011606000020410000004',
          'E28011606000020410000005',
          'E28011606000020410000006',
        ];
      } else if (scenarioType === 'UNREGISTERED_TAG') {
        // Tag doesn't exist in database
        payload.epc_list = ['E28099999999999999999999', 'E28011606000020410000001'];
      }

      const res = await gateApi.triggerGateEvent(payload);
      await loadEvents(true);

      if (res.data.mismatch) {
        if (!res.data.is_undercount) {
          playSiren();
          showToast('PERINGATAN ANOMALI: ' + (res.data.mismatch_details?.join('; ') || 'Sensor membaca tag tidak sah!'), 'error');
        } else {
          showToast('MUATAN BELUM LENGKAP: ' + (res.data.mismatch_details?.join('; ') || 'Menunggu kelengkapan muatan.'), 'warning');
        }
      } else {
        showToast('SENSOR TERVERIFIKASI SAH: ' + res.data.message, 'success');
      }
    } catch (err) {
      showToast('Simulation error: ' + (err.response?.data?.message || err.message), 'error');
    } finally {
      setSimulating(false);
    }
  };

  const handleTriggerBridgeTestScan = async () => {
    setTestingScan(false);
    showToast('Simulasi scan tidak tersedia. Gunakan reader RFID fisik.', 'warning');
  };

  const handleSwitchBridgeMode = (newMode) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'SET_MODE', mode: newMode }));
      setBridgeMode(newMode);
      showToast(`Mode Reader dialihkan ke: ${newMode === 'GATE_SECURITY' ? 'Pengawasan Perlintasan (Aktif)' : 'Pendaftaran / Meja Scan'}`, 'info');
    } else {
      showToast('WebSocket Edge Bridge gudang terpilih offline atau belum dikonfigurasi', 'warning');
    }
  };

  const currentWarehouseObj = warehouses.find((w) => w.id === parseInt(selectedWarehouse, 10));
  const activeMismatch = lastPass?.mismatch_flag && !dismissedAlertIds.has(lastPass?.id);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-emerald-600 animate-pulse" />
            <h1 className="text-xl font-bold text-slate-800">Monitor Perlintasan RFID</h1>
          </div>
          <p className="text-xs text-slate-500">
            Validasi izin perlintasan material secara otomatis. Setiap ketidaksesuaian sensor akan memicu notifikasi darurat.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Reader Bridge Mode Pill */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-bold shadow-2xs border ${
            bridgeMode === 'GATE_SECURITY'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
              : 'bg-amber-50 text-amber-800 border-amber-300'
          }`}>
            <span className={`w-2.5 h-2.5 rounded-full ${bridgeMode === 'GATE_SECURITY' ? 'bg-emerald-500 animate-ping' : 'bg-amber-500 animate-pulse'}`} />
            <span>{bridgeMode === 'GATE_SECURITY' ? 'PENGAWASAN AKTIF' : 'MEJA DAFTAR'}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono font-bold text-emerald-400 shadow-2xs">
            <span className={`w-2 h-2 rounded-full ${streamMode === 'WEBSOCKET' ? 'bg-emerald-400 animate-ping' : streamMode === 'SSE_STREAM' ? 'bg-sky-400 animate-ping' : 'bg-amber-400'}`} />
            <span>
              {streamMode === 'WEBSOCKET' && 'DIRECT WS'}
              {streamMode === 'SSE_STREAM' && 'SSE PUSH'}
              {streamMode === 'POLLING_FALLBACK' && 'POLL'}
              {streamMode === 'CONNECTING' && 'CONNECTING'}
            </span>
            <span className="text-[10px] text-slate-400 font-normal ml-1">· {secondsAgo}s</span>
          </div>

          {/* Quick Test Scan Button */}
          <button
            onClick={handleTriggerBridgeTestScan}
            disabled={testingScan}
            className="px-3 py-2 bg-sky-600 hover:bg-sky-700 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition cursor-pointer disabled:opacity-50"
            title="Simulasikan pembacaan tag pada reader RFID"
          >
            <Zap className={`w-3.5 h-3.5 ${testingScan ? 'animate-spin' : 'text-amber-300'}`} />
            <span>{testingScan ? 'Memindai...' : '⚡ Test Scan'}</span>
          </button>

          <button
            onClick={() => setSoundAlert(!soundAlert)}
            className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              soundAlert ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-slate-100 text-slate-500 border-slate-200'
            }`}
          >
            {soundAlert ? <Volume2 className="w-4 h-4 text-emerald-600" /> : <VolumeX className="w-4 h-4" />}
            <span>{soundAlert ? 'Sirine ON' : 'Mute'}</span>
          </button>

          <select
            value={selectedWarehouse}
            onChange={(e) => setSelectedWarehouse(e.target.value)}
            className="p-2 border border-slate-200 rounded-xl text-xs font-semibold bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          >
            <option value="ALL">🌐 Semua Gudang & Portal RFID</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name} ({w.gate_mode === 'SINGLE_ANTENNA_SESSION' ? '1 Antena' : '2 Antena'})</option>
            ))}
          </select>

          <button
            onClick={() => loadEvents(false)}
            className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-xs shadow-2xs cursor-pointer"
            title="Refresh Manual"
          >
            <RefreshCw className={`w-4 h-4 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {onNavigate && (
            <button
              onClick={() => onNavigate('device-pairing')}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
              title="Buka Panel Pairing IP Reader"
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Pairing Reader</span>
            </button>
          )}
        </div>
      </div>

      {/* 🚨 ACTIVE SENSOR ANOMALY ALERT BANNER */}
      {activeMismatch && (
        lastPass?.mismatch_details?.includes('MUATAN BELUM LENGKAP') ? (
          <div className="bg-amber-500 text-slate-900 p-5 rounded-2xl shadow-xl border-4 border-amber-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-3 bg-white text-amber-600 rounded-xl flex-shrink-0 font-black">
                <AlertTriangle className="w-8 h-8 animate-pulse" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="bg-amber-800 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded tracking-wider">
                    MUATAN BELUM LENGKAP (STANDBY)
                  </span>
                  <span className="text-xs font-mono font-bold text-amber-950">
                    {new Date(lastPass.created_at).toLocaleTimeString('id-ID')}
                  </span>
                </div>
                <h2 className="text-base font-black">
                  Perhatian: Muatan Belum Lengkap di Titik RFID {lastPass.gate_id} ({lastPass.warehouse?.name})
                </h2>
                <p className="text-xs text-slate-900 whitespace-pre-line font-medium">
                  {lastPass.mismatch_details}
                </p>
                <div className="flex items-center gap-2 pt-1 text-[11px] text-amber-950 font-semibold">
                  <span>💡 Silakan mundur 1 langkah lalu melintas perlahan kembali agar seluruh tag terdeteksi. Sesi izin tetap AKTIF.</span>
                </div>
              </div>
            </div>

            <div className="flex sm:flex-col gap-2 w-full sm:w-auto">
              <button
                onClick={() => handleDismissAlert(lastPass.id)}
                className="px-4 py-2 bg-white text-amber-800 hover:bg-amber-50 rounded-xl text-xs font-bold shadow transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Mengerti</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-rose-600 text-white p-5 rounded-2xl shadow-xl animate-pulse border-4 border-rose-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-3 bg-white text-rose-600 rounded-xl flex-shrink-0 font-black">
                <ShieldAlert className="w-8 h-8 animate-bounce" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="bg-white/20 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded tracking-wider">
                    SENSOR KETIDAKSESUAIAN TERDETEKSI
                  </span>
                  <span className="text-xs font-mono font-bold text-rose-200">
                    {new Date(lastPass.created_at).toLocaleTimeString('id-ID')}
                  </span>
                </div>
                <h2 className="text-base font-black">
                  Peringatan: Perlintasan Anomali di Titik RFID {lastPass.gate_id} ({lastPass.warehouse?.name})!
                </h2>
                <p className="text-xs text-rose-100 whitespace-pre-line font-medium">
                  {lastPass.mismatch_details || 'Sensor membaca tag RFID tanpa adanya izin sesi approved yang sah.'}
                </p>
                <div className="flex items-center gap-2 pt-1 text-[11px] text-rose-200">
                  <PhoneCall className="w-3.5 h-3.5 animate-pulse" />
                  <span>Notifikasi WhatsApp darurat otomatis dikirim ke ponsel Project Manager.</span>
                </div>
              </div>
            </div>

            <div className="flex sm:flex-col gap-2 w-full sm:w-auto">
              <button
                onClick={() => handleDismissAlert(lastPass.id)}
                className="px-4 py-2 bg-white text-rose-700 hover:bg-rose-50 rounded-xl text-xs font-bold shadow transition flex items-center justify-center gap-1.5"
              >
                <VolumeX className="w-4 h-4" />
                <span>Matikan Peringatan</span>
              </button>
            </div>
          </div>
        )
      )}

      {/* Sensor Schema & Status Card */}
      <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl space-y-6">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${activeMismatch ? 'bg-rose-500 animate-ping' : 'bg-emerald-500 animate-ping'}`}></span>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              Titik RFID {currentWarehouseObj?.code || lastPass?.gate_id || 'GATE-01'} · Mode: {(currentWarehouseObj?.gate_mode || lastPass?.warehouse?.gate_mode || (warehouses.length > 0 ? warehouses[0].gate_mode : 'SINGLE_ANTENNA_SESSION')) === 'SINGLE_ANTENNA_SESSION' ? '1 Antena (App Session)' : '2 Antena (A ↔ B Auto)'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
              lastPass?.mismatch_flag
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
            }`}>
              {lastPass?.mismatch_flag ? <ShieldAlert className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              {lastPass?.mismatch_flag ? 'STATUS: KETIDAKSESUAIAN' : 'STATUS: AMAN'}
            </span>
          </div>
        </div>

        {/* Sensor & Workflow Graphic */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center items-center py-4 border-y border-slate-800">
          <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700 text-left">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">1. Status Sesi Otorisasi</div>
            <div className="text-sm font-bold text-slate-100 mt-1">
              {lastPass?.gate_transaction_id ? `Sesi #${lastPass.gate_transaction?.transaction_number || lastPass.gate_transaction_id}` : 'Tanpa Sesi Izin (Standby)'}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              PIC: {lastPass?.gate_transaction?.pic?.name || 'Menunggu Pengajuan'}
            </div>
          </div>

          <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700 text-left">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">2. Pembacaan Sensor UHF</div>
            <div className="text-sm font-bold text-emerald-400 mt-1">
              {lastPass?.total_tags_detected || 0} Tag Terbaca
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              Arah: {lastPass?.direction || '-'} ({lastPass?.antenna_sequence === 'SINGLE_ANTENNA' ? '1 Antena' : (lastPass?.antenna_sequence || '-')})
            </div>
          </div>

          <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700 text-left">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">3. Status Evaluasi Keamanan</div>
            <div className={`text-sm font-bold mt-1 ${lastPass?.mismatch_flag ? 'text-rose-400' : 'text-emerald-400'}`}>
              {lastPass?.mismatch_flag ? 'ANOMALI DILAPORKAN' : 'PERLINTASAN SAH'}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {lastPass?.mismatch_flag ? 'Peringatan Notifikasi Terkirim' : 'Kesesuaian 100% Sesuai Sesi'}
            </div>
          </div>
        </div>

        {/* Real Live Hardware Signal Telemetry */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 font-bold text-slate-200">
              <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
              <span>Sinyal Live Telemetri Hardware Reader:</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              Port TCP 2022 / WebSocket 2078 (Real-Time Mode)
            </span>
          </div>

          {liveTagDetection ? (
            <div className="p-3 bg-slate-900 border border-emerald-500/40 rounded-xl flex flex-wrap items-center justify-between gap-2 animate-fade-in font-mono text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                <span className="text-slate-400 text-[10px]">TAG TERDETEKSI:</span>
                <span className="text-emerald-300 font-bold text-sm tracking-wider">{liveTagDetection.epc}</span>
              </div>
              <div className="flex items-center gap-3 text-slate-400 text-[11px]">
                <span>Antena: <strong className="text-white">{liveTagDetection.antenna}</strong></span>
                <span>Kekuatan Sinyal: <strong className="text-sky-400">{liveTagDetection.rssi} dBm</strong></span>
                <span className="text-slate-500">{new Date(liveTagDetection.timestamp || Date.now()).toLocaleTimeString()}</span>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-slate-900/50 border border-slate-800/80 rounded-xl text-center text-slate-500 text-xs italic">
              Menunggu pembacaan fisik dari antena hardware RFID... (Dekatkan tag ke sensor)
            </div>
          )}
        </div>
      </div>

      {/* Live Activity Feed Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden space-y-3 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Log Riwayat Pembacaan RFID & Notifikasi
            </h2>
            <p className="text-xs text-slate-500">
              Menampilkan {events.length} log perlintasan terakhir yang terekam secara live.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowClearModal(true)}
              disabled={events.length === 0}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
                events.length > 0
                  ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 cursor-pointer'
                  : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Bersihkan Riwayat Log</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-2.5">Waktu</th>
                <th className="p-2.5">Titik RFID & Gudang</th>
                <th className="p-2.5">Arah Sensor</th>
                <th className="p-2.5">Jumlah Tag</th>
                <th className="p-2.5">Evaluasi Sensor</th>
                <th className="p-2.5">Rincian Notifikasi Ketidaksesuaian</th>
                <th className="p-2.5 text-center w-16">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    <Trash2 className="w-8 h-8 mx-auto mb-2 text-slate-300 opacity-60" />
                    <p className="font-medium text-slate-600">Belum ada riwayat pembacaan RFID</p>
                    <p className="text-[11px] text-slate-400">Gunakan simulator di atas untuk menguji deteksi sensor.</p>
                  </td>
                </tr>
              ) : (
                events.map((evt) => (
                  <tr key={evt.id} className={evt.mismatch_flag ? 'bg-rose-50/60' : 'hover:bg-slate-50'}>
                    <td className="p-2.5 text-slate-500 font-mono">
                      {new Date(evt.created_at).toLocaleTimeString('id-ID')}
                    </td>
                    <td className="p-2.5 font-semibold text-slate-800">
                      <div>{evt.gate_id}</div>
                      <div className="text-[10px] text-slate-400 font-normal">{evt.warehouse?.name}</div>
                      {evt.gate_transaction && (
                        <div className="text-[10px] text-indigo-700 font-medium mt-0.5">
                          Sesi #{evt.gate_transaction.transaction_number || evt.gate_transaction_id} · PIC: {evt.gate_transaction.pic?.name || 'PIC Lapangan'}
                        </div>
                      )}
                    </td>
                    <td className="p-2.5">
                      <span className="font-mono font-bold text-slate-700">{evt.direction}</span>
                      <span className="text-[10px] text-slate-400 block">{evt.antenna_sequence === 'SINGLE_ANTENNA' ? '1 Antena' : evt.antenna_sequence}</span>
                    </td>
                    <td className="p-2.5 font-mono font-bold text-slate-800">
                      {evt.total_tags_detected} Tag
                    </td>
                    <td className="p-2.5">
                      <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                        evt.mismatch_flag
                          ? 'bg-rose-100 text-rose-800 border border-rose-200'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      }`}>
                        {evt.mismatch_flag ? '🚨 KETIDAKSESUAIAN' : '✅ SESUAI'}
                      </span>
                    </td>
                    <td className="p-2.5 text-xs">
                      {evt.mismatch_flag ? (
                        <div className="text-rose-700 font-medium whitespace-pre-line text-[11px]">
                          {evt.mismatch_details}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px]">-</span>
                      )}
                    </td>
                    <td className="p-2.5 text-center">
                      <button
                        onClick={() => handleDeleteSingle(evt.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                        title="Hapus baris log ini"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal for Clearing All Gate Logs */}
      {showClearModal && (
        <Portal>
          <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-3 text-rose-600">
                <div className="p-2.5 bg-rose-50 rounded-xl">
                  <AlertOctagon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Bersihkan Riwayat Log Sensor?</h3>
                  <p className="text-xs text-slate-500">Tindakan ini tidak dapat dibatalkan.</p>
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Anda akan menghapus seluruh catatan riwayat pembacaan RFID untuk{' '}
                <strong>
                  {selectedWarehouse === 'ALL'
                    ? 'Semua Gudang & Portal RFID'
                    : currentWarehouseObj?.name || `Gudang #${selectedWarehouse}`}
                </strong>.
              </p>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => setShowClearModal(false)}
                  disabled={deleting}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Batal
                </button>
                <button
                  onClick={handleClearAll}
                  disabled={deleting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-sm transition flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{deleting ? 'Membersihkan...' : 'Ya, Bersihkan Riwayat'}</span>
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}
