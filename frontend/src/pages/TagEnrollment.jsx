import React, { useState, useEffect } from 'react';
import { tagApi, masterApi, devicesApi } from '../services/api';
import { openAuthenticatedEdgeSocket } from '../services/edgeWebSocket';
import { showToast } from '../components/Toast';
import { showConfirm } from '../components/ConfirmDialog';
import Portal from '../components/Portal';
import { 
  Radio, Plus, Check, ShieldCheck, Search, Tag as TagIcon, Sparkles, 
  Package, Layers, Trash2, ListPlus, RefreshCw, HelpCircle, History, 
  Eye, RotateCcw, Ban, CheckCircle2, X, AlertTriangle, ShieldAlert
} from 'lucide-react';

export default function TagEnrollment({ currentUser = null }) {
  const isSuperAdmin = currentUser?.role === 'superadmin' || !currentUser;

  const [tags, setTags] = useState([]);
  const [items, setItems] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'decommissioned'

  const [liveScannedTag, setLiveScannedTag] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [bridgeMode, setBridgeMode] = useState('ENROLLMENT'); // 'ENROLLMENT' | 'GATE_SECURITY'
  const [readerDevices, setReaderDevices] = useState([]);
  const [selectedReaderId, setSelectedReaderId] = useState('');
  const [readerError, setReaderError] = useState('');
  const wsRef = React.useRef(null);

  const [enrollMode, setEnrollMode] = useState('ziplock'); // 'ziplock' | 'single'
  const [ziplockEpcs, setZiplockEpcs] = useState([]);
  const [batchTextInput, setBatchTextInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedTags, setSelectedTags] = useState([]);
  const [deleting, setDeleting] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateForm, setGenerateForm] = useState({ item_id: '', quantity: 100, tag_type: 'anti_metal', notes: '' });
  const [generatedTags, setGeneratedTags] = useState([]);

  // Audit Trail Modal State
  const [auditModalTag, setAuditModalTag] = useState(null);
  const [auditHistory, setAuditHistory] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Form states
  const [enrollForm, setEnrollForm] = useState({
    item_id: '',
    warehouse_id: '',
    tag_type: 'anti_metal',
    epc: '',
    notes: 'Enrolled via Desktop/UHF Ziplock Batch Scan',
  });

  useEffect(() => {
    let cancelled = false;
    const warehouseId = Number(enrollForm.warehouse_id);
    setReaderDevices([]);
    setSelectedReaderId('');
    setReaderError('');
    if (!warehouseId) return undefined;
    devicesApi.getDevices({ warehouse_id: warehouseId, handheld_eligible: 1 })
      .then(({ data }) => {
        if (cancelled) return;
        const devices = data || [];
        setReaderDevices(devices);
        if (devices.length === 1) setSelectedReaderId(String(devices[0].id));
      })
      .catch(() => !cancelled && setReaderError('Daftar reader pendaftaran gagal dimuat.'));
    return () => { cancelled = true; };
  }, [enrollForm.warehouse_id]);

  // Listen to live RFID reader stream via WebSocket (Port 2078) with auto-reconnect
  useEffect(() => {
    let ws = null;
    let reconnectTimer = null;
    let isUnmounted = false;

    const warehouseId = Number(enrollForm.warehouse_id);
    if (!warehouseId || !selectedReaderId) return undefined;

    const connectWs = async () => {
      if (isUnmounted) return;
      try {
        ws = await openAuthenticatedEdgeSocket(warehouseId, ['SET_MODE:ENROLLMENT'], {
          onAuthenticated: (socket) => {
            if (isUnmounted) socket.close();
            else {
              socket.send(JSON.stringify({ action: 'SET_MODE', mode: 'ENROLLMENT' }));
              setBridgeMode('ENROLLMENT');
              setReaderError('');
              setWsConnected(true);
            }
          },
          onClose: () => {
            if (!isUnmounted) {
              setWsConnected(false);
              reconnectTimer = setTimeout(connectWs, 3000);
            }
          },
          onError: () => { if (!isUnmounted) setWsConnected(false); },
          onMessage: (data) => {
            if (data.type === 'MODE_CHANGED') {
              setBridgeMode(data.mode);
            } else if (data.type === 'TAG_READ' && data.epc) {
              const cleanEpc = data.epc.toUpperCase().trim();
              setLiveScannedTag({ epc: cleanEpc, rssi: data.rssi, antenna: data.antenna, timestamp: new Date().toLocaleTimeString() });
              setEnrollForm((prev) => ({ ...prev, epc: cleanEpc }));
              setZiplockEpcs((prev) => prev.includes(cleanEpc) ? prev : [...prev, cleanEpc]);
            }
          },
        }, selectedReaderId);
        if (isUnmounted) return ws.close();
        wsRef.current = ws;
      } catch (e) {
        if (!isUnmounted) {
          setWsConnected(false);
          setReaderError(e.response?.data?.message || e.message || 'Reader gagal terhubung.');
          reconnectTimer = setTimeout(connectWs, 3000);
        }
      }
    };

    connectWs();

    return () => {
      isUnmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        try { ws.close(); } catch (e) {}
      }
    };
  }, [enrollForm.warehouse_id, selectedReaderId]);

  const loadData = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const [tagRes, itemRes, whRes] = await Promise.all([
        tagApi.getTags(),
        masterApi.getItems(),
        masterApi.getWarehouses(),
      ]);
      setTags(tagRes.data.data || tagRes.data);
      setItems(itemRes.data);
      setWarehouses(whRes.data);
      if (itemRes.data.length > 0 && !enrollForm.item_id) {
        setEnrollForm((prev) => ({
          ...prev,
          item_id: itemRes.data[0].id,
          warehouse_id: whRes.data[0]?.id || '',
        }));
      }
    } catch (err) {
      console.error('Error loading tags:', err);
      showToast('Gagal memuat registri tag RFID', 'error');
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const generateMockEpc = () => {
    const hex = Math.floor(Math.random() * 0xffffff)
      .toString(16)
      .padStart(6, '0')
      .toUpperCase();
    const generated = `E280116060000204${hex}`;
    setEnrollForm({ ...enrollForm, epc: generated });
  };

  const generateMockZiplockBatch = (count = 10) => {
    const batch = [];
    for (let i = 0; i < count; i++) {
      const hex = Math.floor(Math.random() * 0xffffff)
        .toString(16)
        .padStart(6, '0')
        .toUpperCase();
      batch.push(`E280116060000204${hex}`);
    }
    setZiplockEpcs((prev) => Array.from(new Set([...prev, ...batch])));
    showToast(`✨ Simulasi: ${count} tag RFID dimasukkan ke kantong ziplock`, 'info');
  };

  const handleAddBatchText = () => {
    if (!batchTextInput.trim()) return;
    const extracted = batchTextInput
      .split(/[\r\n,\s]+/)
      .map((e) => e.toUpperCase().trim())
      .filter((e) => e.length >= 8);

    if (extracted.length === 0) {
      showToast('Format EPC tidak valid. Masukkan hex 8-64 karakter.', 'warning');
      return;
    }

    setZiplockEpcs((prev) => Array.from(new Set([...prev, ...extracted])));
    setBatchTextInput('');
    showToast(`Ditambahkan ${extracted.length} EPC ke daftar kantong ziplock`, 'success');
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await tagApi.reserveTags({ ...generateForm, item_id: Number(generateForm.item_id), quantity: Number(generateForm.quantity) });
      setGeneratedTags(res.data.tags || []);
      setShowGenerateModal(false);
      showToast(res.data.message, 'success');
      loadData(false);
    } catch (err) {
      showToast('Gagal generate EPC: ' + (err.response?.data?.message || err.message), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const exportGeneratedCsv = () => {
    if (!generatedTags.length) return;
    const csv = ['epc,item_code,item_name,status', ...generatedTags.map((tag) => [tag.epc, tag.item?.code, tag.item?.name, tag.status].map((value) => `"${String(value || '').replaceAll('"', '""')}"`).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `epc-reserved-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const removeZiplockTag = (epcToRemove) => {
    setZiplockEpcs((prev) => prev.filter((epc) => epc !== epcToRemove));
  };

  const handleEnroll = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (enrollMode === 'ziplock') {
        if (ziplockEpcs.length === 0) {
          showToast('Belum ada tag yang terdeteksi di kantong ziplock!', 'warning');
          setSubmitting(false);
          return;
        }

        const payload = {
          item_id: enrollForm.item_id,
          warehouse_id: enrollForm.warehouse_id,
          tag_type: enrollForm.tag_type,
          epc_list: ziplockEpcs,
          notes: enrollForm.notes || `Kantong Ziplock Batch (${ziplockEpcs.length} pcs)`,
        };

        const res = await tagApi.enrollTags(payload);
        showToast(`🎉 Sukses! ${res.data?.enrolled_count || ziplockEpcs.length} tag dalam kantong ziplock berhasil diaktifkan!`, 'success');
        setZiplockEpcs([]);
      } else {
        if (!enrollForm.epc) {
          showToast('Nomor EPC tag wajib diisi!', 'warning');
          setSubmitting(false);
          return;
        }

        await tagApi.enrollTags(enrollForm);
        showToast('Tag RFID berhasil diaktifkan!', 'success');
        setEnrollForm((prev) => ({ ...prev, epc: '' }));
      }

      loadData(false);
    } catch (err) {
      showToast('Gagal enroll tag: ' + (err.response?.data?.message || err.message), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisableSingle = async (epc) => {
    if (!isSuperAdmin) {
      showToast('Akses Ditolak: Hanya Super Administrator yang berhak menonaktifkan tag RFID.', 'error');
      return;
    }
    const confirmed = await showConfirm({
      title: 'Nonaktifkan Tag RFID',
      message: `AUDIT NOTICE: Apakah Anda yakin ingin menonaktifkan (disable) tag RFID [${epc}]? Tindakan ini akan dicatat ke Digital Chain of Custody.`,
      confirmText: 'Nonaktifkan Tag',
      type: 'danger',
    });
    if (!confirmed) return;
    setDeleting(true);
    try {
      const res = await tagApi.deleteTag(epc);
      showToast(res.data?.message || `Tag ${epc} berhasil dinonaktifkan (disabled)!`, 'success');
      setSelectedTags((prev) => prev.filter((id) => id !== epc));
      setTags((prev) =>
        prev.map((t) => (t.epc === epc ? { ...t, is_active: false, status: 'inactive' } : t))
      );
      loadData(false);
    } catch (err) {
      showToast('Gagal menonaktifkan tag: ' + (err.response?.data?.message || err.message), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDisable = async () => {
    if (!isSuperAdmin) {
      showToast('Akses Ditolak: Hanya Super Administrator yang berhak menonaktifkan tag RFID.', 'error');
      return;
    }
    if (selectedTags.length === 0) return;
    const confirmed = await showConfirm({
      title: 'Bulk Deaktivasi Tag RFID',
      message: `AUDIT NOTICE: Anda akan menonaktifkan (disable) ${selectedTags.length} tag RFID terpilih. Seluruh riwayat akan dicatat ke Audit Trail. Lanjutkan?`,
      confirmText: `Nonaktifkan ${selectedTags.length} Tag`,
      type: 'danger',
    });
    if (!confirmed) return;
    setDeleting(true);
    try {
      const res = await tagApi.bulkDeleteTags(selectedTags);
      showToast(res.data?.message || `Berhasil menonaktifkan ${selectedTags.length} tag RFID.`, 'success');
      const disabledEpcs = new Set(selectedTags);
      setTags((prev) =>
        prev.map((t) =>
          disabledEpcs.has(t.epc) ? { ...t, is_active: false, status: 'inactive' } : t
        )
      );
      setSelectedTags([]);
      loadData(false);
    } catch (err) {
      showToast('Gagal nonaktifkan massal: ' + (err.response?.data?.message || err.message), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleReactivate = async (epc) => {
    if (!isSuperAdmin) {
      showToast('Akses Ditolak: Hanya Super Administrator yang berhak mengaktifkan kembali tag RFID.', 'error');
      return;
    }
    const confirmed = await showConfirm({
      title: 'Reaktivasi Tag RFID',
      message: `Aktifkan kembali (reactivate) tag RFID [${epc}]?`,
      confirmText: 'Aktifkan Tag',
      type: 'info',
    });
    if (!confirmed) return;
    setDeleting(true);
    try {
      const res = await tagApi.reactivateTag(epc);
      showToast(res.data?.message || `Tag ${epc} berhasil diaktifkan kembali!`, 'success');
      setTags((prev) =>
        prev.map((t) => (t.epc === epc ? { ...t, is_active: true, status: 'active' } : t))
      );
      loadData(false);
    } catch (err) {
      showToast('Gagal mengaktifkan kembali tag: ' + (err.response?.data?.message || err.message), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleViewAudit = async (epc) => {
    setLoadingAudit(true);
    try {
      const res = await tagApi.getTag(epc);
      setAuditModalTag(res.data?.tag || { epc });
      setAuditHistory(res.data?.custody_history || []);
    } catch (err) {
      showToast('Gagal memuat audit trail: ' + (err.response?.data?.message || err.message), 'error');
    } finally {
      setLoadingAudit(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedTags.length === filteredTags.length) {
      setSelectedTags([]);
    } else {
      setSelectedTags(filteredTags.map((t) => t.epc));
    }
  };

  const toggleSelectTag = (epc) => {
    setSelectedTags((prev) =>
      prev.includes(epc) ? prev.filter((x) => x !== epc) : [...prev, epc]
    );
  };

  const filteredTags = tags.filter((t) => {
    const matchesSearch =
      t.epc.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.item?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.warehouse?.name || '').toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (statusFilter === 'active') {
      return t.status !== 'decommissioned';
    } else if (statusFilter === 'decommissioned') {
      return t.status === 'decommissioned';
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="border-b border-slate-200 pb-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Pendaftaran & Aktivasi Tag RFID</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Registrasi pre-encoding satu-per-satu atau sekaligus 1 kantong Ziplock (Multi-Tag Array) via Desktop / UHF Reader.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            const item = items.find((candidate) => candidate.epc_prefix) || items[0];
            setGenerateForm((prev) => ({ ...prev, item_id: item?.id || '', tag_type: item?.is_metal ? 'anti_metal' : 'sticker' }));
            setShowGenerateModal(true);
          }}
          className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold"
        >
          Generate Custom Kode EPC
        </button>

        {/* Live Reader & Mode Badges */}
        <div className="flex items-center flex-wrap gap-2">
          {wsConnected && bridgeMode === 'ENROLLMENT' && (
            <span className="text-[11px] font-bold px-3 py-1 rounded-xl border flex items-center gap-1.5 bg-purple-50 text-purple-700 border-purple-300">
              <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
              Mode Pendaftaran
            </span>
          )}

          <span className={`text-[11px] font-mono font-bold px-3 py-1 rounded-xl border flex items-center gap-1.5 shadow-xs ${
            wsConnected ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-slate-100 text-slate-600 border-slate-300'
          }`}>
            <Radio className={`w-3.5 h-3.5 ${wsConnected ? 'animate-pulse text-emerald-600' : 'text-slate-400'}`} />
            {wsConnected ? '🟢 RFID READER ONLINE' : '⚪ MANUAL / USB HID MODE'}
          </span>
        </div>
      </div>

      {generatedTags.length > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex items-center justify-between gap-3 text-xs">
          <span><strong>{generatedTags.length} EPC</strong> terakhir sudah direservasi. Tidak perlu registrasi ulang.</span>
          <button type="button" onClick={exportGeneratedCsv} className="px-3 py-2 bg-white border border-indigo-300 text-indigo-700 rounded-lg font-bold">Export: Ambil Hasil Generate untuk Custom Kode EPC</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Enrollment Form (5 Cols) */}
        <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          {/* Mode Switcher Tabs */}
          <div className="bg-slate-100 p-1 rounded-xl grid grid-cols-2 gap-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => setEnrollMode('ziplock')}
              className={`py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer ${
                enrollMode === 'ziplock'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              🛍️ Kantong Ziplock (Array)
            </button>
            <button
              type="button"
              onClick={() => setEnrollMode('single')}
              className={`py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer ${
                enrollMode === 'single'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              🎯 1-per-1 (Satuan)
            </button>
          </div>

          {/* Info Banner */}
          {enrollMode === 'ziplock' ? (
            <div className="bg-emerald-50/80 border border-emerald-200 p-3 rounded-xl text-xs space-y-1 text-emerald-950">
              <div className="font-bold flex items-center gap-1.5 text-emerald-800">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                Mode Kantong Ziplock Aktif:
              </div>
              <p className="text-[11px] text-emerald-700 leading-relaxed">
                Cukup dekatkan 1 kantong ziplock berisi puluhan tag ke antena reader. Seluruh tag yang terbaca otomatis terakumulasi dalam daftar array di bawah.
              </p>
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-xs text-slate-600 space-y-1">
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-slate-600" />
                Mode Satuan (Single Tag):
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Scan atau ketik 1 nomor EPC untuk mengaitkan 1 tag secara individual.
              </p>
            </div>
          )}

          <form onSubmit={handleEnroll} className="space-y-3.5 text-xs">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Pilih Material FO Target *</label>
              <select
                value={enrollForm.item_id}
                onChange={(e) => {
                  const it = items.find((i) => i.id === parseInt(e.target.value, 10));
                  setEnrollForm({
                    ...enrollForm,
                    item_id: e.target.value,
                    tag_type: it?.is_metal ? 'anti_metal' : 'sticker',
                  });
                }}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold"
              >
                {items.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.code}: {it.name} ({it.is_metal ? 'Anti-metal WZ-Y258' : 'Stiker Inlay'})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Gudang Reader *</label>
                <select
                  value={enrollForm.warehouse_id}
                  onChange={(e) => setEnrollForm({ ...enrollForm, warehouse_id: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-xs"
                >
                  {warehouses.map((wh) => (
                    <option key={wh.id} value={wh.id}>{wh.name}</option>
                  ))}
                </select>
                <p className="mt-1 text-slate-500">Lokasi reader, bukan penerimaan stok. Tag baru belum masuk stok gudang.</p>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Tipe Tag *</label>
                <select
                  value={enrollForm.tag_type}
                  onChange={(e) => setEnrollForm({ ...enrollForm, tag_type: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-xs"
                >
                  <option value="anti_metal">WZ-Y258 Anti-Metal</option>
                  <option value="sticker">Stiker Wet Inlay</option>
                  <option value="bag_batch">Bag-Batch Tag</option>
                </select>
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Reader Pendaftaran</label>
              <select
                value={selectedReaderId}
                onChange={(e) => setSelectedReaderId(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-xs"
              >
                <option value="">Pilih reader meja/hybrid</option>
                {readerDevices.map((device) => (
                  <option key={device.id} value={device.id}>{device.device_name} ({device.device_code})</option>
                ))}
              </select>
              <p className={`mt-1 text-[11px] ${wsConnected ? 'text-emerald-700' : readerError ? 'text-rose-600' : 'text-slate-500'}`}>
                {wsConnected ? 'Reader terhubung dalam mode ENROLLMENT.' : readerError || 'Input manual tetap tersedia bila reader tidak dipilih.'}
              </p>
            </div>

            {/* Ziplock Multi-Tag Array Area */}
            {enrollMode === 'ziplock' ? (
              <div className="space-y-2.5 border-t border-slate-100 pt-2.5">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-700 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-emerald-600" />
                    Tag di Kantong Ziplock ({ziplockEpcs.length})
                  </span>
                  <div className="flex items-center gap-1">
                    {ziplockEpcs.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setZiplockEpcs([])}
                        className="text-rose-600 hover:bg-rose-50 px-2 py-1 rounded text-[10px] font-bold border border-rose-200 cursor-pointer"
                      >
                        Reset Daftar
                      </button>
                    )}
                  </div>
                </div>

                {/* Scanned Tag Pills Container */}
                <div className="border border-slate-200 rounded-xl p-2.5 bg-slate-50 min-h-[110px] max-h-[160px] overflow-y-auto space-y-1">
                  {ziplockEpcs.length === 0 ? (
                    <div className="h-24 flex flex-col items-center justify-center text-center text-slate-400">
                      <Radio className="w-6 h-6 mb-1 text-slate-300 animate-pulse" />
                      <p className="text-[11px] font-medium">Dekatkan kantong ziplock ke reader RFID...</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">atau paste daftar EPC di kotak bawah</p>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {ziplockEpcs.map((epc, idx) => (
                        <span
                          key={epc}
                          className="inline-flex items-center gap-1 bg-white border border-emerald-300 text-emerald-900 font-mono text-[10px] font-bold px-2 py-1 rounded-lg shadow-2xs"
                        >
                          <span className="text-[9px] text-slate-400">#{idx + 1}</span>
                          {epc}
                          <button
                            type="button"
                            onClick={() => removeZiplockTag(epc)}
                            className="text-slate-400 hover:text-rose-600 ml-1 cursor-pointer"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Paste / Manual Batch Input */}
                <div className="space-y-1">
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      placeholder="Paste atau tembak barcode EPC..."
                      value={batchTextInput}
                      onChange={(e) => setBatchTextInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddBatchText();
                        }
                      }}
                      className="w-full p-2 border border-slate-300 rounded-xl font-mono text-[11px]"
                    />
                    <button
                      type="button"
                      onClick={handleAddBatchText}
                      className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-3 rounded-xl shrink-0 cursor-pointer text-[11px]"
                    >
                      + Tambah
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Single Mode Input */
              <div className="border-t border-slate-100 pt-2.5 space-y-2">
                <div className="flex justify-between items-center">
                  <label className="font-bold text-slate-700">Nomor EPC Tag (Hex 24-char) *</label>
                  <button
                    type="button"
                    onClick={generateMockEpc}
                    className="text-emerald-600 hover:text-emerald-700 font-bold flex items-center gap-1 text-[11px] cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" /> Auto-Hex
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="e.g. E28011606000020410000001"
                  value={enrollForm.epc}
                  onChange={(e) => setEnrollForm({ ...enrollForm, epc: e.target.value.toUpperCase() })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-mono tracking-wider font-bold text-xs"
                />
              </div>
            )}

            <div>
              <label className="font-bold text-slate-700 block mb-1">Catatan / Label Batch</label>
              <input
                type="text"
                value={enrollForm.notes}
                onChange={(e) => setEnrollForm({ ...enrollForm, notes: e.target.value })}
                className="w-full p-2 border border-slate-300 rounded-xl text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className={`w-full py-3 rounded-xl font-bold shadow transition cursor-pointer text-xs flex items-center justify-center gap-2 ${
                enrollMode === 'ziplock'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-slate-900 hover:bg-slate-800 text-white'
              }`}
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Memproses Registrasi...
                </>
              ) : enrollMode === 'ziplock' ? (
                <>
                  <Package className="w-3.5 h-3.5" />
                  Aktifkan Seluruh Tag di Kantong ({ziplockEpcs.length} pcs)
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  Registrasi & Simpan Tag Satuan
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right: Enrolled Tags Table (7 Cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-3">
          <div className="p-3.5 border-b border-slate-100 space-y-2.5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div className="flex items-center gap-2.5">
                <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Daftar Tag RFID ({filteredTags.length} Tag)
                </h2>
                {isSuperAdmin && selectedTags.length > 0 && (
                  <button
                    type="button"
                    onClick={handleBulkDisable}
                    disabled={deleting}
                    className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-[11px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition shadow-2xs"
                  >
                    <Ban className="w-3 h-3 text-amber-700" />
                    Nonaktifkan Terpilih ({selectedTags.length})
                  </button>
                )}
              </div>

              <div className="relative w-full sm:w-56">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Cari EPC atau Material..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Status Filter Tabs & Superadmin Indicator */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-1 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                    statusFilter === 'all'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Semua ({tags.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('active')}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                    statusFilter === 'active'
                      ? 'bg-emerald-700 text-white'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  🟢 Aktif ({tags.filter((t) => t.status !== 'decommissioned').length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('decommissioned')}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                    statusFilter === 'decommissioned'
                      ? 'bg-rose-700 text-white'
                      : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                  }`}
                >
                  🚫 Nonaktif ({tags.filter((t) => t.status === 'decommissioned').length})
                </button>
              </div>

              {!isSuperAdmin && (
                <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md font-semibold flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3 text-amber-600" />
                  Mode Viewer (Disable hanya Superadmin)
                </span>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  {isSuperAdmin && (
                    <th className="py-3 px-3 text-center w-8">
                      <input
                        type="checkbox"
                        checked={filteredTags.length > 0 && selectedTags.length === filteredTags.length}
                        onChange={toggleSelectAll}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                    </th>
                  )}
                  <th className="py-3 px-3">Nomor EPC</th>
                  <th className="py-3 px-3">Material Dipetakan</th>
                  <th className="py-3 px-3">Tipe Tag</th>
                  <th className="py-3 px-3">Lokasi Gudang</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3 text-center">Audit & Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTags.length === 0 ? (
                  <tr>
                    <td colSpan={isSuperAdmin ? 7 : 6} className="py-12 text-center text-slate-400">
                      Tidak ada tag RFID yang cocok.
                    </td>
                  </tr>
                ) : (
                  filteredTags.map((t) => {
                    const isSelected = selectedTags.includes(t.epc);
                    const isDecommissioned = t.status === 'decommissioned';

                    return (
                      <tr key={t.id} className={`hover:bg-slate-50/80 transition ${isSelected ? 'bg-emerald-50/40' : isDecommissioned ? 'bg-slate-50/50 opacity-75' : ''}`}>
                        {isSuperAdmin && (
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectTag(t.epc)}
                              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                            />
                          </td>
                        )}
                        <td className="py-2.5 px-3 font-mono font-bold text-emerald-800 text-[11px]">
                          {t.epc}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">{t.item?.name}</td>
                        <td className="py-2.5 px-3">
                          <span className="capitalize px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[10px]">
                            {t.tag_type === 'anti_metal' ? 'WZ-Y258 (Logam)' : t.tag_type}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 font-medium">{t.warehouse?.name}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isDecommissioned
                              ? 'bg-slate-200 text-slate-700 border border-slate-300 line-through'
                              : t.status === 'in_stock'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : t.status === 'in_transit'
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}>
                            {isDecommissioned ? 'NONAKTIF' : t.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {/* View Audit Trail Button */}
                            <button
                              type="button"
                              title="Lihat Riwayat & Audit Trail Digital Chain of Custody"
                              onClick={() => handleViewAudit(t.epc)}
                              className="p-1 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded transition cursor-pointer"
                            >
                              <History className="w-3.5 h-3.5" />
                            </button>

                            {/* Superadmin Disable / Reactivate Action */}
                            {isSuperAdmin && (
                              isDecommissioned ? (
                                <button
                                  type="button"
                                  title="Aktifkan Kembali Tag (Reactivate)"
                                  onClick={() => handleReactivate(t.epc)}
                                  disabled={deleting}
                                  className="p-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded transition cursor-pointer"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  title="Nonaktifkan (Disable) Tag dengan Audit Trail"
                                  onClick={() => handleDisableSingle(t.epc)}
                                  disabled={deleting}
                                  className="p-1 text-slate-400 hover:text-amber-700 hover:bg-amber-50 rounded transition cursor-pointer"
                                >
                                  <Ban className="w-3.5 h-3.5" />
                                </button>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showGenerateModal && (
        <Portal>
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[100]">
            <form onSubmit={handleGenerate} className="bg-white rounded-2xl p-5 w-full max-w-md space-y-4">
              <div className="flex justify-between"><h2 className="font-bold">Generate EPC Custom</h2><button type="button" onClick={() => setShowGenerateModal(false)}><X className="w-5 h-5" /></button></div>
              <select required value={generateForm.item_id} onChange={(e) => { const item = items.find((candidate) => candidate.id === Number(e.target.value)); setGenerateForm({ ...generateForm, item_id: e.target.value, tag_type: item?.is_metal ? 'anti_metal' : 'sticker' }); }} className="w-full p-2.5 border rounded-xl">
                <option value="">Pilih jenis barang</option>
                {items.map((item) => <option key={item.id} value={item.id} disabled={!item.epc_prefix}>{item.code} — {item.name}{!item.epc_prefix ? ' (format belum ada)' : ''}</option>)}
              </select>
              <input type="number" required min="1" max="1000" value={generateForm.quantity} onChange={(e) => setGenerateForm({ ...generateForm, quantity: e.target.value })} className="w-full p-2.5 border rounded-xl" placeholder="Jumlah EPC" />
              <input type="text" value={generateForm.notes} onChange={(e) => setGenerateForm({ ...generateForm, notes: e.target.value })} className="w-full p-2.5 border rounded-xl" placeholder="Catatan batch (opsional)" />
              <p className="text-xs text-slate-500">Preview: {items.find((item) => item.id === Number(generateForm.item_id))?.epc_prefix || '-'}… Maksimum 1.000 per batch.</p>
              <button disabled={submitting} className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-bold">{submitting ? 'Memproses…' : `Generate ${generateForm.quantity} EPC`}</button>
            </form>
          </div>
        </Portal>
      )}

      {/* Audit Trail Modal */}
      {auditModalTag && (
        <Portal>
          <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] shadow-2xl flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="text-sm font-bold">Audit Trail & Digital Chain of Custody</h3>
                  <p className="text-[11px] text-slate-400 font-mono font-medium">EPC: {auditModalTag.epc}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAuditModalTag(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 overflow-y-auto space-y-4">
              {/* Tag Info Card */}
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Material:</span>
                  <span className="font-semibold text-slate-800">{auditModalTag.item?.name || '-'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Lokasi Gudang:</span>
                  <span className="font-semibold text-slate-800">{auditModalTag.last_warehouse?.name || '-'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Tipe Tag Fisik:</span>
                  <span className="font-semibold text-slate-800 capitalize">{auditModalTag.tag_type}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Status Saat Ini:</span>
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                    auditModalTag.status === 'decommissioned'
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {auditModalTag.status?.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Timeline Header */}
              <div className="border-b border-slate-200 pb-1.5 flex justify-between items-center">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-emerald-600" />
                  Kronologi Pergerakan & Riwayat Aksi ({auditHistory.length} Event)
                </h4>
                <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-mono font-bold">
                  IMMUTABLE LEDGER
                </span>
              </div>

              {/* Timeline List */}
              {loadingAudit ? (
                <div className="py-8 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin text-emerald-600" />
                  Memuat riwayat buku besar rantai tanggung jawab...
                </div>
              ) : auditHistory.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Belum ada riwayat pergerakan yang tercatat untuk tag ini.
                </div>
              ) : (
                <div className="space-y-3 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-slate-200">
                  {auditHistory.map((ev, i) => (
                    <div key={ev.id || i} className="relative flex items-start gap-3 pl-1 text-xs">
                      {/* Timeline Dot */}
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10 text-[10px] font-bold ${
                        ev.action === 'TAG_DECOMMISSIONED'
                          ? 'bg-rose-600 text-white'
                          : ev.action === 'TAG_REACTIVATED'
                          ? 'bg-blue-600 text-white'
                          : ev.action === 'STOCK_IN'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-700 text-white'
                      }`}>
                        {i + 1}
                      </div>

                      {/* Event Details */}
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 w-full space-y-1">
                        <div className="flex justify-between items-start gap-2">
                          <span className={`font-mono font-bold text-[10px] px-1.5 py-0.5 rounded ${
                            ev.action === 'TAG_DECOMMISSIONED'
                              ? 'bg-rose-100 text-rose-800'
                              : ev.action === 'TAG_REACTIVATED'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-slate-200 text-slate-800'
                          }`}>
                            {ev.action}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(ev.created_at).toLocaleString('id-ID', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>

                        <p className="text-slate-700 font-medium text-[11px]">{ev.notes || 'Perpindahan tercatat di titik RFID/gudang.'}</p>

                        <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-200/60 flex justify-between items-center">
                          <span>Penanggung Jawab: <strong className="text-slate-700">{ev.holder?.name || 'Sistem'}</strong></span>
                          <span>Lokasi: {ev.warehouse?.name || 'Yard Proyek'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setAuditModalTag(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}
    </div>
  );
}
