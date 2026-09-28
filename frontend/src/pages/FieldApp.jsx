import React, { useState, useEffect, useRef } from 'react';
import { bleReader } from '../services/bleService';
import { workOrderApi, gateApi, returnApi, masterApi } from '../services/api';
import { showToast } from '../components/Toast';
import { 
  LogOut, 
  RotateCcw, 
  Scan, 
  CheckCircle2, 
  AlertTriangle, 
  Lock, 
  Unlock, 
  Plus, 
  Minus, 
  Volume2, 
  Radio, 
  ArrowRight, 
  Sparkles,
  RefreshCw,
  Clock,
  Truck,
  Wrench,
  MapPin,
  Save,
  FolderDown,
  Trash2,
  Bluetooth,
  Tag,
  Activity,
  Check,
  Eye,
  SlidersHorizontal,
  Layers,
  Zap,
  X
} from 'lucide-react';

export default function FieldApp({ currentUser }) {
  const [activeTab, setActiveTab] = useState('menu'); // 'menu' | 'gate_out' | 'gate_in' | 'scanner' | 'install_report'
  const [workOrders, setWorkOrders] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [selectedWoId, setSelectedWoId] = useState('');
  const selectedWo = workOrders.find((w) => w.id === parseInt(selectedWoId, 10));
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [manualPlate, setManualPlate] = useState('');
  const [scannedTags, setScannedTags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [gateStatus, setGateStatus] = useState(null); // { unlocked: bool, sessionNum: string, expiresAt: string }

  // Live RFID Handheld & Focused Item Scan State
  const [itemTags, setItemTags] = useState({}); // { [itemId]: string[] }
  const [scanningItem, setScanningItem] = useState(null); // { itemId, itemName, unit, maxQty, readyPrepared }
  const scanningItemRef = useRef(null);
  scanningItemRef.current = scanningItem;

  const [bleConnected, setBleConnected] = useState(false);
  const [bleStatusText, setBleStatusText] = useState('Disconnected');
  const [bleConnecting, setBleConnecting] = useState(false);

  // Real-time Live Gate Telemetry Feed
  const [liveGateFeed, setLiveGateFeed] = useState({
    state: 'IDLE', // 'IDLE' | 'STANDBY' | 'UNDERCOUNT' | 'COMPLETED' | 'MISMATCH'
    detectedCount: 0,
    lastEvent: null,
    tags: [],
    lastCheckAt: null,
  });

  // Manual Draft States
  const [draftSavedAt, setDraftSavedAt] = useState(() => {
    try {
      return {
        gate_out: localStorage.getItem('mosa_draft_gate_out') ? JSON.parse(localStorage.getItem('mosa_draft_gate_out')).timestamp : null,
        gate_in: localStorage.getItem('mosa_draft_gate_in') ? JSON.parse(localStorage.getItem('mosa_draft_gate_in')).timestamp : null,
        install: localStorage.getItem('mosa_draft_install') ? JSON.parse(localStorage.getItem('mosa_draft_install')).timestamp : null,
      };
    } catch {
      return { gate_out: null, gate_in: null, install: null };
    }
  });

  // Form states: multi-item mapping { [item_id]: qty }
  const [itemQuantities, setItemQuantities] = useState({});
  const [installQuantities, setInstallQuantities] = useState({});
  const [locationNotes, setLocationNotes] = useState('');
  const [installNotes, setInstallNotes] = useState('');
  const [returnCondition, setReturnCondition] = useState('good');
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Audio Beep helper (Supermarket scanner feedback sound)
  const playBeep = (freq = 880, duration = 0.15) => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
      // ignore audio context errors
    }
  };

  useEffect(() => {
    // Load approved, in_progress, and ready_for_dispatch WOs
    workOrderApi.getWorkOrders().then((res) => {
      const activeWos = (res.data || []).filter((w) =>
        ['approved', 'in_progress', 'ready_for_dispatch', 'partially_prepared'].includes(w.status)
      );
      setWorkOrders(activeWos);
      if (activeWos.length > 0) {
        setSelectedWoId(activeWos[0].id);
      }
    });

    // Load registered vehicles
    masterApi.getVehicles().then((res) => {
      setVehicles(res.data || []);
      if (res.data && res.data.length > 0) {
        setSelectedVehicleId(res.data[0].id);
      }
    });

    // BLE status callback
    bleReader.onStatusChange((status, connected) => {
      setBleStatusText(status);
      setBleConnected(connected);
    });

    // BLE tag scan callback (attributes to focused item if scanning modal is active)
    bleReader.onTagScanned((epc) => {
      playBeep(1200, 0.1);
      const active = scanningItemRef.current;
      if (active) {
        setItemTags((prev) => {
          const list = prev[active.itemId] || [];
          if (!list.includes(epc)) {
            const next = [...list, epc];
            setItemQty(active.itemId, Math.min(active.maxQty, next.length));
            return { ...prev, [active.itemId]: next };
          }
          return prev;
        });
      } else {
        setScannedTags((prev) => (!prev.includes(epc) ? [...prev, epc] : prev));
      }
    });
  }, []);

  const handleConnectBle = async () => {
    setBleConnecting(true);
    try {
      const res = await bleReader.connect();
      playBeep(1000, 0.2);
      showToast(`Bluetooth terhubung: ${res.deviceName || 'RFID Sled'}`, 'success');
    } catch (err) {
      showToast('Gagal menghubungkan Bluetooth: ' + err.message, 'error');
    } finally {
      setBleConnecting(false);
    }
  };

  // Live Gate Status Tracker & Auto-Restore Active Session
  useEffect(() => {
    if (!currentUser) return;

    // Check for ongoing session on initial mount or selected WO
    const checkOngoing = async () => {
      try {
        const warehouseId = selectedWo?.warehouse_id || 1;
        const res = await gateApi.getTransactions({ warehouse_id: warehouseId });
        const ongoing = (res.data || []).find(
          (t) => t.status === 'approved' && t.pic_user_id === currentUser.id && t.type === 'OUT_FULFILLMENT'
        );
        if (ongoing && (!gateStatus || gateStatus.transactionId !== ongoing.id)) {
          const total = ongoing.items?.reduce((acc, it) => acc + (it.requested_qty || 0), 0) || 0;
          setGateStatus({
            unlocked: true,
            transactionId: ongoing.id,
            sessionNum: ongoing.transaction_number,
            status: ongoing.status,
            message: 'SESI IZIN AKTIF! Silakan bawa material melintasi portal sensor.',
            totalItems: total,
            warehouseId: ongoing.warehouse_id,
            items: ongoing.items,
          });
        }
      } catch (e) {
        // ignore
      }
    };
    checkOngoing();
  }, [currentUser, selectedWo]);

  // Live polling when gateStatus is active
  useEffect(() => {
    if (!gateStatus || !gateStatus.transactionId || gateStatus.status === 'completed') return;

    let isMounted = true;
    let isPolling = false;

    const pollGateLive = async () => {
      if (!isMounted || isPolling) return;

      try {
        isPolling = true;
        const res = await gateApi.getLiveFeed(gateStatus.warehouseId || 1);
        if (!isMounted) return;

        const events = res.data || [];
        const relatedEvent = events.find((e) => e.gate_transaction_id === gateStatus.transactionId);

        // Also check if transaction in DB is already completed or cancelled
        let txCompleted = false;
        let currentTx;
        try {
          const txRes = await gateApi.getTransactions({ warehouse_id: gateStatus.warehouseId || 1 });
          currentTx = (txRes.data || []).find((t) => t.id === gateStatus.transactionId);
          if (currentTx && currentTx.status === 'completed') {
            txCompleted = true;
          } else if (currentTx && (currentTx.status === 'cancelled' || currentTx.status === 'expired')) {
            setGateStatus(null);
            setLiveGateFeed({ state: 'IDLE', detectedCount: 0, lastEvent: null, tags: [], lastCheckAt: null });
            showToast(
              currentTx.status === 'expired'
                ? `⏱️ Sesi #${gateStatus.sessionNum} telah ditutup otomatis (15 menit tanpa aktivitas pemindaian).`
                : `Sesi #${gateStatus.sessionNum} dibatalkan.`,
              'info'
            );
            return;
          }
        } catch (e) {
          // ignore
        }

        if (relatedEvent || txCompleted) {
          const cumCount = relatedEvent?.raw_payload?.cumulative_count || relatedEvent?.total_tags_detected || 0;
          const cumTags = relatedEvent?.raw_payload?.cumulative_epcs || relatedEvent?.tag_epcs_json || [];
          const isUnderCount = !txCompleted && (
            relatedEvent?.mismatch_details?.includes('MUATAN BELUM LENGKAP') ||
            relatedEvent?.mismatch_details?.includes('STANDBY')
          );
          const isCompleted = txCompleted || (relatedEvent?.is_valid && !relatedEvent?.mismatch_flag);

          const totalPassedCount = currentTx?.items?.reduce((acc, it) => acc + (it.passed_qty || 0), 0) || (isCompleted ? gateStatus.totalItems : cumCount);

          setLiveGateFeed({
            state: isCompleted ? 'COMPLETED' : (isUnderCount ? 'UNDERCOUNT' : (relatedEvent?.mismatch_flag ? 'MISMATCH' : 'PASSED')),
            detectedCount: isCompleted ? totalPassedCount : cumCount,
            lastEvent: relatedEvent,
            tags: cumTags,
            lastCheckAt: new Date().toLocaleTimeString('id-ID'),
          });

          if (isCompleted && gateStatus.status !== 'completed') {
            playBeep(1200, 0.4);
            setGateStatus((prev) => ({
              ...prev,
              status: 'completed',
              message: 'PERLINTASAN SELESAI! Seluruh material telah sukses diverifikasi.',
            }));
            // Refresh work order data so BOQ updates live
            workOrderApi.getWorkOrders().then((woRes) => {
              const activeWos = (woRes.data || []).filter((w) =>
                ['approved', 'in_progress', 'ready_for_dispatch', 'partially_prepared'].includes(w.status)
              );
              setWorkOrders(activeWos);
            });
            showToast('Seluruh muatan terverifikasi sah.', 'success');
          }
        }
      } catch (err) {
      } finally {
        isPolling = false;
      }
    };

    pollGateLive();
    const interval = setInterval(pollGateLive, 2000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        pollGateLive();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      isMounted = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [gateStatus]);

  // Auto-initialize item quantities when selected WO changes
  // PRIORITAS: Otomatis terisi sesuai jumlah fisik yang telah disiapkan oleh Storeroom (prepared_qty)!
  useEffect(() => {
    const boqList = selectedWo?.boq_items || selectedWo?.boqItems || [];
    if (boqList.length > 0) {
      const initial = {};
      const initialInstall = {};
      const hasAnyPrepared = boqList.some((b) => Number(b.prepared_qty || 0) > 0);

      boqList.forEach((b) => {
        const quota = Number(b.quota_qty || 0);
        const withdrawn = Number(b.withdrawn_qty || 0);
        const returned = Number(b.returned_qty || 0);
        const installed = Number(b.installed_qty || 0);
        const prepared = Number(b.prepared_qty || 0);
        const remQuota = Math.max(0, quota - withdrawn + returned);

        // Kuantitas yang disiapkan Storeroom di Staging Bay dan belum ditarik keluar
        // Pastikan tidak pernah melebihi sisa kuota yang belum ditarik
        const readyPrepared = Math.max(0, prepared - withdrawn);

        if (hasAnyPrepared) {
          // Jika storeroom telah menyiapkan barang, isi sesuai barang disiapkan yang belum keluar
          initial[b.item_id] = Math.min(remQuota, readyPrepared);
        } else {
          // Jika belum ada pelaporan fisik spesifik, default ke sisa kuota penarikan BOQ
          initial[b.item_id] = remQuota;
        }

        // Untuk laporan instalasi: default ke jumlah barang yang sedang dipegang mandor di lapangan
        const inField = Math.max(0, withdrawn - installed - returned);
        initialInstall[b.item_id] = inField;
      });

      setItemQuantities(initial);
      setInstallQuantities(initialInstall);
    }
  }, [selectedWoId, workOrders]);

  // Helper untuk sinkronisasi ulang ke kuantiti fisik yang disiapkan Storeroom
  const handleSyncWithPrepared = () => {
    const boqList = selectedWo?.boq_items || selectedWo?.boqItems || [];
    if (boqList.length === 0) return;
    const synced = {};
    boqList.forEach((b) => {
      const quota = Number(b.quota_qty || 0);
      const withdrawn = Number(b.withdrawn_qty || 0);
      const returned = Number(b.returned_qty || 0);
      const prepared = Number(b.prepared_qty || 0);
      const remQuota = Math.max(0, quota - withdrawn + returned);
      const readyPrepared = Math.max(0, prepared - withdrawn);
      synced[b.item_id] = Math.min(remQuota, readyPrepared);
    });
    setItemQuantities(synced);
    playBeep(880, 0.1);
    showToast('⚡ Kuantiti muatan disinkronkan otomatis sesuai barang yang disiapkan Storeroom!', 'success');
  };

  // Helper untuk reset semua kuantiti ke 0
  const handleResetQuantitiesToZero = () => {
    const boqList = selectedWo?.boq_items || selectedWo?.boqItems || [];
    if (boqList.length === 0) return;
    const zeroed = {};
    boqList.forEach((b) => {
      zeroed[b.item_id] = 0;
    });
    setItemQuantities(zeroed);
    playBeep(500, 0.08);
    showToast('Semua jumlah material direset ke 0.', 'info');
  };

  // Helper untuk sinkronisasi retur ke sisa material yang belum terpasang di lapangan
  const handleSyncWithFieldRemainder = () => {
    const boqList = selectedWo?.boq_items || selectedWo?.boqItems || [];
    if (boqList.length === 0) return;
    const returnRemainder = {};
    boqList.forEach((b) => {
      const withdrawn = Number(b.withdrawn_qty || 0);
      const returned = Number(b.returned_qty || 0);
      const installed = Number(b.installed_qty || 0);
      const inField = Math.max(0, withdrawn - installed - returned);
      returnRemainder[b.item_id] = inField;
    });
    setItemQuantities(returnRemainder);
    playBeep(880, 0.1);
    showToast('⚡ Jumlah retur disinkronkan sesuai sisa material di lapangan yang belum terpasang.', 'success');
  };

  // Deteksi jika ada material yang kuantitinya melebihi sisa kuota BOQ
  const quotaViolations = React.useMemo(() => {
    if (!selectedWo) return [];
    const boqList = selectedWo.boq_items || selectedWo.boqItems || [];
    const violations = [];

    for (const b of boqList) {
      const quota = Number(b.quota_qty || 0);
      const withdrawn = Number(b.withdrawn_qty || 0);
      const returned = Number(b.returned_qty || 0);
      const remQuota = Math.max(0, quota - withdrawn + returned);
      const requested = Number(itemQuantities[b.item_id] || 0);

      if (requested > remQuota) {
        violations.push({
          item_id: b.item_id,
          item_name: b.item?.name || `Material #${b.item_id}`,
          unit: b.item?.unit || 'unit',
          requested,
          remQuota,
          exceededBy: requested - remQuota,
        });
      }
    }
    return violations;
  }, [selectedWo, itemQuantities]);

  const hasQuotaViolation = quotaViolations.length > 0;

  // Sesuaikan seluruh kuantiti otomatis agar tidak ada yang melebihi batas kuota
  const handleClampToRemainingQuota = () => {
    const boqList = selectedWo?.boq_items || selectedWo?.boqItems || [];
    if (boqList.length === 0) return;
    const clamped = {};
    boqList.forEach((b) => {
      const quota = Number(b.quota_qty || 0);
      const withdrawn = Number(b.withdrawn_qty || 0);
      const returned = Number(b.returned_qty || 0);
      const remQuota = Math.max(0, quota - withdrawn + returned);
      const requested = Number(itemQuantities[b.item_id] || 0);
      clamped[b.item_id] = Math.min(remQuota, Math.max(0, requested));
    });
    setItemQuantities(clamped);
    playBeep(880, 0.1);
    showToast('⚡ Kuantiti muatan disesuaikan otomatis ke batas sisa kuota BOQ!', 'success');
  };

  const setItemQty = (itemId, qty) => {
    setItemQuantities((prev) => ({
      ...prev,
      [itemId]: Math.max(0, qty),
    }));
  };

  const setInstallQty = (itemId, qty) => {
    setInstallQuantities((prev) => ({
      ...prev,
      [itemId]: Math.max(0, qty),
    }));
  };

  // Total requested units across all selected items (for Checkout / Return)
  const totalRequestedItems = React.useMemo(() => {
    return Object.values(itemQuantities).reduce((acc, qty) => acc + (Number(qty) || 0), 0);
  }, [itemQuantities]);

  // Total installed units across all selected items (for Installation report)
  const totalInstalledItems = React.useMemo(() => {
    return Object.values(installQuantities).reduce((acc, qty) => acc + (Number(qty) || 0), 0);
  }, [installQuantities]);

  // Manual Draft Handlers for Field App
  const handleSaveDraft = (type) => {
    try {
      const nowStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
      if (type === 'gate_out') {
        const data = { selectedWoId, itemQuantities, selectedVehicleId, manualPlate, timestamp: nowStr };
        localStorage.setItem('mosa_draft_gate_out', JSON.stringify(data));
        setDraftSavedAt((prev) => ({ ...prev, gate_out: nowStr }));
        playBeep(900, 0.1);
        showToast(`💾 Draf muatan tersimpan (${nowStr})`, 'success');
      } else if (type === 'gate_in') {
        const data = { selectedWoId, itemQuantities, returnCondition, timestamp: nowStr };
        localStorage.setItem('mosa_draft_gate_in', JSON.stringify(data));
        setDraftSavedAt((prev) => ({ ...prev, gate_in: nowStr }));
        playBeep(900, 0.1);
        showToast(`💾 Draf retur tersimpan (${nowStr})`, 'success');
      } else if (type === 'install') {
        const data = { selectedWoId, installQuantities, locationNotes, timestamp: nowStr };
        localStorage.setItem('mosa_draft_install', JSON.stringify(data));
        setDraftSavedAt((prev) => ({ ...prev, install: nowStr }));
        playBeep(900, 0.1);
        showToast(`💾 Draf instalasi tersimpan (${nowStr})`, 'success');
      }
    } catch (e) {
      showToast('Gagal menyimpan draf: ' + e.message, 'error');
    }
  };

  const handleLoadDraft = (type) => {
    try {
      if (type === 'gate_out') {
        const raw = localStorage.getItem('mosa_draft_gate_out');
        if (!raw) return showToast('Belum ada draf muatan yang tersimpan.', 'info');
        const data = JSON.parse(raw);
        if (data.selectedWoId) setSelectedWoId(data.selectedWoId);
        if (data.itemQuantities) setItemQuantities(data.itemQuantities);
        if (data.selectedVehicleId) setSelectedVehicleId(data.selectedVehicleId);
        if (data.manualPlate) setManualPlate(data.manualPlate);
        playBeep(900, 0.1);
        showToast(`📂 Draf muatan (${data.timestamp}) berhasil dimuat!`, 'success');
      } else if (type === 'gate_in') {
        const raw = localStorage.getItem('mosa_draft_gate_in');
        if (!raw) return showToast('Belum ada draf retur yang tersimpan.', 'info');
        const data = JSON.parse(raw);
        if (data.selectedWoId) setSelectedWoId(data.selectedWoId);
        if (data.itemQuantities) setItemQuantities(data.itemQuantities);
        if (data.returnCondition) setReturnCondition(data.returnCondition);
        playBeep(900, 0.1);
        showToast(`📂 Draf retur (${data.timestamp}) berhasil dimuat!`, 'success');
      } else if (type === 'install') {
        const raw = localStorage.getItem('mosa_draft_install');
        if (!raw) return showToast('Belum ada draf instalasi yang tersimpan.', 'info');
        const data = JSON.parse(raw);
        if (data.selectedWoId) setSelectedWoId(data.selectedWoId);
        if (data.installQuantities) setInstallQuantities(data.installQuantities);
        if (data.locationNotes) setLocationNotes(data.locationNotes);
        playBeep(900, 0.1);
        showToast(`📂 Draf instalasi (${data.timestamp}) berhasil dimuat!`, 'success');
      }
    } catch (e) {
      showToast('Gagal memuat draf: ' + e.message, 'error');
    }
  };

  const handleClearDraft = (type) => {
    if (type === 'gate_out') {
      localStorage.removeItem('mosa_draft_gate_out');
      setDraftSavedAt((prev) => ({ ...prev, gate_out: null }));
      showToast('Draf muatan dibersihkan.', 'info');
    } else if (type === 'gate_in') {
      localStorage.removeItem('mosa_draft_gate_in');
      setDraftSavedAt((prev) => ({ ...prev, gate_in: null }));
      showToast('Draf retur dibersihkan.', 'info');
    } else if (type === 'install') {
      localStorage.removeItem('mosa_draft_install');
      setDraftSavedAt((prev) => ({ ...prev, install: null }));
      showToast('Draf instalasi dibersihkan.', 'info');
    }
  };

  // 1. Action: Minta Izin Bawa Barang Keluar (Multi-Item)
  const handleRequestGateOut = async () => {
    if (!selectedWo) {
      showToast('Pilih nama proyek/WO terlebih dahulu.', 'warning');
      return;
    }

    // Pre-flight check: Validasi batas kuota BOQ di sisi client agar tidak kena alert error
    if (hasQuotaViolation) {
      const v = quotaViolations[0];
      playBeep(400, 0.4);
      showToast(
        `❌ Permintaan melebihi sisa kuota: ${v.item_name} diminta ${v.requested} ${v.unit} (sisa kuota: ${v.remQuota} ${v.unit}). Silakan sesuaikan kuantiti!`,
        'error'
      );
      return;
    }

    const itemsPayload = Object.entries(itemQuantities)
      .filter(([_, qty]) => Number(qty) > 0)
      .map(([itemId, qty]) => ({
        item_id: parseInt(itemId, 10),
        requested_qty: Number(qty),
      }));

    if (itemsPayload.length === 0) {
      showToast('Tentukan jumlah minimal 1 material yang akan dimuat ke truk.', 'warning');
      return;
    }

    setLoading(true);
    try {
      const res = await gateApi.requestGateSession({
        work_order_id: selectedWo.id,
        warehouse_id: selectedWo.warehouse_id || 1,
        vehicle_id: selectedVehicleId ? parseInt(selectedVehicleId, 10) : null,
        plate_number_snapshot: manualPlate || null,
        type: 'OUT_FULFILLMENT',
        items: itemsPayload,
        notes: `Permintaan keluar via PWA Lapangan (${currentUser?.name})`,
      });

      const tx = res.data.gate_transaction;
      playBeep(1000, 0.3);
      setGateStatus({
        unlocked: true,
        transactionId: tx.id,
        sessionNum: tx.transaction_number,
        status: tx.status,
        message: 'IZIN DISETUJUI! Silakan bawa material melintasi portal sensor.',
        totalItems: totalRequestedItems,
        warehouseId: tx.warehouse_id || selectedWo.warehouse_id || 1,
        items: tx.items,
      });
      setLiveGateFeed({ state: 'IDLE', detectedCount: 0, lastEvent: null, tags: [], lastCheckAt: null });
      showToast('Izin disetujui! Silakan bawa material melewati reader RFID.', 'success');
    } catch (err) {
      playBeep(400, 0.4);
      showToast('Gagal minta izin: ' + (err.response?.data?.message || err.message), 'error');
    } finally {
      setLoading(false);
    }
  };

  // 2. Action: Laporkan Barang Sisa (Retur Multi-Item)
  const handleRequestReturn = async () => {
    if (!selectedWo) return;

    const returnItemsPayload = Object.entries(itemQuantities)
      .filter(([_, qty]) => Number(qty) > 0)
      .map(([itemId, qty]) => ({
        item_id: parseInt(itemId, 10),
        quantity: Number(qty),
        condition: returnCondition,
      }));

    if (returnItemsPayload.length === 0) {
      showToast('Tentukan jumlah minimal 1 material yang akan dikembalikan.', 'warning');
      return;
    }

    setLoading(true);
    try {
      const res = await returnApi.requestReturn({
        work_order_id: selectedWo.id,
        warehouse_id: selectedWo.warehouse_id || 1,
        items: returnItemsPayload,
        notes: `Pengembalian barang sisa oleh ${currentUser?.name}`,
      });

      playBeep(900, 0.25);
      showToast(`Laporan Retur #${res.data.transaction.transaction_number} terkirim! Bawa material melintasi portal.`, 'success');
      setActiveTab('menu');
      setGateStatus(null);
    } catch (err) {
      playBeep(400, 0.4);
      showToast('Gagal lapor retur: ' + (err.response?.data?.message || err.message), 'error');
    } finally {
      setLoading(false);
    }
  };

  // 3. Action: Lapor Pemasangan Material di Lapangan (Installed Qty)
  const handleReportInstalled = async () => {
    if (!selectedWo) {
      showToast('Pilih nama proyek/WO terlebih dahulu.', 'warning');
      return;
    }

    const itemsPayload = Object.entries(installQuantities)
      .filter(([_, qty]) => Number(qty) > 0)
      .map(([itemId, qty]) => ({
        item_id: parseInt(itemId, 10),
        installed_qty: Number(qty),
      }));

    if (itemsPayload.length === 0) {
      showToast('Tentukan jumlah minimal 1 material yang sudah terpasang di lapangan.', 'warning');
      return;
    }

    setLoading(true);
    try {
      await workOrderApi.reportInstalled(selectedWo.id, {
        installed_items: itemsPayload,
        location_notes: locationNotes,
        notes: installNotes,
      });

      playBeep(1200, 0.3);
      showToast('Laporan pemasangan material lapangan berhasil dicatat!', 'success');
      setActiveTab('menu');
      setLocationNotes('');
      setInstallNotes('');
      workOrderApi.getWorkOrders().then((res) => {
        const activeWos = res.data.filter((w) => ['approved', 'in_progress'].includes(w.status));
        setWorkOrders(activeWos);
      });
    } catch (err) {
      playBeep(400, 0.4);
      showToast('Gagal kirim laporan instalasi: ' + (err.response?.data?.message || err.message), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto min-h-[85vh] flex flex-col justify-between space-y-4">
      {/* Top Header Card: High Contrast */}
      <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-md border-b-4 border-emerald-500">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center font-black">
              <Radio className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="text-sm font-black tracking-tight">MOSA LAPANGAN</div>
              <div className="text-[11px] text-emerald-400 font-bold">Mandor: {currentUser?.name || 'Agus Pratama'}</div>
            </div>
          </div>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 rounded-xl text-xs flex items-center gap-1 font-bold ${
              soundEnabled ? 'bg-emerald-800/80 text-emerald-300' : 'bg-slate-800 text-slate-500'
            }`}
          >
            <Volume2 className="w-4 h-4" />
            {soundEnabled ? 'Suara ON' : 'Mute'}
          </button>
        </div>
      </div>

      {/* Main Body Switcher */}
      <div className="flex-1 space-y-4">
        {/* TAB 1: MENU UTAMA (3 Tombol Pilihan Raksasa) */}
        {activeTab === 'menu' && (
          <div className="space-y-3 pt-2">
            <div className="text-center font-bold text-slate-700 text-sm mb-1">
              Pilih Pekerjaan Anda Hari Ini:
            </div>

            {/* Tombol 1: Bawa Barang Keluar */}
            <button
              onClick={() => {
                playBeep(700, 0.1);
                setActiveTab('gate_out');
              }}
              className="w-full p-5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-2xl shadow-lg active:scale-[0.98] transition flex items-center justify-between border-2 border-emerald-400"
            >
              <div className="flex items-center gap-4 text-left">
                <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
                  <LogOut className="w-8 h-8 text-white rotate-180" />
                </div>
                <div>
                  <div className="text-lg font-black leading-tight">1. PENGELUARAN MATERIAL (MUAT TRUK)</div>
                  <div className="text-xs text-emerald-100 font-medium mt-0.5">Bawa tiang, kabel & aksesoris lewat portal sensor</div>
                </div>
              </div>
              <ArrowRight className="w-6 h-6 text-emerald-200" />
            </button>

            {/* Tombol 2: Kembalikan Barang Sisa */}
            <button
              onClick={() => {
                playBeep(700, 0.1);
                setActiveTab('gate_in');
              }}
              className="w-full p-5 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white rounded-2xl shadow-lg active:scale-[0.98] transition flex items-center justify-between border-2 border-blue-400"
            >
              <div className="flex items-center gap-4 text-left">
                <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
                  <RotateCcw className="w-8 h-8 text-white" />
                </div>
                <div>
                  <div className="text-lg font-black leading-tight">2. PENGEMBALIAN / RETUR SISA</div>
                  <div className="text-xs text-blue-100 font-medium mt-0.5">Kembalikan sisa material proyek ke gudang</div>
                </div>
              </div>
              <ArrowRight className="w-6 h-6 text-blue-200" />
            </button>

            {/* Tombol 3: Scan Cek Tag RFID */}
            {/* Tombol 3: Lapor Pemasangan Material di Lapangan */}
            <button
              onClick={() => {
                playBeep(700, 0.1);
                setActiveTab('install_report');
              }}
              className="w-full p-5 bg-gradient-to-r from-purple-600 to-indigo-700 hover:from-purple-700 hover:to-indigo-800 text-white rounded-2xl shadow-lg active:scale-[0.98] transition flex items-center justify-between border-2 border-purple-400"
            >
              <div className="flex items-center gap-4 text-left">
                <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
                  <Wrench className="w-8 h-8 text-white" />
                </div>
                <div>
                  <div className="text-lg font-black leading-tight">3. LAPORAN PEMASANGAN (INSTALASI)</div>
                  <div className="text-xs text-purple-100 font-medium mt-0.5">Laporkan jumlah material yang sudah terpasang di titik</div>
                </div>
              </div>
              <ArrowRight className="w-6 h-6 text-purple-200" />
            </button>

            {/* Tombol 4: Scan Cek Tag RFID */}
            <button
              onClick={() => {
                playBeep(700, 0.1);
                setActiveTab('scanner');
              }}
              className="w-full p-4 bg-white hover:bg-slate-50 text-slate-800 rounded-2xl shadow border-2 border-slate-300 active:scale-[0.98] transition flex items-center justify-between"
            >
              <div className="flex items-center gap-3 text-left">
                <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0 text-slate-700">
                  <Scan className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900">4. SCANNER HANDHELD / CEK TAG</div>
                  <div className="text-[11px] text-slate-500 font-medium">Tes pembacaan tag di HP / Handheld Reader</div>
                </div>
              </div>
              <span className="text-xs font-mono font-bold bg-slate-100 text-slate-700 px-2 py-1 rounded">
                {scannedTags.length} Terbaca
              </span>
            </button>
          </div>
        )}

        {/* TAB 2: FORM PENGELUARAN MATERIAL (MULTI-ITEM) */}
        {activeTab === 'gate_out' && (
          <div className="bg-white rounded-2xl p-5 border-2 border-slate-200 shadow-md space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <div>
                <span className="font-black text-sm text-emerald-800 flex items-center gap-1.5">
                  <LogOut className="w-4 h-4 rotate-180" />
                  Pengeluaran Material (Portal Pintu Keluar)
                </span>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Sensor portal RFID akan mencocokkan muatan truk dengan daftar di bawah ini.
                </p>
              </div>
              <button
                onClick={() => setActiveTab('menu')}
                className="text-xs text-slate-500 font-bold px-2 py-1 bg-slate-100 rounded-lg hover:bg-slate-200"
              >
                Kembali
              </button>
            </div>

            {/* Manual Draft Action Bar */}
            <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>{draftSavedAt.gate_out ? `Draf: ${draftSavedAt.gate_out}` : 'Draf: Kosong'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSaveDraft('gate_out')}
                  className="px-2.5 py-1 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm active:scale-95 transition"
                >
                  <Save className="w-3.5 h-3.5" />
                  Simpan Draf
                </button>
                {draftSavedAt.gate_out && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleLoadDraft('gate_out')}
                      className="px-2.5 py-1 bg-white hover:bg-blue-50 text-blue-700 border border-blue-300 rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm active:scale-95 transition"
                    >
                      <FolderDown className="w-3.5 h-3.5" />
                      Muat
                    </button>
                    <button
                      type="button"
                      onClick={() => handleClearDraft('gate_out')}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded-lg"
                      title="Hapus Draf"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Step 1: Pilih Proyek */}
            <div>
              <label className="block text-xs font-black text-slate-800 mb-1">
                1. Lokasi Proyek / Work Order:
              </label>
              <select
                value={selectedWoId}
                onChange={(e) => setSelectedWoId(e.target.value)}
                className="w-full p-3 border-2 border-slate-300 rounded-xl font-bold text-xs text-slate-800 bg-slate-50 focus:border-emerald-600 focus:outline-none"
              >
                {workOrders.map((wo) => {
                  const bItems = wo.boq_items || wo.boqItems || [];
                  const totalRemaining = bItems.reduce((acc, b) => acc + Math.max(0, (b.quota_qty || 0) - (b.withdrawn_qty || 0) + (b.returned_qty || 0)), 0);
                  const isExhausted = bItems.length > 0 && totalRemaining === 0;
                  return (
                    <option key={wo.id} value={wo.id} disabled={isExhausted}>
                      {wo.wo_number}: {wo.title} {isExhausted ? '(✓ Kuota BOQ Habis / 100% Selesai)' : `(Sisa Kuota: ${totalRemaining} unit)`}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Warning if selected WO has exhausted quota */}
            {selectedWo && (() => {
              const bItems = selectedWo.boq_items || selectedWo.boqItems || [];
              const totalRemaining = bItems.reduce((acc, b) => acc + Math.max(0, (b.quota_qty || 0) - (b.withdrawn_qty || 0) + (b.returned_qty || 0)), 0);
              if (bItems.length > 0 && totalRemaining === 0) {
                return (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div>
                      <strong className="block font-bold">Seluruh Kuota Material WO Ini Telah Selesai Ditarik</strong>
                      <span className="text-[11px]">Sisa kuota penarikan BOQ adalah 0 unit. Izin barang keluar tidak dapat diajukan lagi untuk WO ini.</span>
                    </div>
                  </div>
                );
              }
              return null;
            })()}

            {/* Step 2: Tentukan Jumlah Tiap Material (Multi-Item List) */}
            <div>
              <div className="flex flex-wrap justify-between items-center gap-1.5 mb-2">
                <div>
                  <label className="text-xs font-black text-slate-800 block">
                    2. Rincian Material yang Dimuat ke Truk:
                  </label>
                  <span className="text-[10px] text-slate-500">
                    Otomatis terisi dari kuantiti fisik yang disiapkan Storeroom.
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleSyncWithPrepared}
                    className="px-2 py-0.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-[10px] font-bold rounded-md flex items-center gap-1 transition active:scale-95 shadow-xs"
                    title="Reset ke kuantiti yang disiapkan gudang"
                  >
                    <Sparkles className="w-3 h-3 text-emerald-600" />
                    <span>Sinkron Disiapkan</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleResetQuantitiesToZero}
                    className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold rounded-md transition"
                    title="Reset semua ke 0"
                  >
                    Reset 0
                  </button>
                  <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Total: {totalRequestedItems} unit
                  </span>
                </div>
              </div>

              <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
                {selectedWo?.boq_items?.map((b) => {
                  const quota = Number(b.quota_qty || 0);
                  const withdrawn = Number(b.withdrawn_qty || 0);
                  const returned = Number(b.returned_qty || 0);
                  const prepared = Number(b.prepared_qty || 0);
                  const rem = Math.max(0, quota - withdrawn + returned);
                  const readyPrepared = Math.max(0, prepared - withdrawn);
                  const curQty = itemQuantities[b.item_id] || 0;
                  const isExceeded = curQty > rem;
                  const isMatchPrepared = prepared > 0 && curQty === readyPrepared && !isExceeded;

                  return (
                    <div
                      key={b.item_id}
                      className={`p-3.5 rounded-2xl border-2 transition space-y-2.5 ${
                        isExceeded
                          ? 'bg-rose-50/90 border-rose-500 shadow-xs'
                          : curQty > 0
                          ? 'bg-emerald-50/70 border-emerald-400'
                          : rem === 0
                          ? 'bg-slate-100/80 border-slate-200 opacity-70'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      {/* Header Item & Status */}
                      <div className="flex justify-between items-start gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                              {b.item?.code || `ID#${b.item_id}`}
                            </span>
                            <span className="text-xs font-black text-slate-900">{b.item?.name}</span>
                          </div>

                          {/* Detail Informasi Kuota & Staging */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 text-[11px] text-slate-600 pt-0.5">
                            <span className="flex items-center gap-1">
                              📦 Staging: <strong className={readyPrepared > 0 ? 'text-emerald-700 font-bold' : 'text-slate-500'}>{readyPrepared} {b.item?.unit}</strong>
                            </span>
                            <span className="flex items-center gap-1">
                              📊 Sisa Kuota: <strong className={rem === 0 ? 'text-rose-600 font-bold' : 'text-slate-800 font-bold'}>{rem} {b.item?.unit}</strong>
                            </span>
                            <span className="text-slate-400 col-span-2 sm:col-span-1">
                              Total BOQ: {quota} (Keluar: {withdrawn})
                            </span>
                          </div>
                        </div>

                        {/* Badges */}
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {isExceeded ? (
                            <button
                              type="button"
                              onClick={() => {
                                playBeep(880, 0.08);
                                setItemQty(b.item_id, rem);
                              }}
                              className="px-2 py-0.5 bg-rose-600 hover:bg-rose-700 text-white rounded font-black text-[10px] animate-pulse flex items-center gap-1 shadow-xs"
                              title="Klik untuk turunkan ke batas sisa kuota"
                            >
                              <AlertTriangle className="w-3 h-3" />
                              <span>LEBIH +{curQty - rem} (KLIK SESUAIKAN)</span>
                            </button>
                          ) : curQty > 0 ? (
                            <span className="px-2 py-0.5 bg-emerald-200 text-emerald-900 rounded font-black text-[10px]">
                              {curQty} {b.item?.unit} DIMUAT
                            </span>
                          ) : rem === 0 ? (
                            <span className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded font-bold text-[10px]">
                              KUOTA HABIS
                            </span>
                          ) : null}

                          {readyPrepared >= rem && rem > 0 ? (
                            <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded border border-emerald-300">
                              ✓ Siap di Staging Bay
                            </span>
                          ) : readyPrepared > 0 ? (
                            <span className="text-[9px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300">
                              Sebagian Siap ({readyPrepared}/{rem})
                            </span>
                          ) : (
                            <span className="text-[9px] font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                              Belum Disiapkan Gudang
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Scanned Tags Pill Preview (if any) */}
                      {(itemTags[b.item_id] || []).length > 0 && (
                        <div className="p-1.5 bg-emerald-100/60 border border-emerald-300 rounded-lg flex items-center justify-between text-[10px] text-emerald-900 font-mono">
                          <div className="flex items-center gap-1 truncate">
                            <Tag className="w-3 h-3 text-emerald-700 shrink-0" />
                            <strong className="font-bold">{(itemTags[b.item_id] || []).length} Tag Terverifikasi:</strong>
                            <span className="text-slate-600 truncate">
                              {(itemTags[b.item_id] || []).slice(0, 2).join(', ')}
                              {(itemTags[b.item_id] || []).length > 2 ? ` (+${(itemTags[b.item_id] || []).length - 2} lagi)` : ''}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setItemTags(prev => ({ ...prev, [b.item_id]: [] }));
                              setItemQty(b.item_id, 0);
                            }}
                            className="text-rose-600 hover:text-rose-800 text-[10px] font-bold ml-1"
                          >
                            Hapus
                          </button>
                        </div>
                      )}

                      {/* Stepper Input & Action Toolbar */}
                      <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                        <span className="text-xs font-bold text-slate-700">Kuantiti Muatan:</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              playBeep(600, 0.08);
                              setItemQty(b.item_id, curQty - 1);
                            }}
                            disabled={curQty === 0}
                            className="w-9 h-9 rounded-xl bg-white border-2 border-slate-300 active:bg-slate-100 disabled:opacity-30 text-slate-800 text-lg font-black flex items-center justify-center shadow-xs cursor-pointer"
                          >
                            <Minus className="w-4 h-4" />
                          </button>

                          <input
                            type="number"
                            min="0"
                            max={rem}
                            value={curQty}
                            disabled={rem === 0}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10) || 0;
                              setItemQty(b.item_id, Math.max(0, val));
                            }}
                            className={`w-14 h-9 text-center font-mono font-black text-base border-2 rounded-xl bg-white focus:outline-none ${
                              isExceeded
                                ? 'text-rose-700 border-rose-500 bg-rose-50 focus:border-rose-600'
                                : 'text-slate-900 border-slate-300 focus:border-emerald-500'
                            }`}
                          />

                          <button
                            type="button"
                            onClick={() => {
                              playBeep(800, 0.08);
                              setItemQty(b.item_id, curQty + 1);
                            }}
                            disabled={curQty >= rem || rem === 0}
                            className="w-9 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-lg font-black flex items-center justify-center shadow-xs disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Tombol Opsi Scan Ulang & Quick Presets */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setScanningItem({
                              itemId: b.item_id,
                              itemName: b.item?.name || `Material #${b.item_id}`,
                              unit: b.item?.unit || 'unit',
                              maxQty: rem,
                              readyPrepared,
                            });
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-sky-50 hover:bg-sky-100 active:scale-95 text-sky-800 border border-sky-300 rounded-lg text-xs font-bold transition shadow-2xs cursor-pointer"
                          title="Buka panel pemindaian / scan ulang untuk material ini"
                        >
                          <Scan className="w-3.5 h-3.5 text-sky-600" />
                          <span>🔄 Opsi / Scan Ulang</span>
                        </button>

                        {readyPrepared > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              playBeep(880, 0.08);
                              setItemQty(b.item_id, Math.min(rem, readyPrepared));
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition active:scale-95 cursor-pointer shadow-2xs"
                            title="Setel kuantiti pas sesuai barang di Staging Bay"
                          >
                            <Sparkles className="w-3 h-3 text-emerald-600" />
                            <span>Pas Disiapkan ({readyPrepared})</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            playBeep(500, 0.08);
                            setItemQty(b.item_id, 0);
                            setItemTags(prev => ({ ...prev, [b.item_id]: [] }));
                          }}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition cursor-pointer"
                          title="Kosongkan kuantiti material ini"
                        >
                          Reset 0
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Step 3: Pilih Armada Truk */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <label className="block text-xs font-black text-slate-800 flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-emerald-600" />
                <span>3. Armada Truk Pengangkut (Nomor Polisi):</span>
              </label>
              <select
                value={selectedVehicleId}
                onChange={(e) => {
                  setSelectedVehicleId(e.target.value);
                  const selectedV = vehicles.find((v) => v.id === parseInt(e.target.value, 10));
                  if (selectedV) setManualPlate(selectedV.plate_number);
                }}
                className="w-full p-2.5 border border-slate-300 rounded-xl font-bold text-xs bg-white text-slate-800"
              >
                <option value="">-- Truk Tidak Terdaftar (Input Manual) --</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plate_number}: {v.driver_name || 'Driver'} ({v.max_pole_capacity} Tiang)
                  </option>
                ))}
              </select>
              {!selectedVehicleId && (
                <input
                  type="text"
                  placeholder="Ketik Plat Nomor Truk Manual (e.g. B 9123 FO)"
                  value={manualPlate}
                  onChange={(e) => setManualPlate(e.target.value.toUpperCase())}
                  className="w-full p-2 border border-slate-300 rounded-xl font-mono font-bold text-xs"
                />
              )}
            </div>

            {/* Warning if any requested item exceeds remaining quota */}
            {hasQuotaViolation && (
              <div className="p-3.5 bg-rose-50 border-2 border-rose-400 rounded-xl space-y-2 text-rose-900 shadow-sm">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div className="flex-1 text-xs">
                    <strong className="font-black block text-rose-950">
                      Kuantiti Muat Melebihi Sisa Kuota BOQ:
                    </strong>
                    <ul className="list-disc list-inside mt-1 space-y-0.5 text-[11px] font-medium text-rose-800">
                      {quotaViolations.map((v) => (
                        <li key={v.item_id}>
                          <strong>{v.item_name}</strong>: Diminta {v.requested} {v.unit} (Sisa Kuota: {v.remQuota} {v.unit}) : <span className="font-bold text-rose-700">Kelebihan {v.exceededBy} {v.unit}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClampToRemainingQuota}
                  className="w-full py-2 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>⚡ Sesuaikan Otomatis ke Batas Kuota ({quotaViolations.length} Material)</span>
                </button>
              </div>
            )}

            {/* Action Button */}
            {(() => {
              const bItems = selectedWo?.boq_items || selectedWo?.boqItems || [];
              const totalRemaining = bItems.reduce((acc, b) => acc + Math.max(0, (b.quota_qty || 0) - (b.withdrawn_qty || 0) + (b.returned_qty || 0)), 0);
              const isExhausted = bItems.length > 0 && totalRemaining === 0;

              // Kondisi 1: Melebihi sisa kuota BOQ -> Tombol DILOCK dan BERWARNA MERAH (Tidak dapat diklik)
              if (hasQuotaViolation) {
                return (
                  <button
                    type="button"
                    disabled
                    className="w-full py-4 bg-rose-100 border-2 border-rose-400 text-rose-800 rounded-2xl font-black text-sm shadow-xs flex items-center justify-center gap-2 cursor-not-allowed select-none opacity-90"
                  >
                    <AlertTriangle className="w-5 h-5 text-rose-600" />
                    <span>KUOTA TERLAMPAUI ({quotaViolations[0].item_name}: +{quotaViolations[0].exceededBy} {quotaViolations[0].unit})</span>
                  </button>
                );
              }

              // Kondisi 2: Seluruh kuota WO sudah ditarik habis
              if (isExhausted) {
                return (
                  <button
                    type="button"
                    disabled
                    className="w-full py-4 bg-emerald-50 border-2 border-emerald-200 text-emerald-700 rounded-2xl font-black text-base shadow-xs flex items-center justify-center gap-2 cursor-not-allowed select-none"
                  >
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span>KUOTA WO INI TELAH LENGKAP (100% SELESAI)</span>
                  </button>
                );
              }

              // Kondisi 3: Normal
              return (
                <button
                  type="button"
                  onClick={handleRequestGateOut}
                  disabled={loading || totalRequestedItems === 0 || hasQuotaViolation}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] text-white rounded-2xl font-black text-base shadow-xl flex items-center justify-center gap-2 transition"
                >
                  <Unlock className="w-5 h-5" />
                  {loading ? 'Sedang Memeriksa Kuota...' : `AJUKAN IZIN KELUAR (${totalRequestedItems} UNIT)`}
                </button>
              );
            })()}

            {/* Status Live Sesi Pergerakan (Real-Time Sensor Telemetry) */}
            {gateStatus && (
              <div className="p-4 sm:p-5 bg-slate-900 border-2 border-emerald-500/70 rounded-2xl text-white shadow-xl space-y-3.5 animate-fade-in">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-3 w-3">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${
                        liveGateFeed.state === 'COMPLETED' ? 'bg-emerald-400' :
                        liveGateFeed.state === 'UNDERCOUNT' ? 'bg-amber-400' : 'bg-emerald-400'
                      } opacity-75`}></span>
                      <span className={`relative inline-flex rounded-full h-3 w-3 ${
                        liveGateFeed.state === 'COMPLETED' ? 'bg-emerald-500' :
                        liveGateFeed.state === 'UNDERCOUNT' ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}></span>
                    </span>
                    <span className="text-xs font-black uppercase tracking-wider text-emerald-400">
                      LIVE SENSOR PORTAL RFID
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-mono font-bold text-amber-300 bg-amber-950/70 border border-amber-800/60 px-2 py-0.5 rounded-md flex items-center gap-1" title="Batas waktu tidak aktif: 15 menit (otomatis diperpanjang setiap ada barang melintas)">
                      <Clock className="w-3 h-3 text-amber-400" />
                      <span>Idle: 15m</span>
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-300 bg-slate-800 px-2 py-0.5 rounded-md border border-slate-700">
                      Sesi #{gateStatus.sessionNum}
                    </span>
                  </div>
                </div>

                {/* Real-time Progress Bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs font-bold">
                    <span className="text-slate-300">Progres Pemindaian RFID:</span>
                    <span className={liveGateFeed.state === 'COMPLETED' ? 'text-emerald-400 font-mono text-sm' : 'text-amber-400 font-mono text-sm'}>
                      {liveGateFeed.detectedCount} / {gateStatus.totalItems} Unit Terdeteksi
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-3.5 overflow-hidden border border-slate-700 p-0.5">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        liveGateFeed.state === 'COMPLETED' ? 'bg-emerald-500 shadow-emerald-500/50 shadow-md' :
                        liveGateFeed.state === 'UNDERCOUNT' ? 'bg-amber-500 animate-pulse' : 'bg-emerald-600'
                      }`}
                      style={{ width: `${Math.min(100, Math.round((liveGateFeed.detectedCount / Math.max(1, gateStatus.totalItems)) * 100))}%` }}
                    />
                  </div>
                </div>

                {/* Live State Guidance */}
                {liveGateFeed.state === 'UNDERCOUNT' ? (
                  <div className="p-3 bg-amber-500/20 border border-amber-400/40 rounded-xl flex items-start gap-2 text-amber-200 text-xs animate-pulse">
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block text-amber-300 font-bold">MUATAN BELUM LENGKAP:</strong>
                      <span>Baru terdeteksi <strong>{liveGateFeed.detectedCount}</strong> dari <strong>{gateStatus.totalItems}</strong> unit. Silakan <strong>mundur 1 langkah lalu lewatkan kembali perlahan</strong> di depan reader RFID. Sesi izin tetap AKTIF!</span>
                    </div>
                  </div>
                ) : liveGateFeed.state === 'COMPLETED' ? (
                  <div className="p-3 bg-emerald-500/20 border border-emerald-400/40 rounded-xl flex items-start gap-2 text-emerald-200 text-xs">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block text-emerald-300 font-bold">PERLINTASAN SELESAI & TERVERIFIKASI!</strong>
                      <span>Seluruh {gateStatus.totalItems} unit material telah sukses diverifikasi reader RFID. Stok BOQ otomatis terpotong sah.</span>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-800/80 border border-slate-700 rounded-xl flex items-start gap-2 text-slate-300 text-xs">
                    <Radio className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5 animate-pulse" />
                    <div>
                      <strong className="block text-white font-bold">Menunggu Material Melewati Titik Pemeriksaan RFID:</strong>
                      <span>Bawa muatan material melewati reader RFID untuk verifikasi kuantitas.</span>
                    </div>
                  </div>
                )}

                {/* Scanned tags preview at gate */}
                {liveGateFeed.tags.length > 0 && (
                  <div className="p-2 bg-slate-950 rounded-xl border border-slate-800 text-[11px] font-mono space-y-1">
                    <div className="flex justify-between text-slate-400 text-[10px]">
                      <span>Tag RFID Terbaca ({liveGateFeed.tags.length}):</span>
                      <span>{liveGateFeed.lastCheckAt || 'Live'}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                      {liveGateFeed.tags.map((epc, idx) => (
                        <span key={epc} className="px-1.5 py-0.5 bg-slate-800 text-emerald-300 rounded text-[10px] border border-slate-700">
                          #{idx + 1} {epc}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Activity className="w-3 h-3 text-emerald-400 animate-pulse" />
                    <span>{liveGateFeed.lastCheckAt ? `Update: ${liveGateFeed.lastCheckAt}` : 'Memantau sinyal reader...'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {liveGateFeed.state === 'COMPLETED' ? (
                      <button
                        type="button"
                        onClick={() => {
                          setGateStatus(null);
                          setLiveGateFeed({ state: 'IDLE', detectedCount: 0, lastEvent: null, tags: [], lastCheckAt: null });
                          showToast('Sesi selesai. Anda dapat mengajukan izin keluar baru.', 'info');
                        }}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition shadow-xs cursor-pointer"
                      >
                        ✓ Selesai & Buka Pengajuan Baru
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!window.confirm(`Yakin ingin membatalkan Sesi Izin #${gateStatus.sessionNum}? Pergerakan tidak akan disahkan dan Anda dapat mengajukan izin keluar baru.`)) {
                              return;
                            }
                            try {
                              setLoading(true);
                              await gateApi.cancelTransaction(gateStatus.transactionId, 'Dibatalkan oleh Mandor');
                              setGateStatus(null);
                              setLiveGateFeed({ state: 'IDLE', detectedCount: 0, lastEvent: null, tags: [], lastCheckAt: null });
                              showToast(`Sesi #${gateStatus.sessionNum} berhasil dibatalkan. Anda dapat mengajukan izin baru.`, 'info');
                            } catch (err) {
                              showToast('Gagal membatalkan sesi: ' + (err.response?.data?.message || err.message), 'error');
                            } finally {
                              setLoading(false);
                            }
                          }}
                          className="px-2.5 py-1.5 bg-rose-950/60 hover:bg-rose-900 border border-rose-700/60 text-rose-300 font-bold text-xs rounded-xl flex items-center gap-1 cursor-pointer transition"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                          <span>Batalkan Sesi</span>
                        </button>

                        {/* Tombol Sahkan Fisik Aktual — Solusi Handal untuk Lapangan (Barang Tertinggal / Bertahap) */}
                        {(liveGateFeed.state === 'UNDERCOUNT' || liveGateFeed.state === 'MISMATCH' || liveGateFeed.detectedCount > 0) && (
                          <button
                            type="button"
                            onClick={async () => {
                              const detectedSoFar = liveGateFeed.detectedCount || 0;
                              const totalRequested = gateStatus.totalItems || 0;
                              const confirmed = window.confirm(
                                `📋 SELESAIKAN PENGELUARAN FISIK AKTUAL\n\n` +
                                `Material Terdeteksi: ${detectedSoFar} dari ${totalRequested} unit.\n\n` +
                                `Gunakan fitur ini jika kondisi lapangan tidak ideal:\n` +
                                `• Barang dibawa bertahap / 1 per 1 dan sesi selesai\n` +
                                `• Ada barang tertinggal / batal dibawa (truk penuh)\n` +
                                `• Tag RFID sebagian tidak terbaca (interferensi logam)\n\n` +
                                `Sistem akan mengesahkan ${detectedSoFar} unit yang melintas, memotong kuota BOQ sesuai fisik aktual, dan menutup sesi pergerakan secara sah.\n\n` +
                                `Lanjutkan penyelesaian pengeluaran?`
                              );
                              if (!confirmed) return;
                              try {
                                setLoading(true);
                                const res = await gateApi.finalizePartial(gateStatus.transactionId, `Disahkan sesuai kondisi fisik aktual lapangan (${detectedSoFar}/${totalRequested} unit)`);
                                playBeep(1200, 0.4);
                                setGateStatus((prev) => ({
                                  ...prev,
                                  status: 'completed',
                                  message: `🎉 SELESAI DENGAN FISIK AKTUAL! ${res.data.total_passed || detectedSoFar} unit material disahkan melintas.`,
                                }));
                                setLiveGateFeed((prev) => ({
                                  ...prev,
                                  state: 'COMPLETED',
                                  detectedCount: res.data.total_passed || detectedSoFar,
                                }));
                                // Refresh WOs so BOQ updates
                                workOrderApi.getWorkOrders().then((woRes) => {
                                  const activeWos = (woRes.data || []).filter((w) =>
                                    ['approved', 'in_progress', 'ready_for_dispatch', 'partially_prepared'].includes(w.status)
                                  );
                                  setWorkOrders(activeWos);
                                });
                                showToast(`✅ Pengeluaran disahkan! ${res.data.total_passed || detectedSoFar} unit material resmi tercatat keluar.`, 'success');
                              } catch (err) {
                                showToast('Gagal menyelesaikan sesi: ' + (err.response?.data?.message || err.message), 'error');
                              } finally {
                                setLoading(false);
                              }
                            }}
                            disabled={loading}
                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 border border-amber-400 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition shadow-md active:scale-95 disabled:opacity-50"
                            title="Tutup sesi dan catat material yang aktual melintas ke BOQ dan Rantai Kepemilikan"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-amber-100" />
                            <span>Sahkan Fisik Aktual ({liveGateFeed.detectedCount}/{gateStatus.totalItems})</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const res = await gateApi.getLiveFeed(gateStatus.warehouseId || 1);
                              const ev = (res.data || []).find(e => e.gate_transaction_id === gateStatus.transactionId);
                              if (ev) {
                                setLiveGateFeed({
                                  state: ev.is_valid ? 'COMPLETED' : (ev.mismatch_details?.includes('MUATAN BELUM LENGKAP') ? 'UNDERCOUNT' : 'MISMATCH'),
                                  detectedCount: ev.total_tags_detected || 0,
                                  lastEvent: ev,
                                  tags: ev.tag_epcs_json || [],
                                  lastCheckAt: new Date().toLocaleTimeString('id-ID'),
                                });
                                showToast(`Pemeriksaan selesai: ${ev.total_tags_detected} tag terdeteksi.`, 'info');
                              } else {
                                showToast('Belum ada tag yang terdeteksi reader RFID.', 'info');
                              }
                            } catch (e) {
                              showToast('Gagal memeriksa status perlintasan', 'error');
                            }
                          }}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs rounded-xl flex items-center gap-1 cursor-pointer transition"
                        >
                          <RefreshCw className="w-3 h-3 text-emerald-400" />
                          <span>Cek Sensor Sekarang</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: FORM LAPORAN PEMASANGAN MATERIAL DI LAPANGAN */}
        {activeTab === 'install_report' && (
          <div className="bg-white rounded-2xl p-5 border-2 border-slate-200 shadow-md space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <div>
                <span className="font-black text-sm text-purple-800 flex items-center gap-1.5">
                  <Wrench className="w-4 h-4" />
                  Laporan Pemasangan Material Lapangan
                </span>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Laporkan jumlah material yang telah selesai terpasang di titik/jalur rollout.
                </p>
              </div>
              <button
                onClick={() => setActiveTab('menu')}
                className="text-xs text-slate-500 font-bold px-2 py-1 bg-slate-100 rounded-lg hover:bg-slate-200"
              >
                Kembali
              </button>
            </div>

            {/* Manual Draft Action Bar */}
            <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>{draftSavedAt.install ? `Draf: ${draftSavedAt.install}` : 'Draf: Kosong'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSaveDraft('install')}
                  className="px-2.5 py-1 bg-white hover:bg-purple-50 text-purple-700 border border-purple-300 rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm active:scale-95 transition"
                >
                  <Save className="w-3.5 h-3.5" />
                  Simpan Draf
                </button>
                {draftSavedAt.install && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleLoadDraft('install')}
                      className="px-2.5 py-1 bg-white hover:bg-blue-50 text-blue-700 border border-blue-300 rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm active:scale-95 transition"
                    >
                      <FolderDown className="w-3.5 h-3.5" />
                      Muat
                    </button>
                    <button
                      type="button"
                      onClick={() => handleClearDraft('install')}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded-lg"
                      title="Hapus Draf"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Step 1: Pilih Proyek/WO */}
            <div>
              <label className="block text-xs font-black text-slate-800 mb-1">
                1. Lokasi Proyek / Work Order:
              </label>
              <select
                value={selectedWoId}
                onChange={(e) => setSelectedWoId(e.target.value)}
                className="w-full p-3 border-2 border-slate-300 rounded-xl font-bold text-xs text-slate-800 bg-slate-50 focus:border-purple-600 focus:outline-none"
              >
                {workOrders.map((wo) => (
                  <option key={wo.id} value={wo.id}>
                    {wo.wo_number}: {wo.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Step 2: Rincian Material yang Terpasang */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-black text-slate-800">
                  2. Material Selesai Terpasang Hari Ini:
                </label>
                <span className="text-[11px] font-bold text-purple-800 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                  Total Terpasang: {totalInstalledItems} unit
                </span>
              </div>

              <div className="space-y-2.5 max-h-[250px] overflow-y-auto pr-1">
                {selectedWo?.boq_items?.map((b) => {
                  const curQty = installQuantities[b.item_id] || 0;
                  return (
                    <div
                      key={b.item_id}
                      className={`p-3 rounded-xl border-2 transition ${
                        curQty > 0
                          ? 'bg-purple-50/70 border-purple-400'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="text-xs font-black text-slate-900">{b.item?.name}</div>
                          <div className="text-[11px] text-slate-500">
                            Sudah Terpasang: <span className="font-bold text-purple-700">{b.installed_qty || 0}</span> / Ditarik: {b.withdrawn_qty} {b.item?.unit}
                          </div>
                        </div>
                        {curQty > 0 && (
                          <span className="px-2 py-0.5 bg-purple-200 text-purple-900 rounded font-black text-[10px]">
                            {curQty} {b.item?.unit} DILAPORKAN
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-xs font-bold text-slate-600">Jumlah Terpasang:</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              playBeep(600, 0.08);
                              setInstallQty(b.item_id, Math.max(0, curQty - 1));
                            }}
                            disabled={curQty === 0}
                            className="w-10 h-10 rounded-xl bg-white border-2 border-slate-300 active:bg-slate-100 disabled:opacity-30 text-slate-800 text-lg font-black flex items-center justify-center shadow-sm"
                          >
                            <Minus className="w-5 h-5" />
                          </button>

                          <input
                            type="number"
                            min="0"
                            value={curQty}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10) || 0;
                              setInstallQty(b.item_id, Math.max(0, val));
                            }}
                            className="w-16 h-10 text-center font-mono font-black text-lg text-slate-900 border-2 border-slate-300 rounded-xl bg-white focus:border-purple-500 focus:outline-none"
                          />

                          <button
                            type="button"
                            onClick={() => {
                              playBeep(800, 0.08);
                              setInstallQty(b.item_id, curQty + 1);
                            }}
                            className="w-10 h-10 rounded-xl bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white text-lg font-black flex items-center justify-center shadow-sm"
                          >
                            <Plus className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Step 3: Catatan Lokasi / Titik */}
            <div>
              <label className="block text-xs font-black text-slate-800 mb-1 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-purple-600" />
                <span>3. Lokasi Titik Pemasangan (Nama Jalan / Segmen):</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Jl. Raya Tajur KM 5 Titik Pole #10 - #25"
                value={locationNotes}
                onChange={(e) => setLocationNotes(e.target.value)}
                className="w-full p-2.5 border-2 border-slate-300 rounded-xl font-semibold text-xs text-slate-800 focus:border-purple-500 focus:outline-none"
              />
            </div>

            {/* Action Button */}
            <button
              onClick={handleReportInstalled}
              disabled={loading || totalInstalledItems === 0}
              className="w-full py-4 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 active:scale-[0.98] text-white rounded-2xl font-black text-base shadow-xl flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Wrench className="w-5 h-5" />
              {loading ? 'Mengirim Laporan...' : `KIRIM LAPORAN PEMASANGAN (${totalInstalledItems} UNIT)`}
            </button>
          </div>
        )}

        {/* TAB 4: FORM KEMBALIKAN BARANG SISA (RETUR MULTI-ITEM) */}
        {activeTab === 'gate_in' && (
          <div className="bg-white rounded-2xl p-5 border-2 border-slate-200 shadow-md space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <div>
                <span className="font-black text-sm text-blue-800 flex items-center gap-1.5">
                  <RotateCcw className="w-4 h-4" />
                  Pengembalian Material Sisa (Portal Pintu Masuk)
                </span>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Daftarkan sisa material proyek yang dikembalikan ke dalam gudang.
                </p>
              </div>
              <button
                onClick={() => setActiveTab('menu')}
                className="text-xs text-slate-500 font-bold px-2 py-1 bg-slate-100 rounded-lg"
              >
                Kembali
              </button>
            </div>

            {/* Manual Draft Action Bar */}
            <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>{draftSavedAt.gate_in ? `Draf: ${draftSavedAt.gate_in}` : 'Draf: Kosong'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSaveDraft('gate_in')}
                  className="px-2.5 py-1 bg-white hover:bg-blue-50 text-blue-700 border border-blue-300 rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm active:scale-95 transition"
                >
                  <Save className="w-3.5 h-3.5" />
                  Simpan Draf
                </button>
                {draftSavedAt.gate_in && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleLoadDraft('gate_in')}
                      className="px-2.5 py-1 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm active:scale-95 transition"
                    >
                      <FolderDown className="w-3.5 h-3.5" />
                      Muat
                    </button>
                    <button
                      type="button"
                      onClick={() => handleClearDraft('gate_in')}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded-lg"
                      title="Hapus Draf"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-800 mb-1">1. Lokasi Proyek / Work Order:</label>
              <select
                value={selectedWoId}
                onChange={(e) => setSelectedWoId(e.target.value)}
                className="w-full p-3 border-2 border-slate-300 rounded-xl font-bold text-xs bg-slate-50"
              >
                {workOrders.map((wo) => (
                  <option key={wo.id} value={wo.id}>{wo.wo_number}: {wo.title}</option>
                ))}
              </select>
            </div>

            {/* Rincian Barang yang Dibalikkan */}
            <div>
              <div className="flex flex-wrap justify-between items-center gap-1.5 mb-2">
                <div>
                  <label className="text-xs font-black text-slate-800 block">
                    2. Rincian Material yang Dikembalikan:
                  </label>
                  <span className="text-[10px] text-slate-500">
                    Sisa material proyek di lapangan yang dikembalikan ke gudang.
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleSyncWithFieldRemainder}
                    className="px-2 py-0.5 bg-blue-100 hover:bg-blue-200 text-blue-800 text-[10px] font-bold rounded-md flex items-center gap-1 transition active:scale-95 shadow-xs"
                    title="Isi sesuai sisa material di lapangan yang belum terpasang"
                  >
                    <Sparkles className="w-3 h-3 text-blue-600" />
                    <span>Sinkron Sisa Lapangan</span>
                  </button>
                  <span className="text-[11px] font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    Total: {totalRequestedItems} unit
                  </span>
                </div>
              </div>

              <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
                {selectedWo?.boq_items?.map((b) => {
                  const withdrawn = Number(b.withdrawn_qty || 0);
                  const returned = Number(b.returned_qty || 0);
                  const installed = Number(b.installed_qty || 0);
                  const inField = Math.max(0, withdrawn - installed - returned);
                  const curQty = itemQuantities[b.item_id] || 0;
                  return (
                    <div
                      key={b.item_id}
                      className={`p-3 rounded-xl border-2 transition ${
                        curQty > 0 ? 'bg-blue-50/70 border-blue-400' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="text-xs font-black text-slate-900">{b.item?.name}</div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            <button
                              type="button"
                              onClick={() => {
                                playBeep(880, 0.08);
                                setItemQty(b.item_id, inField);
                              }}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded font-bold text-[10px] transition active:scale-95 border border-blue-300"
                              title="Klik untuk isi seluruh sisa material di lapangan"
                            >
                              🏗️ Sisa Lapangan: <strong>{inField}</strong> {b.item?.unit}
                            </button>
                            <span className="text-[10px] text-slate-400">
                              (Ditarik: {withdrawn} | Pasang: {installed})
                            </span>
                          </div>
                        </div>
                        {curQty > 0 && (
                          <span className="px-2 py-0.5 bg-blue-200 text-blue-900 rounded font-black text-[10px]">
                            {curQty} {b.item?.unit}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-xs font-bold text-slate-600">Jumlah Retur:</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              playBeep(600, 0.08);
                              setItemQty(b.item_id, curQty - 1);
                            }}
                            disabled={curQty === 0}
                            className="w-10 h-10 rounded-xl bg-white border-2 border-slate-300 active:bg-slate-100 text-slate-800 text-lg font-black flex items-center justify-center shadow-sm"
                          >
                            <Minus className="w-5 h-5" />
                          </button>

                          <input
                            type="number"
                            min="0"
                            value={curQty}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10) || 0;
                              setItemQty(b.item_id, Math.max(0, val));
                            }}
                            className="w-16 h-10 text-center font-mono font-black text-lg text-slate-900 border-2 border-slate-300 rounded-xl bg-white"
                          />

                          <button
                            type="button"
                            onClick={() => {
                              playBeep(800, 0.08);
                              setItemQty(b.item_id, curQty + 1);
                            }}
                            className="w-10 h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-lg font-black flex items-center justify-center shadow-sm"
                          >
                            <Plus className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-800 mb-1">3. Kondisi Fisik Barang:</label>
              <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setReturnCondition('good')}
                  className={`p-3 rounded-xl border-2 transition ${
                    returnCondition === 'good'
                      ? 'bg-blue-50 border-blue-600 text-blue-900'
                      : 'border-slate-200 text-slate-600 bg-slate-50'
                  }`}
                >
                  ✅ Masih Bagus / Utuh
                </button>
                <button
                  type="button"
                  onClick={() => setReturnCondition('damaged')}
                  className={`p-3 rounded-xl border-2 transition ${
                    returnCondition === 'damaged'
                      ? 'bg-rose-50 border-rose-600 text-rose-900'
                      : 'border-slate-200 text-slate-600 bg-slate-50'
                  }`}
                >
                  ⚠️ Rusak / Bengkok
                </button>
              </div>
            </div>

            <button
              onClick={handleRequestReturn}
              disabled={loading || totalRequestedItems === 0}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 active:scale-[0.98] text-white rounded-2xl font-black text-base shadow-xl flex items-center justify-center gap-2 transition"
            >
              <RotateCcw className="w-5 h-5" />
              {loading ? 'Mengirim Data...' : `AJUKAN RETUR (${totalRequestedItems} UNIT)`}
            </button>
          </div>
        )}

        {/* TAB 4: SCANNER RFID CEK */}
        {activeTab === 'scanner' && (
          <div className="bg-white rounded-2xl p-5 border-2 border-slate-200 shadow-md space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <span className="font-black text-sm text-slate-800 flex items-center gap-1.5">
                <Scan className="w-4 h-4" />
                Cek Pembacaan Tag RFID
              </span>
              <button
                onClick={() => setActiveTab('menu')}
                className="text-xs text-slate-500 font-bold px-2 py-1 bg-slate-100 rounded-lg"
              >
                Kembali
              </button>
            </div>

            {/* Action Bar */}
            <div className="flex justify-between items-center text-xs">
              <span className="text-[11px] text-slate-500 font-medium">
                Tembakkan scanner Bluetooth / UHF reader ke tag RFID.
              </span>
              {scannedTags.length > 0 && (
                <button
                  type="button"
                  onClick={() => setScannedTags([])}
                  className="px-3 py-1.5 bg-rose-50 text-rose-700 border border-rose-200 font-bold rounded-xl text-xs cursor-pointer"
                >
                  Bersihkan
                </button>
              )}
            </div>

            {/* List tag terbaca */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 max-h-48 overflow-y-auto space-y-1 text-xs font-mono">
              {scannedTags.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs font-sans">
                  Belum ada tag yang ditembak scanner
                </div>
              ) : (
                scannedTags.map((t, idx) => (
                  <div key={idx} className="flex justify-between items-center py-1 border-b border-slate-200 text-slate-800 font-bold">
                    <span>{t}</span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">TERBACA</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Floating Status Bar */}
      <div className="bg-slate-100 p-3 rounded-2xl border border-slate-200 flex items-center justify-between text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
          <span>Koneksi Sistem: <strong>Terhubung</strong></span>
        </div>
        <span className="font-mono text-[11px] text-slate-400">v1.1 Field PWA</span>
      </div>

      {/* MODAL SCAN ULANG / PINDAI HANDHELD SPESIFIK ITEM */}
      {scanningItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-2xl p-5 shadow-2xl border-2 border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex justify-between items-start border-b pb-3">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-sky-700 bg-sky-100 px-2 py-0.5 rounded-full">
                  Pindai Tag Handheld / Scan Ulang
                </span>
                <h3 className="text-base font-black text-slate-900 mt-1">
                  {scanningItem.itemName}
                </h3>
                <p className="text-xs text-slate-500">
                  Pindai tag fisik satu-per-satu dengan Handheld Bluetooth atau simulasikan pemindaian tag.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setScanningItem(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Bluetooth Status Bar */}
            <div className={`p-3 rounded-xl border flex items-center justify-between gap-2 text-xs font-bold ${
              bleConnected
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                : 'bg-slate-50 text-slate-700 border-slate-200'
            }`}>
              <div className="flex items-center gap-2">
                <Bluetooth className={`w-4 h-4 ${bleConnected ? 'text-emerald-600 animate-pulse' : 'text-slate-400'}`} />
                <span>{bleConnected ? `Reader Terhubung: ${bleStatusText}` : 'Bluetooth Reader Belum Terhubung'}</span>
              </div>
              {!bleConnected && (
                <button
                  type="button"
                  onClick={handleConnectBle}
                  disabled={bleConnecting}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs active:scale-95 transition cursor-pointer"
                >
                  <Bluetooth className="w-3.5 h-3.5" />
                  <span>{bleConnecting ? 'Konek...' : 'Koneksikan'}</span>
                </button>
              )}
            </div>

            {/* Counter Summary */}
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="p-3 bg-slate-100 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-500 block uppercase">Tag Terpindai</span>
                <span className="text-2xl font-black text-emerald-700 font-mono">
                  {(itemTags[scanningItem.itemId] || []).length}
                </span>
                <span className="text-[10px] text-slate-500 block font-medium">Batas Maks: {scanningItem.maxQty} {scanningItem.unit}</span>
              </div>
              <div className="p-3 bg-slate-100 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-500 block uppercase">Disiapkan Gudang</span>
                <span className="text-2xl font-black text-slate-800 font-mono">
                  {scanningItem.readyPrepared}
                </span>
                <span className="text-[10px] text-slate-500 block font-medium">{scanningItem.unit} di Staging Bay</span>
              </div>
            </div>

            {/* Scanned EPCs Chip List */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                <span>Daftar Tag EPC ({ (itemTags[scanningItem.itemId] || []).length }):</span>
                { (itemTags[scanningItem.itemId] || []).length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setItemTags(prev => ({ ...prev, [scanningItem.itemId]: [] }));
                      setItemQty(scanningItem.itemId, 0);
                      showToast('Daftar tag dikosongkan.', 'info');
                    }}
                    className="text-[11px] text-rose-600 hover:underline font-bold cursor-pointer"
                  >
                    Reset Tag
                  </button>
                )}
              </div>
              <div className="min-h-[90px] max-h-[140px] overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                {(itemTags[scanningItem.itemId] || []).length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-xs italic">
                    Belum ada tag RFID yang terpindai. Tembakkan handheld atau klik simulasi di bawah.
                  </div>
                ) : (
                  (itemTags[scanningItem.itemId] || []).map((epc, idx) => (
                    <div key={epc} className="flex items-center justify-between p-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="text-[10px] font-bold text-slate-400">#{idx + 1}</span>
                        <span className="font-bold text-slate-800 truncate">{epc}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = (itemTags[scanningItem.itemId] || []).filter(e => e !== epc);
                          setItemTags(prev => ({ ...prev, [scanningItem.itemId]: updated }));
                          setItemQty(scanningItem.itemId, updated.length);
                        }}
                        className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer ml-1 shrink-0"
                        title="Hapus tag ini"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Quick Actions Toolbar */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  const currentTags = itemTags[scanningItem.itemId] || [];
                  if (currentTags.length >= scanningItem.maxQty) {
                    showToast('Sudah mencapai batas maksimal sisa kuota BOQ.', 'warning');
                    return;
                  }
                  const fakeEpc = `E280116060000204100${String(currentTags.length + 1).padStart(4, '0')}`;
                  playBeep(1200, 0.08);
                  const nextTags = [...currentTags, fakeEpc];
                  setItemTags(prev => ({ ...prev, [scanningItem.itemId]: nextTags }));
                  setItemQty(scanningItem.itemId, nextTags.length);
                }}
                className="py-2 px-3 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <span>+1 Tag (Simulasi)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  playBeep(880, 0.1);
                  const targetQty = Math.min(scanningItem.maxQty, scanningItem.readyPrepared);
                  setItemQty(scanningItem.itemId, targetQty);
                  showToast(`Kuantiti disetel ke ${targetQty} (sesuai disiapkan gudang).`, 'success');
                }}
                className="py-2 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span>Pas Disiapkan ({scanningItem.readyPrepared})</span>
              </button>
            </div>

            {/* Footer Apply Button */}
            <button
              type="button"
              onClick={() => {
                const count = (itemTags[scanningItem.itemId] || []).length;
                if (count > 0) {
                  setItemQty(scanningItem.itemId, count);
                }
                setScanningItem(null);
                showToast(`Kuantiti ${scanningItem.itemName} diperbarui!`, 'success');
              }}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl font-bold text-xs shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Selesai & Terapkan ({itemQuantities[scanningItem.itemId] || 0} {scanningItem.unit})</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
