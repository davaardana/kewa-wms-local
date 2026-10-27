import React, { useState, useEffect, useRef } from 'react';
import { devicesApi, masterApi } from '../services/api';
import { openAuthenticatedEdgeSocket } from '../services/edgeWebSocket';
import { showToast } from '../components/Toast';
import { showConfirm } from '../components/ConfirmDialog';
import Portal from '../components/Portal';
import {
  Radio,
  Cpu,
  Server,
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Plus,
  Edit2,
  Trash2,
  RefreshCw,
  Zap,
  Wifi,
  WifiOff,
  Search,
  Warehouse as WhIcon,
  Shield,
  Sliders,
  Check,
  X,
  Clock,
  Terminal,
  ExternalLink
} from 'lucide-react';

const READER_PRESETS = [
  {
    name: 'Electron EL-UHF-RC4 Series (Fixed Gate Reader)',
    model: 'ELECTRON_EL-UHF-RC4',
    defaultPort: 2022,
    defaultIp: '192.168.1.200',
    description: 'Reader UHF 4-Port / Single Port TCP/IP (Protokol CF v1.1)',
  },
  {
    name: 'Electron HW-VX Series (HW-VX6346KL / 6330K)',
    model: 'ELECTRON_HW-VX6346KL',
    defaultPort: 2077,
    defaultIp: '192.168.1.190',
    description: 'Portal Multi-Antenna 8dBi A-B Sequence (Protokol BB)',
  },
  {
    name: 'Chainway C72 / Handheld Android UHF',
    model: 'CHAINWAY_C72_HANDHELD',
    defaultPort: 2078,
    defaultIp: '192.168.1.150',
    description: 'Handheld Mobile Dispatch & Receiving Gun',
  },
  {
    name: 'Custom / Generic TCP RFID Reader',
    model: 'GENERIC_TCP_UHF_READER',
    defaultPort: 2022,
    defaultIp: '192.168.1.100',
    description: 'Reader UHF TCP/IP dengan port kustom',
  },
];

