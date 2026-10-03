import { FlameButton } from '../components/ui/flame-button';
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
export default function GateMonitor({ onNavigate = null, onOpenPairing = null, currentUser = null }) {
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
    masterApi.getWarehouses().then((res) => {
      const whList = res.data || [];
      setWarehouses(whList);
      // Auto-select first warehouse so WebSocket connects immediately
      if (whList.length > 0 && selectedWarehouse === 'ALL') {
        setSelectedWarehouse(String(whList[0].id));
      }
    });
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
        const socket = await openAuthenticatedEdgeSocket(warehouseId, ['GET_MODE', 'SET_MODE:GATE_SECURITY'], {
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
    <div className="space-y-4">
      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Left: title + mode */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Radio className={`w-4 h-4 ${activeMismatch ? 'text-rose-500' : 'text-blue-500'} animate-pulse`} />
            <h1 className="text-lg font-bold text-slate-900">Monitor Gate RFID</h1>
          </div>
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border flex items-center gap-1.5 ${
            bridgeMode === 'GATE_SECURITY'
              ? 'bg-blue-50 text-blue-700 border-blue-200'
              : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${bridgeMode === 'GATE_SECURITY' ? 'bg-blue-500 animate-ping' : 'bg-amber-500'}`} />
            {bridgeMode === 'GATE_SECURITY' ? 'Pengawasan Aktif' : 'Meja Daftar'}
          </span>
          <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">
            <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${streamMode === 'WEBSOCKET' ? 'bg-blue-400' : streamMode === 'SSE_STREAM' ? 'bg-sky-400' : 'bg-amber-400'} animate-pulse`} />
            {streamMode === 'WEBSOCKET' ? 'WS' : streamMode === 'SSE_STREAM' ? 'SSE' : streamMode === 'POLLING_FALLBACK' ? 'POLL' : '…'} · {secondsAgo}s
          </span>
        </div>

        {/* Right: controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Mode switch buttons */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-semibold">
            <button
              onClick={() => handleSwitchBridgeMode('GATE_SECURITY')}
              className={`px-3 py-1.5 flex items-center gap-1 transition cursor-pointer ${
                bridgeMode === 'GATE_SECURITY' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              Pengawasan
            </button>
            <button
              onClick={() => handleSwitchBridgeMode('ENROLLMENT')}
              className={`px-3 py-1.5 flex items-center gap-1 transition cursor-pointer border-l border-slate-200 ${
                bridgeMode !== 'GATE_SECURITY' ? 'bg-amber-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              Enrollment
            </button>
          </div>

          {/* Warehouse select */}
          <select
            value={selectedWarehouse}
            onChange={(e) => setSelectedWarehouse(e.target.value)}
            className="p-1.5 border border-slate-200 rounded-lg text-xs font-medium bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none max-w-[220px]"
          >
            <option value="ALL">Semua Gudang</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>

          {/* Test scan */}
          <FlameButton
            onClick={handleTriggerBridgeTestScan}
            disabled={testingScan}
            height={32}
            flameColor="blue"
            showArrow={false}
            text=""
          >
            <Zap className="w-3.5 h-3.5" />
            Test Scan
          </FlameButton>

          {/* Sound toggle */}
          <button
            onClick={() => setSoundAlert(!soundAlert)}
            className={`p-1.5 rounded-lg border text-xs transition cursor-pointer ${
              soundAlert ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-slate-100 text-slate-400 border-slate-200'
            }`}
            title={soundAlert ? 'Matikan sirine' : 'Aktifkan sirine'}
          >
            {soundAlert ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Refresh */}
          <button
            onClick={() => loadEvents(false)}
            className="p-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* Pairing */}
          {onOpenPairing && (
            <FlameButton
              onClick={onOpenPairing}
              height={32}
              flameColor="blue"
              showArrow={false}
              text=""
            >
              <Cpu className="w-3.5 h-3.5" /> Konfigurasi
            </FlameButton>
          )}
        </div>
      </div>

      {/* ── Anomaly Alert Banner ────────────────────────────────── */}
      {activeMismatch && (
        lastPass?.mismatch_details?.includes('MUATAN BELUM LENGKAP') ? (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-100 rounded-lg flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-black uppercase bg-amber-600 text-white px-2 py-0.5 rounded tracking-wide">STANDBY — Muatan Belum Lengkap</span>
                  <span className="text-[10px] font-mono text-amber-700">{new Date(lastPass.created_at).toLocaleTimeString('id-ID')}</span>
                </div>
                <p className="text-sm font-bold text-slate-800">Gate {lastPass.gate_id} · {lastPass.warehouse?.name}</p>
                <p className="text-xs text-slate-600 mt-0.5">{lastPass.mismatch_details}</p>
              </div>
            </div>
            <button onClick={() => handleDismissAlert(lastPass.id)}
              className="px-3 py-1.5 bg-white border border-amber-200 text-amber-700 rounded-lg text-xs font-bold flex-shrink-0 cursor-pointer hover:bg-amber-50 transition">
              Mengerti
            </button>
          </div>
        ) : (
          <div className="bg-rose-600 border border-rose-400 rounded-xl p-4 flex items-start justify-between gap-4 text-white">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-white/20 rounded-lg flex-shrink-0">
                <ShieldAlert className="w-5 h-5 text-white animate-bounce" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-black uppercase bg-white/20 text-white px-2 py-0.5 rounded tracking-wide">ANOMALI TERDETEKSI</span>
                  <span className="text-[10px] font-mono text-rose-200">{new Date(lastPass.created_at).toLocaleTimeString('id-ID')}</span>
                </div>
                <p className="text-sm font-bold">Gate {lastPass.gate_id} · {lastPass.warehouse?.name}</p>
                <p className="text-xs text-rose-100 mt-0.5">{lastPass.mismatch_details || 'Tag RFID tanpa sesi izin yang sah.'}</p>
              </div>
            </div>
            <button onClick={() => handleDismissAlert(lastPass.id)}
              className="px-3 py-1.5 bg-white text-rose-700 rounded-lg text-xs font-bold flex-shrink-0 cursor-pointer hover:bg-rose-50 transition">
              Tutup
            </button>
          </div>
        )
      )}

      {/* ── Status Cards ────────────────────────────────────────── */}
      <div className="bg-slate-900 rounded-xl p-4 space-y-3">
        {/* Title bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${activeMismatch ? 'bg-rose-400 animate-ping' : 'bg-blue-400 animate-ping'}`} />
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              {currentWarehouseObj?.code || lastPass?.gate_id || 'GATE'} ·{' '}
              {(currentWarehouseObj?.gate_mode || 'SINGLE_ANTENNA_SESSION') === 'SINGLE_ANTENNA_SESSION' ? '1 Antena' : '2 Antena'}
            </span>
          </div>
          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${
            lastPass?.mismatch_flag
              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
              : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
          }`}>
            {lastPass?.mismatch_flag ? <ShieldAlert className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            {lastPass?.mismatch_flag ? 'KETIDAKSESUAIAN' : 'AMAN'}
          </span>
        </div>

        {/* 3 status cells */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
            <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wide mb-1">Sesi Otorisasi</div>
            <div className="text-sm font-bold text-white truncate">
              {lastPass?.shipping_document?.document_number || 'Tidak Ada Dok'}
            </div>
          </div>
          <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
            <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wide mb-1">Tag Terbaca</div>
            <div className="text-sm font-bold text-blue-300">
              {lastPass?.total_tags_detected ?? 0} tag
              <span className="text-[11px] text-slate-500 font-normal ml-1">· {lastPass?.direction || '-'}</span>
            </div>
          </div>
          <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
            <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wide mb-1">Hasil Evaluasi</div>
            <div className={`text-sm font-bold ${lastPass?.mismatch_flag ? 'text-rose-400' : 'text-blue-300'}`}>
              {lastPass?.mismatch_flag ? 'Anomali' : 'Sah'}
            </div>
          </div>
        </div>

        {/* Live telemetry bar */}
        <div className="bg-slate-950 rounded-lg px-3 py-2 flex items-center justify-between gap-3 border border-slate-800">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Radio className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
            <span className="font-medium">Live Telemetri Hardware</span>
            <span className="text-slate-600 text-[10px] font-mono">TCP:2022 / WS:2078</span>
          </div>
          {liveTagDetection ? (
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
              <span className="text-blue-300 font-bold">{liveTagDetection.epc}</span>
              <span className="text-slate-500">{liveTagDetection.rssi} dBm</span>
              <span className="text-slate-600">{new Date(liveTagDetection.timestamp || Date.now()).toLocaleTimeString()}</span>
            </div>
          ) : (
            <span className="text-xs text-slate-600 italic">Menunggu pembacaan antena...</span>
          )}
        </div>
      </div>

      {/* ── Simulasi ────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-500 mr-1">Simulasi:</span>
        {[
          { id: 'VALID_PASS',       label: 'Lewat Sah',         color: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' },
          { id: 'UNAPPROVED_BREACH', label: 'Terobosan Ilegal', color: 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100' },
          { id: 'OVER_QUOTA',       label: 'Kuota Berlebih',    color: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' },
          { id: 'UNREGISTERED_TAG', label: 'Tag Asing',         color: 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200' },
        ].map(({ id, label, color }) => (
          <button
            key={id}
            onClick={() => handleSimulate(id)}
            disabled={simulating}
            className={`px-3 py-1.5 border rounded-lg text-xs font-semibold transition cursor-pointer disabled:opacity-50 ${color}`}
          >
            {simulating ? '…' : label}
          </button>
        ))}
      </div>

      {/* ── Log Table ───────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800">Log Pembacaan RFID ({events.length})</h2>
          <FlameButton
            onClick={() => setShowClearModal(true)}
            disabled={events.length === 0}
            height={32}
            flameColor="rose"
            showArrow={false}
            text=""
          >
            <Trash2 className="w-3.5 h-3.5" /> Bersihkan
          </FlameButton>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-500 font-semibold text-[10px] uppercase tracking-wide border-b border-slate-200">
              <tr>
                <th className="px-4 py-2.5">Waktu</th>
                <th className="px-4 py-2.5">Gate & Gudang</th>
                <th className="px-4 py-2.5">Arah</th>
                <th className="px-4 py-2.5">Tag</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Keterangan</th>
                <th className="px-4 py-2.5 text-center w-12">Hapus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    <Radio className="w-7 h-7 mx-auto mb-2 text-slate-300" />
                    <p className="font-medium text-slate-500">Belum ada riwayat pembacaan RFID</p>
                    <p className="text-[11px] mt-0.5">Gunakan simulasi di atas untuk menguji sensor.</p>
                  </td>
                </tr>
              ) : (
                events.map((evt) => (
                  <tr key={evt.id} className={evt.mismatch_flag ? 'bg-rose-50/50' : 'hover:bg-slate-50 transition'}>
                    <td className="px-4 py-2.5 text-slate-500 font-mono whitespace-nowrap">
                      {new Date(evt.created_at).toLocaleTimeString('id-ID')}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-slate-800">{evt.gate_id}</div>
                      <div className="text-[10px] text-slate-400">{evt.warehouse?.name}</div>
                      {evt.shipping_document && (
                        <div className="text-[10px] text-indigo-600 font-medium">
                          #{evt.shipping_document.document_number}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono font-bold text-slate-700">{evt.direction}</td>
                    <td className="px-4 py-2.5 font-mono font-bold text-slate-800">{evt.total_tags_detected}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        evt.mismatch_flag
                          ? 'bg-rose-100 text-rose-700 border-rose-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}>
                        {evt.mismatch_flag ? 'Anomali' : 'Sesuai'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 max-w-[220px]">
                      {evt.mismatch_flag ? (
                        <span className="text-rose-600 text-[11px] font-medium">{evt.mismatch_details}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <button onClick={() => handleDeleteSingle(evt.id)}
                        className="p-1 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition cursor-pointer">
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

      {/* ── Clear Confirm Modal ─────────────────────────────────── */}
      {showClearModal && (
        <Portal>
          <div className="fixed inset-0 z-[100] bg-slate-900/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-rose-50 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Bersihkan Log?</h3>
                  <p className="text-xs text-slate-500">
                    {selectedWarehouse === 'ALL' ? 'Semua Gudang' : currentWarehouseObj?.name || `Gudang #${selectedWarehouse}`}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
                <FlameButton onClick={() => setShowClearModal(false)} disabled={deleting}
                  height={36} flameColor="blue" showArrow={false} text="Batal"
                />
                <FlameButton onClick={handleClearAll} disabled={deleting}
                  height={36} flameColor="rose" showArrow={false} text="">
                  <Trash2 className="w-3.5 h-3.5" />
                  {deleting ? 'Membersihkan...' : 'Ya, Hapus Semua'}
                </FlameButton>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}