export default function DevicePairing({ currentUser = null }) {
  const [devices, setDevices] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState('ALL');
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const previewDevice = devices.find((device) => device.id === Number(selectedDeviceId) && device.is_active);

  // Ping Testing States (by device ID or IP)
  const [pingingMap, setPingingMap] = useState({});
  const [pingResultMap, setPingResultMap] = useState({});

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    device_name: '',
    device_code: '',
    device_model: 'ELECTRON_EL-UHF-RC4',
    device_role: 'gate_controller', // 'gate_controller' | 'enrollment_desktop' | 'hybrid_workstation'
    warehouse_id: '',
    ip_address: '192.168.1.200',
    edge_ws_url: '',
    tcp_port: 2022,
    internet_downtime_tolerance_seconds: 90,
    device_token: '',
    is_active: true,
  });
  const [modalPingLoading, setModalPingLoading] = useState(false);
  const [modalPingResult, setModalPingResult] = useState(null);
  const [modalError, setModalError] = useState(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && showModal) {
        setShowModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showModal]);

  // Live WebSocket Bridge Connection
  const [wsConnected, setWsConnected] = useState(false);
  const [bridgeMode, setBridgeMode] = useState('GATE_SECURITY');
  const [testingScan, setTestingScan] = useState(false);
  const [lastTestTag, setLastTestTag] = useState(null);
  const [liveStreamLogs, setLiveStreamLogs] = useState([]);
  const wsRef = useRef(null);

  // Fetch data
  const fetchData = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    // Fetch devices & warehouses independently to prevent blocking
    devicesApi.getDevices().then((res) => {
      setDevices(res.data || []);
    }).catch((err) => {
      console.error('Error fetching devices', err);
    }).finally(() => {
      if (showSpinner) setLoading(false);
    });

    masterApi.getWarehouses().then((res) => {
      const whList = res.data || [];
      setWarehouses(whList);
      if (whList.length > 0) {
        setFormData((prev) => ({ ...prev, warehouse_id: prev.warehouse_id || whList[0].id }));
      }
    }).catch((err) => {
      console.error('Error fetching warehouses', err);
    });
  };

  // Auto-select first active device when devices are loaded
  const hasAutoSelected = useRef(false);
  useEffect(() => {
    if (!hasAutoSelected.current && devices.length > 0 && !selectedDeviceId) {
      const firstActive = devices.find((d) => d.is_active);
      if (firstActive) {
        setSelectedDeviceId(String(firstActive.id));
        hasAutoSelected.current = true;
      }
    }
  }, [devices, selectedDeviceId]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(false), 5000);
    return () => clearInterval(interval);
  }, []);

  // Connect to Edge Bridge WebSocket for live preview
  useEffect(() => {
    let ws = null;
    let reconnectTimer = null;
    let isUnmounted = false;

    const warehouseId = previewDevice?.warehouse_id;
    setWsConnected(false);
    wsRef.current = null;
    if (!warehouseId) return undefined;

    const connect = async () => {
      if (isUnmounted) return;
      try {
        ws = await openAuthenticatedEdgeSocket(warehouseId, ['GET_MODE', 'SET_MODE:GATE_SECURITY', 'TEST_READER_CONNECTION'], {
          onAuthenticated: (socket) => {
            if (isUnmounted) return socket.close();
            setWsConnected(true);
            socket.send(JSON.stringify({ action: 'GET_MODE' }));
          },
          onClose: () => {
            if (!isUnmounted) {
              setWsConnected(false);
              reconnectTimer = setTimeout(connect, 3000);
            }
          },
          onError: () => { if (!isUnmounted) setWsConnected(false); },
          onMessage: (data) => {
            if (data.type === 'MODE_CHANGED' || data.type === 'MODE_INFO' || data.type === 'HANDSHAKE') {
              const activeM = data.mode || data.operational_mode;
              if (activeM) setBridgeMode(activeM);
            }
            setLiveStreamLogs((prev) => [{ id: Math.random().toString(36).substring(7), timestamp: new Date().toLocaleTimeString(), type: data.type || 'EVENT', epc: data.epc, antenna: data.antenna, rssi: data.rssi, status: data.status, reader_target: data.reader_target }, ...prev.slice(0, 40)]);
          },
        }, selectedDeviceId);
        if (isUnmounted) return ws.close();
        wsRef.current = ws;
      } catch (e) {
        if (!isUnmounted) {
          setWsConnected(false);
          reconnectTimer = setTimeout(connect, 3000);
        }
      }
    };

    connect();

    return () => {
      isUnmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        try { ws.close(); } catch (e) {}
      }
    };
  }, [previewDevice?.warehouse_id, previewDevice?.edge_ws_url, selectedDeviceId]);

  const handleToggleBridgeMode = (newMode) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'SET_MODE', mode: newMode }));
      setBridgeMode(newMode);
      showToast(`Mode Reader dialihkan ke: ${newMode === 'GATE_SECURITY' ? 'Pengawasan Perlintasan RFID' : 'Pendaftaran / Meja Kerja (Enrollment)'}`, 'info');
    } else {
      showToast('Edge bridge perangkat terpilih belum terhubung', 'warning');
    }
  };

  const handleTriggerTestScan = (customEpc = null) => {
    setTestingScan(false);
    setLastTestTag(null);
    showToast('Simulasi scan tidak tersedia. Gunakan reader RFID fisik.', 'warning');
  };

  const testReaderThroughEdge = (device) => new Promise((resolve, reject) => {
    let socket;
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try { socket?.close(); } catch {}
      callback(value);
    };
    const timeout = setTimeout(() => finish(reject, new Error('Timeout menunggu status reader dari Edge lokal.')), 5000);
    openAuthenticatedEdgeSocket(device.warehouse_id, ['TEST_READER_CONNECTION'], {
        onAuthenticated: (authenticatedSocket) => {
          authenticatedSocket.send(JSON.stringify({ action: 'TEST_READER_CONNECTION' }));
        },
        onMessage: (message) => {
          if (message.type === 'READER_CONNECTION_TEST') finish(resolve, message);
        },
        onClose: () => { if (!settled) finish(reject, new Error('Edge Bridge lokal terputus.')); },
        onError: () => { if (!settled) finish(reject, new Error('Edge Bridge lokal gagal dihubungi.')); },
      }, device.id)
      .then((openedSocket) => {
        if (settled) {
          try { openedSocket.close(); } catch {}
          return;
        }
        socket = openedSocket;
      })
      .catch((error) => finish(reject, error));
  });

  // Test reader through the Edge Bridge that can actually reach the local LAN.
  const handleTestPing = async (device) => {
    const devId = device.id;
    setPingingMap((prev) => ({ ...prev, [devId]: true }));
    setPingResultMap((prev) => ({ ...prev, [devId]: null }));

    try {
      const result = await testReaderThroughEdge(device);

      if (result.success) {
        setPingResultMap((prev) => ({
          ...prev,
          [devId]: {
            success: true,
            latency: null,
            message: result.message,
          },
        }));
        showToast(`Koneksi ${device.device_name} BERHASIL melalui Edge lokal`, 'success');
      } else {
        setPingResultMap((prev) => ({
          ...prev,
          [devId]: {
            success: false,
            latency: null,
            message: result.message,
          },
        }));
        showToast(`Koneksi ${device.device_name} GAGAL: ${result.message}`, 'error');
      }
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || 'Gagal terhubung ke host';
      setPingResultMap((prev) => ({
        ...prev,
        [devId]: {
          success: false,
          latency: err.response?.data?.latency_ms,
          message: errMsg,
        },
      }));
      showToast(`Koneksi ${device.device_name} GAGAL: ${errMsg}`, 'error');
    } finally {
      setPingingMap((prev) => ({ ...prev, [devId]: false }));
    }
  };

  // Test socket from the Edge selected in the modal, never from the VPS.
  const handleModalTestPing = async () => {
    if (!formData.ip_address || !formData.tcp_port) {
      showToast('Harap isi IP Address dan Port terlebih dahulu', 'warning');
      return;
    }

    setModalPingLoading(true);
    setModalPingResult(null);

    try {
      const result = await testReaderThroughEdge({ ...formData, id: editingId, warehouse_id: formData.warehouse_id || previewDevice?.warehouse_id });
      setModalPingResult({ success: result.success, latency: null, message: result.message });
      showToast(result.success ? 'Reader terhubung melalui Edge lokal.' : result.message, result.success ? 'success' : 'error');
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || 'Host tidak merespon';
      setModalPingResult({
        success: false,
        latency: err.response?.data?.latency_ms,
        message: errMsg,
      });
      showToast(`Gagal: ${errMsg}`, 'error');
    } finally {
      setModalPingLoading(false);
    }
  };

  // Open Create Modal
  const openCreateModal = () => {
    setIsEditing(false);
    setEditingId(null);
    setModalError(null);

    // Refresh warehouses if empty
    if (warehouses.length === 0) {
      masterApi.getWarehouses().then((res) => {
        const whList = res.data || [];
        setWarehouses(whList);
        if (whList.length > 0) {
          setFormData((prev) => ({ ...prev, warehouse_id: whList[0].id }));
        }
      });
    }

    setFormData({
      device_name: 'Electron EL-UHF-RC4 Gate Reader',
      device_code: 'RC4-GATE-' + Math.floor(100 + Math.random() * 900),
      device_model: 'ELECTRON_EL-UHF-RC4',
      device_role: 'gate_controller',
      warehouse_id: warehouses[0]?.id || '',
      ip_address: '192.168.1.200',
      edge_ws_url: '',
      tcp_port: 2022,
      internet_downtime_tolerance_seconds: 90,
      device_token: '',
      is_active: true,
    });
    setModalPingResult(null);
    setShowModal(true);
  };

  // Open Edit Modal
  const openEditModal = (device) => {
    setIsEditing(true);
    setEditingId(device.id);
    setModalError(null);
    setFormData({
      device_name: device.device_name,
      device_code: device.device_code,
      device_model: device.device_model || 'ELECTRON_EL-UHF-RC4',
      device_role: device.device_role || 'gate_controller',
      warehouse_id: device.warehouse_id,
      ip_address: device.ip_address,
      edge_ws_url: device.edge_ws_url || '',
      tcp_port: device.tcp_port,
      internet_downtime_tolerance_seconds: device.internet_downtime_tolerance_seconds || 90,
      device_token: '',
      is_active: device.is_active !== undefined ? !!device.is_active : true,
    });
    setModalPingResult(null);
    setShowModal(true);
  };

  // Apply Preset
  const handleApplyPreset = (preset) => {
    setFormData((prev) => ({
      ...prev,
      device_model: preset.model,
      tcp_port: preset.defaultPort,
      ip_address: preset.defaultIp,
    }));
    setModalPingResult(null);
  };

  // Save Device Form (Create / Update)
  const handleSaveDevice = async (e) => {
    e.preventDefault();
    setModalError(null);
    try {
      if (isEditing) {
        const res = await devicesApi.updateDevice(editingId, formData);
        const updated = res.data.device;
        setDevices((prev) =>
          prev.map((d) => (d.id === editingId ? { ...d, ...updated } : d))
        );
        showToast('Konfigurasi perangkat berhasil diperbarui!', 'success');
      } else {
        const res = await devicesApi.pairDevice(formData);
        if (res.data) {
          setDevices((prev) => [res.data.device, ...prev.filter((d) => d.id !== res.data.device.id)]);
        }
        showToast('Perangkat RFID berhasil dipasangkan!', 'success');
      }
      setShowModal(false);
      fetchData(false);
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || 'Gagal menyimpan perangkat';
      setModalError(errMsg);
      showToast('Gagal menyimpan perangkat: ' + errMsg, 'error');
    }
  };

  // Delete Device
  const handleDeleteDevice = async (device) => {
    const confirmed = await showConfirm({
      title: 'Lepas (Unpair) Perangkat',
      message: `Yakin ingin melepas (unpair) perangkat "${device.device_name}" (${device.device_code})?`,
      confirmText: 'Unpair Perangkat',
      type: 'danger',
    });
    if (!confirmed) return;
    try {
      await devicesApi.deleteDevice(device.id);
      setDevices((prev) => prev.filter((d) => d.id !== device.id));
      showToast('Perangkat berhasil dilepas.', 'success');
      fetchData(false);
    } catch (err) {
      showToast('Gagal melepas perangkat: ' + (err.response?.data?.message || err.message), 'error');
    }
  };

  // Filtered devices
  const filteredDevices = devices.filter((d) => {
    const matchSearch =
      d.device_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.device_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.ip_address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.warehouse?.name?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchWh =
      selectedWarehouseFilter === 'ALL' ||
      d.warehouse_id === parseInt(selectedWarehouseFilter, 10);

    return matchSearch && matchWh;
  });

  const onlineCount = devices.filter((d) => d.computed_status === 'online' && d.metrics_json?.reader_status === 'responsive').length;
  const offlineCount = devices.length - onlineCount;

  return (
    <div className="space-y-5 animate-fade-in text-slate-800 pb-10">
      {/* Header Panel */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-600 to-blue-500 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Panel Pairing & Konfigurasi RFID Reader</h1>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-blue-100 text-blue-800 border border-blue-300">
                AUTO-SYNC
              </span>
            </div>

          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          {(!currentUser || ['superadmin', 'pm'].includes(currentUser.role)) && (
            <button
              onClick={openCreateModal}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition active:scale-[0.98] cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Pasangkan Reader Baru</span>
            </button>
          )}
        </div>
      </div>

      {/* Stats & Edge Bridge Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Total Reader Terdaftar</span>
            <Server className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">{devices.length}</div>

        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Reader Online</span>
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
          </div>
          <div className="text-2xl font-black text-blue-600 mt-1">{onlineCount}</div>

        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Reader Offline / Standby</span>
            <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
          </div>
          <div className="text-2xl font-black text-slate-600 mt-1">{offlineCount}</div>

        </div>

        <div className={`p-4 rounded-xl border shadow-2xs transition ${
          wsConnected ? 'bg-blue-950/90 text-white border-blue-800' : 'bg-slate-900 text-slate-200 border-slate-800'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium opacity-80">Edge Bridge Daemon (2078)</span>
            {wsConnected ? (
              <span className="flex items-center gap-1 text-[10px] font-mono text-blue-400 bg-blue-500/20 px-1.5 py-0.5 rounded border border-blue-500/30">
                <Wifi className="w-3 h-3" /> LIVE WS
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-mono text-rose-400 bg-rose-500/20 px-1.5 py-0.5 rounded border border-rose-500/30">
                <WifiOff className="w-3 h-3" /> DISCONNECTED
              </span>
            )}
          </div>
          <div className="text-lg font-bold mt-1 font-mono tracking-tight">
            {wsConnected ? 'Edge WebSocket aktif' : 'Offline / Standby'}
          </div>

        </div>
      </div>

      {/* Mode Switcher & Live RFID Diagnostic Bar */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-4 sm:p-5 text-white border border-slate-700 shadow-md">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg ${
              bridgeMode === 'GATE_SECURITY' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40' : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
            }`}>
              {bridgeMode === 'GATE_SECURITY' ? <Shield className="w-5 h-5" /> : <Sliders className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Mode Operasional Bridge Saat Ini:</span>
                <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold font-mono ${
                  bridgeMode === 'GATE_SECURITY'
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                }`}>
                  {bridgeMode === 'GATE_SECURITY' ? 'PENGAWASAN PERLINTASAN RFID' : 'PENDAFTARAN / MEJA SCAN (ENROLLMENT)'}
                </span>
              </div>

            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
            {/* Mode Toggle Buttons */}
            <div className="bg-slate-950/80 p-1 rounded-xl border border-slate-700 flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleToggleBridgeMode('GATE_SECURITY')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  bridgeMode === 'GATE_SECURITY'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Mode Perlintasan</span>
              </button>
              <button
                type="button"
                onClick={() => handleToggleBridgeMode('ENROLLMENT')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  bridgeMode === 'ENROLLMENT'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Mode Meja/Pendaftaran</span>
              </button>
            </div>

            {/* Test Scan Trigger */}
            <button
              type="button"
              onClick={() => handleTriggerTestScan()}
              disabled={testingScan}
              className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 transition active:scale-95 shadow-xs cursor-pointer disabled:opacity-50"
            >
              <Zap className={`w-3.5 h-3.5 ${testingScan ? 'animate-spin' : 'text-amber-300'}`} />
              <span>{testingScan ? 'Memproses Scan...' : '⚡ Uji Test Scan Tag'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Cari nama, IP (192.168.1.x), atau kode..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs text-slate-500 font-medium whitespace-nowrap">Filter Gudang:</span>
          <select
            value={selectedWarehouseFilter}
            onChange={(e) => setSelectedWarehouseFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white cursor-pointer"
          >
            <option value="ALL">Semua Gudang & Yard</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.code})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Device Cards Grid */}
      <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
        Perangkat live preview
        <select value={selectedDeviceId} onChange={(e) => setSelectedDeviceId(e.target.value)} className="border rounded-lg p-2 bg-white">
          <option value="">Pilih perangkat</option>
          {filteredDevices.filter((device) => device.is_active).map((device) => (
            <option key={device.id} value={device.id}>{device.device_name} ({device.device_code})</option>
          ))}
        </select>
      </label>
      {filteredDevices.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 border border-slate-200/80 text-center space-y-3">
          <div className="w-14 h-14 mx-auto bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400">
            <Radio className="w-7 h-7" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">Belum Ada Perangkat RFID Terdaftar</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Pasangkan reader fisik pertama Anda (seperti Electron EL-UHF-RC4 atau HW-VX) untuk mulai membaca tag RFID secara real-time.
          </p>
          {(!currentUser || ['superadmin', 'pm'].includes(currentUser.role)) && (
            <button
              onClick={openCreateModal}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Pasangkan Reader Sekarang</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDevices.map((device) => {
            const isPinging = pingingMap[device.id];
            const pingRes = pingResultMap[device.id];
            const edgeStatus = device.computed_status || 'offline';
            const readerStatus = edgeStatus === 'offline' ? 'unknown' : (device.metrics_json?.reader_status || 'unknown');
            const isOnline = edgeStatus === 'online' && readerStatus === 'responsive';
            const statusLabel = isOnline ? 'Normal' : edgeStatus === 'warning' ? 'Koneksi terlambat' : edgeStatus === 'offline' ? 'Edge tidak terjangkau' : `Reader ${readerStatus}`;

            return (
              <div
                key={device.id}
                className="bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition flex flex-col justify-between overflow-hidden"
              >
                {/* Card Top */}
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                          {device.device_code}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                          device.device_role === 'enrollment_desktop'
                            ? 'bg-blue-50 text-blue-800 border-blue-200'
                            : device.device_role === 'hybrid_workstation'
                            ? 'bg-purple-50 text-purple-800 border-purple-200'
                            : 'bg-blue-50 text-blue-800 border-blue-200'
                        }`}>
                          {device.device_role === 'enrollment_desktop'
                            ? '🏷️ Meja Pendaftaran'
                            : device.device_role === 'hybrid_workstation'
                            ? '🔄 Hybrid Workstation'
                            : 'Titik Pemeriksaan RFID'}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 mt-1.5 leading-snug">
                        {device.device_name}
                      </h3>
                    </div>

                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                      isOnline ? 'bg-blue-100 text-blue-800 border border-blue-200' : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-blue-500 animate-pulse' : 'bg-slate-400'}`} />
                      {statusLabel}
                    </span>
                  </div>

                  {/* Specs & Network Pills */}
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-1.5 text-xs font-mono">
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-400 text-[11px]">IP Target:</span>
                      <span className="font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                        {device.ip_address} : {device.tcp_port}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-400 text-[11px]">Reader:</span>
                      <span className="font-semibold text-slate-800">{readerStatus}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-400 text-[11px]">Heartbeat:</span>
                      <span className="font-semibold text-slate-800">{device.last_heartbeat_at ? new Date(device.last_heartbeat_at).toLocaleTimeString() : 'Belum pernah'}</span>
                    </div>

                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-400 text-[11px]">Model:</span>
                      <span className="text-slate-700 truncate max-w-[170px] text-[11px]">
                        {device.device_model || 'ELECTRON_EL-UHF-RC4'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-400 text-[11px]">Gudang / Yard:</span>
                      <span className="font-sans font-semibold text-slate-800 flex items-center gap-1">
                        <WhIcon className="w-3 h-3 text-blue-600" />
                        {device.warehouse?.name || 'Yard Belum Dipilih'}
                      </span>
                    </div>
                  </div>

                  {/* Ping Diagnostic Result Banner */}
                  {pingRes && (
                    <div className={`p-2.5 rounded-xl text-xs flex items-center justify-between border ${
                      pingRes.success
                        ? 'bg-blue-50 text-blue-900 border-blue-200'
                        : 'bg-rose-50 text-rose-900 border-rose-200'
                    }`}>
                      <div className="flex items-center gap-1.5">
                        {pingRes.success ? (
                          <CheckCircle2 className="w-4 h-4 text-blue-600 flex-shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                        )}
                        <span className="text-[11px] font-medium leading-tight truncate max-w-[190px]">
                          {pingRes.message}
                        </span>
                      </div>
                      {pingRes.latency !== undefined && (
                        <span className="text-[10px] font-mono font-bold bg-white px-1.5 py-0.5 rounded border shadow-2xs">
                          {pingRes.latency}ms
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Card Actions Footer */}
                <div className="bg-slate-50/80 px-4 py-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleTestPing(device)}
                    disabled={isPinging}
                    className="flex-1 py-1.5 px-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95 shadow-2xs cursor-pointer"
                  >
                    <Zap className={`w-3.5 h-3.5 text-amber-500 ${isPinging ? 'animate-bounce' : ''}`} />
                    <span>{isPinging ? 'Pinging...' : 'Test Socket Ping'}</span>
                  </button>

                  {(!currentUser || ['superadmin', 'pm'].includes(currentUser.role)) && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(device)}
                        className="p-1.5 hover:bg-slate-200 text-slate-600 rounded-lg transition"
                        title="Edit Konfigurasi IP"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteDevice(device)}
                        className="p-1.5 hover:bg-rose-100 text-rose-600 rounded-lg transition"
                        title="Hapus / Unpair Reader"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Live Stream Terminal Logs */}
      <div className="bg-slate-950 text-slate-200 rounded-2xl p-4 border border-slate-800 shadow-lg space-y-2">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
              Live Reader Stream Telemetry (endpoint perangkat terpilih)
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            {liveStreamLogs.length} events logged
          </span>
        </div>

        <div className="max-h-48 overflow-y-auto font-mono text-[11px] space-y-1 pr-1 custom-scrollbar">
          {liveStreamLogs.length === 0 ? (
            <div className="text-slate-500 py-3 text-center italic text-xs">
              Menunggu sinyal scan dari physical reader... (Dekatkan tag RFID ke antena)
            </div>
          ) : (
            liveStreamLogs.map((log) => (
              <div key={log.id} className="flex items-center gap-2 py-0.5 hover:bg-slate-900 px-1.5 rounded">
                <span className="text-slate-500 text-[10px]">[{log.timestamp}]</span>
                <span className="text-blue-400 font-bold">{log.type}</span>
                {log.epc && <span className="text-amber-300 font-semibold">{log.epc}</span>}
                {log.antenna && <span className="text-slate-400">Antena: {log.antenna}</span>}
                {log.rssi && <span className="text-sky-400 font-medium">{log.rssi}dBm</span>}
                {log.status && <span className="text-slate-300">{log.status}</span>}
                {log.reader_target && <span className="text-slate-400">Target: {log.reader_target}</span>}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal Pair / Edit Reader */}
      {showModal && (
        <Portal>
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-[100] p-4 animate-fade-in overflow-y-auto" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl border border-slate-100 space-y-5 my-8 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    {isEditing ? 'Edit Konfigurasi Reader RFID' : 'Pasangkan Reader RFID Baru'}
                  </h3>
                  <p className="text-[11px] text-slate-400">Konfigurasi IP fisik hardware & penempatan gudang</p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                aria-label="Tutup modal reader"
                className="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-400 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Inline Error Alert */}
            {modalError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2 animate-in fade-in">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                <span className="font-semibold">{modalError}</span>
              </div>
            )}

            {/* Hardware Preset Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Pilih Preset Model Hardware:</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {READER_PRESETS.map((preset, idx) => {
                  const isSelected = formData.device_model === preset.model && formData.tcp_port === preset.defaultPort;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleApplyPreset(preset)}
                      className={`p-2.5 text-left rounded-xl border transition ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50/70 text-blue-900 ring-2 ring-blue-500/20'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="text-xs font-bold leading-tight">{preset.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">Port: {preset.defaultPort} | IP: {preset.defaultIp}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveDevice} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Nama Perangkat</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Portal Gate Yard Jakarta"
                    value={formData.device_name}
                    onChange={(e) => setFormData({ ...formData, device_name: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Kode Unik Device</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: RC4-GATE-01"
                    value={formData.device_code}
                    onChange={(e) => setFormData({ ...formData, device_code: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">IP Address Hardware</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: 192.168.1.200"
                    value={formData.ip_address}
                    onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Port TCP/IP</label>
                  <input
                    type="number"
                    required
                    placeholder="2022"
                    value={formData.tcp_port}
                    onChange={(e) => setFormData({ ...formData, tcp_port: parseInt(e.target.value, 10) || '' })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Toleransi Heartbeat (detik)</label>
                  <input
                    type="number"
                    required
                    min="30"
                    max="3600"
                    value={formData.internet_downtime_tolerance_seconds}
                    onChange={(e) => setFormData({ ...formData, internet_downtime_tolerance_seconds: parseInt(e.target.value, 10) || 90 })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Device API Token</label>
                  <input
                    type="password"
                    placeholder={isEditing ? 'Kosongkan jika tidak ingin rotasi token' : 'Tempel token acak minimum 32 karakter'}
                    value={formData.device_token}
                    onChange={(e) => setFormData({ ...formData, device_token: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <p className="mt-1 text-[10px] text-slate-500">Token asli hanya terlihat saat dibuat. Simpan di `edge-bridge/.env` sebagai `DEVICE_API_TOKEN`.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Penempatan Gudang / Yard</label>
                  <select
                    required
                    value={formData.warehouse_id}
                    onChange={(e) => setFormData({ ...formData, warehouse_id: parseInt(e.target.value, 10) })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white cursor-pointer"
                  >
                    {warehouses.length === 0 ? (
                      <option value="">Memuat daftar gudang transit...</option>
                    ) : (
                      <>
                        <option value="">-- Pilih Gudang Transit --</option>
                        {warehouses.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name} ({w.code})
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Peran / Fungsi Reader</label>
                  <select
                    required
                    value={formData.device_role || 'gate_controller'}
                    onChange={(e) => setFormData({ ...formData, device_role: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white cursor-pointer"
                  >
                    <option value="gate_controller">Titik Pemeriksaan RFID</option>
                    <option value="enrollment_desktop">🏷️ Meja Pendaftaran Tag (Desktop Enrollment)</option>
                    <option value="hybrid_workstation">🔄 Hybrid Workstation (Bisa Gate & Enrollment)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Model / Driver</label>
                <input
                  type="text"
                  required
                  value={formData.device_model}
                  onChange={(e) => setFormData({ ...formData, device_model: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

                <label className="block text-xs font-semibold text-slate-700">
                  Endpoint WSS Edge Gudang
                  <input type="url" placeholder="wss://edge-gudang.example.com" value={formData.edge_ws_url}
                    onChange={(e) => setFormData({ ...formData, edge_ws_url: e.target.value })}
                    className="mt-1 w-full p-2.5 border border-slate-200 rounded-xl text-xs font-mono" />
                  <span className="block mt-1 font-normal text-slate-500">Domain TLS Edge cabang; bukan IP reader. Tanpa kredensial, query, atau fragmen. Kosong menonaktifkan socket kecuali fallback pilot dikonfigurasi server.</span>
                </label>

                {/* Instant Test Ping Section inside Modal */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2">
                <div className="text-[11px] text-slate-600">
                  <span>Uji konektivitas socket sebelum menyimpan:</span>
                  {modalPingResult && (
                    <div className="font-semibold mt-0.5 flex items-center gap-1">
                      {modalPingResult.success ? (
                        <span className="text-blue-700">🟢 Terhubung ({modalPingResult.latency}ms)</span>
                      ) : (
                        <span className="text-rose-700">🔴 Gagal ({modalPingResult.message})</span>
                      )}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleModalTestPing}
                  disabled={modalPingLoading}
                  className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Zap className={`w-3.5 h-3.5 text-amber-600 ${modalPingLoading ? 'animate-bounce' : ''}`} />
                  <span>{modalPingLoading ? 'Menguji...' : 'Test Ping IP'}</span>
                </button>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl font-semibold text-slate-600 hover:bg-slate-50 text-xs transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-md transition active:scale-95 cursor-pointer"
                >
                  {isEditing ? 'Simpan Perubahan' : 'Pasangkan Perangkat'}
                </button>
              </div>
            </form>
          </div>
        </div>
        </Portal>
      )}
    </div>
  );
}
