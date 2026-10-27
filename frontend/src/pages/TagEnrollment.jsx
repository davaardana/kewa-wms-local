import { FlameButton } from '../components/ui/flame-button';
import React, { useState, useEffect } from 'react';
import { tagApi, masterApi, devicesApi } from '../services/api';
import { openAuthenticatedEdgeSocket, openEnrollmentSseStream } from '../services/edgeWebSocket';
import { normalizeEpc, normalizeEpcList } from '../services/rfidContract';
import { showToast } from '../components/Toast';
import { showConfirm } from '../components/ConfirmDialog';
import Portal from '../components/Portal';
import { 
  Radio, Plus, Check, ShieldCheck, Search, Tag as TagIcon, Sparkles, 
  Package, Layers, Trash2, ListPlus, RefreshCw, HelpCircle, History, 
  Eye, RotateCcw, Ban, CheckCircle2, X, AlertTriangle, ShieldAlert,
  ChevronLeft, ChevronRight
} from 'lucide-react';

const TAGS_PER_PAGE = 50;

export default function TagEnrollment({ currentUser = null }) {
  // PM + SA can enroll, reserve, reactivate (matches BE: ['superadmin','pm'])
  const canManageTags = !currentUser || ['superadmin', 'pm'].includes(currentUser.role);
  // Only SA can delete tags (matches BE: role !== 'superadmin' → 403)
  const canDeleteTags = !currentUser || currentUser.role === 'superadmin';
  // Backward compat alias used in many places
  const isSuperAdmin = canDeleteTags;

  const [tags, setTags] = useState([]);
  const [items, setItems] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'decommissioned'
  const [tagPage, setTagPage] = useState(1);
  const [tagPagination, setTagPagination] = useState({ current_page: 1, last_page: 1, total: 0 });

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

  // Listen to live RFID reader stream — WS langsung ke edge (untuk LAN) + SSE fallback (untuk luar LAN)
  useEffect(() => {
    let ws = null;
    let reconnectTimer = null;
    let isUnmounted = false;
    let closeSse = null; // SSE fallback closer

    const warehouseId = Number(enrollForm.warehouse_id);
    if (!warehouseId || !selectedReaderId) return undefined;

    // Handler tag yang sama untuk WS maupun SSE
    // SSE mengirim { epc, antenna, rssi, ... } langsung (tanpa wrapper type)
    // WS mengirim { type: 'TAG_READ', epc, ... }
    const handleTagRead = (data) => {
      // Terima TAG_READ dari WS, atau objek langsung dari SSE (type === 'tag_read' atau tidak ada type)
      const isTagEvent = !data.type || data.type === 'TAG_READ' || data.type === 'tag_read';
      if (isTagEvent && data.epc) {
        const cleanEpc = normalizeEpc(data.epc);
        setLiveScannedTag({ epc: cleanEpc, rssi: data.rssi, antenna: data.antenna, timestamp: new Date().toLocaleTimeString() });
        setEnrollForm((prev) => ({ ...prev, epc: cleanEpc }));
        setZiplockEpcs((prev) => prev.includes(cleanEpc) ? prev : [...prev, cleanEpc]);
      }
    };

    // SSE fallback — VPS relay, bekerja dari mana saja tanpa tergantung IP LAN edge
    const startSseFallback = () => {
      if (isUnmounted || closeSse) return;
      console.log('[TagEnrollment] WS tidak bisa reach edge LAN — beralih ke SSE fallback via VPS');
      setBridgeMode('ENROLLMENT');
      setReaderError('');
      setWsConnected(true); // SSE dianggap "connected" ke reader via VPS relay
      closeSse = openEnrollmentSseStream(warehouseId, handleTagRead);
    };

    const connectWs = async () => {
      if (isUnmounted) return;
      // Flag: apakah WS berhasil di-auth setidaknya sekali di sesi ini
      let wsEverAuthenticated = false;
      try {
        ws = await openAuthenticatedEdgeSocket(warehouseId, ['SET_MODE:ENROLLMENT'], {
          onAuthenticated: (socket) => {
            wsEverAuthenticated = true;
            if (isUnmounted) socket.close();
            else {
              socket.send(JSON.stringify({ action: 'SET_MODE', mode: 'ENROLLMENT' }));
              setBridgeMode('ENROLLMENT');
              setReaderError('');
              setWsConnected(true);
            }
          },
          onClose: () => {
            if (isUnmounted) return;
            setWsConnected(false);
            if (wsEverAuthenticated) {
              // WS pernah auth → edge LAN reachable, coba reconnect
              reconnectTimer = setTimeout(connectWs, 3000);
            } else {
              // WS tidak pernah auth → browser tidak bisa reach edge LAN IP
              // Jangan retry WS — langsung aktifkan SSE via VPS
              startSseFallback();
            }
          },
          onError: () => {
            if (isUnmounted) return;
            setWsConnected(false);
            if (!wsEverAuthenticated) {
              // Error sebelum auth → kemungkinan tidak bisa reach edge → SSE fallback
              startSseFallback();
            }
          },
          onMessage: (data) => {
            if (data.type === 'MODE_CHANGED') {
              setBridgeMode(data.mode);
            } else {
              handleTagRead(data);
            }
          },
        }, selectedReaderId);
        if (isUnmounted) return ws.close();
        wsRef.current = ws;
      } catch (e) {
        if (!isUnmounted) {
          setWsConnected(false);
          const status = e?.response?.status;
          const isNonRecoverable = status === 404 || status === 403 || status === 422 || status === 409;

          if (isNonRecoverable) {
            // Kesalahan permanen (device tidak ada, tidak punya izin, dll) — tampilkan error
            setReaderError(e.response?.data?.message || e.message || 'Reader gagal terhubung.');
          } else {
            // Kemungkinan network error (browser tidak bisa reach edge IP LAN) — fallback ke SSE
            // SSE melalui VPS tidak butuh direct koneksi ke edge IP lokal
            startSseFallback();
          }
        }
      }
    };

    connectWs();

    return () => {
      isUnmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) { try { ws.close(); } catch (e) {} }
      if (closeSse) closeSse();
    };
  }, [enrollForm.warehouse_id, selectedReaderId]);

  const loadData = async (showSpinner = true, page = tagPage) => {
    if (showSpinner) setLoading(true);
    try {
      const [tagRes, itemRes, whRes] = await Promise.all([
        tagApi.getTags({
          page,
          per_page: TAGS_PER_PAGE,
          ...(searchTerm.trim() ? { search: searchTerm.trim() } : {}),
          ...(statusFilter === 'active' ? { status_not: 'decommissioned' } : {}),
          ...(statusFilter === 'decommissioned' ? { status: 'decommissioned' } : {}),
        }),
        masterApi.getItems(),
        masterApi.getWarehouses(),
      ]);
      setTags(tagRes.data.data || tagRes.data);
      setTagPagination({
        current_page: tagRes.data.current_page || page,
        last_page: tagRes.data.last_page || 1,
        total: tagRes.data.total ?? tagRes.data.length ?? 0,
      });
      setTagPage(tagRes.data.current_page || page);
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

  const tagFiltersMountedRef = React.useRef(false);
  useEffect(() => {
    if (!tagFiltersMountedRef.current) {
      tagFiltersMountedRef.current = true;
      return undefined;
    }
    const timer = setTimeout(() => {
      setTagPage(1);
      loadData(false, 1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm, statusFilter]);

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
    if (!batchTextInput.trim()) {
      showToast('Ketik atau paste EPC di kotak input terlebih dahulu, lalu klik + Tambah. Tag yang sudah terbaca reader otomatis masuk ke daftar.', 'info');
      return;
    }
    const extracted = normalizeEpcList(batchTextInput
      .split(/[\r\n,\s]+/)
    ).filter((e) => e.length >= 8);

    if (extracted.length === 0) {
      showToast('Format EPC tidak valid. Masukkan hex 8-64 karakter.', 'warning');
      return;
    }

    const before = ziplockEpcs.length;
    setZiplockEpcs((prev) => Array.from(new Set([...prev, ...extracted])));
    setBatchTextInput('');
    const added = extracted.length;
    const dupCount = extracted.filter((e) => ziplockEpcs.includes(e)).length;
    if (dupCount > 0 && dupCount === added) {
      showToast(`EPC sudah ada di daftar (${dupCount} duplikat diabaikan).`, 'warning');
    } else {
      showToast(`Ditambahkan ${added - dupCount} EPC ke daftar kantong ziplock${dupCount ? ` (${dupCount} duplikat diabaikan)` : ''}`, 'success');
    }
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await tagApi.reserveTags({ ...generateForm, item_id: Number(generateForm.item_id), quantity: Number(generateForm.quantity) });
      setGeneratedTags(res.data.tags || []);
      setShowGenerateModal(false);
      showToast(res.data.message, 'success');
      setTagPage(1);
      await loadData(false, 1);
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
        setLiveScannedTag(null); // Reset UI agar siap tampilkan tag berikutnya segera
      } else {
        if (!enrollForm.epc) {
          showToast('Nomor EPC tag wajib diisi!', 'warning');
          setSubmitting(false);
          return;
        }

        await tagApi.enrollTags(enrollForm);
        showToast('Tag RFID berhasil diaktifkan!', 'success');
        setEnrollForm((prev) => ({ ...prev, epc: '' }));
        setLiveScannedTag(null); // Reset UI agar siap tampilkan tag berikutnya segera
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

  const handleHardDelete = async (epc) => {
    if (!canDeleteTags) {
      showToast('Akses Ditolak: Hanya Super Administrator yang dapat menghapus permanen tag RFID.', 'error');
      return;
    }
    const confirmed = await showConfirm({
      title: 'Hard Delete Tag RFID',
      message: `Hapus record EPC [${epc}] dari registri? Ledger custody dan event gate historis tetap tersimpan. Tindakan ditolak jika tag masih memiliki stok/lokasi gudang atau dipakai dokumen aktif.`,
      confirmText: 'Hapus Permanen',
      type: 'danger',
    });
    if (!confirmed) return;
    setDeleting(true);
    try {
      const res = await tagApi.hardDeleteTag(epc);
      showToast(res.data?.message || `Tag ${epc} berhasil dihapus permanen.`, 'success');
      setSelectedTags((prev) => prev.filter((selectedEpc) => selectedEpc !== epc));
      setTags((prev) => prev.filter((tag) => tag.epc !== epc));
      loadData(false);
    } catch (err) {
      showToast(err.response?.data?.message || 'Gagal menghapus permanen tag.', 'error');
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
    if (!canManageTags) {
      showToast('Akses Ditolak: Hanya PM atau Super Administrator yang berhak mengaktifkan kembali tag RFID.', 'error');
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
    if (statusFilter === 'active') {
      return t.status !== 'decommissioned';
    } else if (statusFilter === 'decommissioned') {
      return t.status === 'decommissioned';
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Pendaftaran Tag RFID</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1.5 border ${
            wsConnected
              ? 'bg-blue-50 text-blue-700 border-blue-200'
              : 'bg-slate-100 text-slate-500 border-slate-200'
          }`}>
            <Radio className={`w-3.5 h-3.5 ${wsConnected ? 'animate-pulse text-blue-500' : 'text-slate-400'}`} />
            {wsConnected ? 'Reader Online' : 'Manual / USB HID'}
          </span>
          {canManageTags && (
            <FlameButton
              type="button"
              onClick={() => {
                const item = items.find((c) => c.epc_prefix) || items[0];
                setGenerateForm((prev) => ({ ...prev, item_id: item?.id || '', tag_type: item?.is_metal ? 'anti_metal' : 'sticker' }));
                setShowGenerateModal(true);
              }}
              height={34}
              flameColor="blue"
              showArrow={false}
              text="Generate EPC"
            />
          )}
        </div>
      </div>

      {generatedTags.length > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex items-center justify-between gap-3 text-xs">
          <span><strong>{generatedTags.length} EPC</strong> direservasi. Tidak perlu registrasi ulang.</span>
          <FlameButton type="button" onClick={exportGeneratedCsv} height={34} flameColor="green" showArrow={false} text="Export CSV" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* ── Left: Enrollment Form ──────────────────────────────── */}
        <div className="lg:col-span-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
          {/* Mode Tabs */}
          <div className="bg-slate-100 p-1 rounded-lg grid grid-cols-2 gap-1 text-xs font-bold">
            <button type="button" onClick={() => setEnrollMode('ziplock')}
              className={`py-1.5 px-2 rounded-md flex items-center justify-center gap-1.5 transition ${
                enrollMode === 'ziplock' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}>
              <Package className="w-3.5 h-3.5" /> Ziplock (Array)
            </button>
            <button type="button" onClick={() => setEnrollMode('single')}
              className={`py-1.5 px-2 rounded-md flex items-center justify-center gap-1.5 transition ${
                enrollMode === 'single' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}>
              <Radio className="w-3.5 h-3.5" /> 1-per-1 (Satuan)
            </button>
          </div>

          <form onSubmit={handleEnroll} className="space-y-3 text-xs">
            {/* Material */}
            <div>
              <label className="font-semibold text-slate-600 block mb-1">Material *</label>
              <select
                value={enrollForm.item_id}
                onChange={(e) => {
                  const it = items.find((i) => i.id === parseInt(e.target.value, 10));
                  setEnrollForm({ ...enrollForm, item_id: e.target.value, tag_type: it?.is_metal ? 'anti_metal' : 'sticker' });
                }}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-medium"
              >
                <option value="">Pilih material…</option>
                {items.map((it) => (
                  <option key={it.id} value={it.id}>{it.code}: {it.name}</option>
                ))}
              </select>
            </div>

            {/* Gudang + Tipe Tag */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-semibold text-slate-600 block mb-1">Gudang *</label>
                <select
                  value={enrollForm.warehouse_id}
                  onChange={(e) => setEnrollForm({ ...enrollForm, warehouse_id: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-medium"
                >
                  <option value="">Pilih gudang…</option>
                  {warehouses.map((wh) => (
                    <option key={wh.id} value={wh.id}>{wh.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-semibold text-slate-600 block mb-1">Tipe Tag</label>
                <select
                  value={enrollForm.tag_type}
                  onChange={(e) => setEnrollForm({ ...enrollForm, tag_type: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-medium"
                >
                  <option value="anti_metal">WZ-Y258 Anti-Metal</option>
                  <option value="sticker">Stiker Inlay</option>
                  <option value="bag_batch">Bag-Batch</option>
                </select>
              </div>
            </div>

            {/* Reader */}
            <div>
              <label className="font-semibold text-slate-600 block mb-1">Reader Pendaftaran</label>
              <select
                value={selectedReaderId}
                onChange={(e) => setSelectedReaderId(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-medium"
              >
                <option value="">Pilih reader / input manual</option>
                {readerDevices.map((dev) => (
                  <option key={dev.id} value={dev.id}>{dev.device_name} ({dev.device_code})</option>
                ))}
              </select>
              {(readerError || wsConnected) && (
                <p className={`mt-1 text-[11px] ${wsConnected ? 'text-blue-600' : 'text-rose-500'}`}>
                  {wsConnected ? '🟢 Reader aktif — mode ENROLLMENT' : readerError}
                </p>
              )}
            </div>

            {/* ── Ziplock Tag Area ─────────────────────────────────── */}
            {enrollMode === 'ziplock' ? (
              <div className="space-y-2 border-t border-slate-100 pt-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-blue-500" />
                    Tag Terbaca ({ziplockEpcs.length})
                  </span>
                  {ziplockEpcs.length > 0 && (
                    <button type="button" onClick={() => setZiplockEpcs([])}
                      className="text-rose-500 hover:text-rose-700 text-[10px] font-bold cursor-pointer">Reset</button>
                  )}
                </div>

                <div className="border border-slate-200 rounded-xl p-2.5 bg-slate-50 min-h-[90px] max-h-[140px] overflow-y-auto">
                  {ziplockEpcs.length === 0 ? (
                    <div className="h-20 flex flex-col items-center justify-center text-slate-400">
                      <Radio className="w-5 h-5 mb-1 text-slate-300 animate-pulse" />
                      <p className="text-[11px]">Dekatkan kantong ziplock ke reader…</p>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {ziplockEpcs.map((epc, idx) => (
                        <span key={epc} className="inline-flex items-center gap-1 bg-white border border-blue-200 text-blue-800 font-mono text-[10px] font-bold px-2 py-0.5 rounded-lg">
                          <span className="text-slate-400">#{idx + 1}</span> {epc.slice(-8)}
                          <button type="button" onClick={() => removeZiplockTag(epc)} className="text-slate-300 hover:text-rose-500 ml-0.5 cursor-pointer">×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="Ketik / paste EPC manual di sini…"
                    value={batchTextInput}
                    onChange={(e) => setBatchTextInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddBatchText(); } }}
                    className="flex-1 p-2 border border-slate-200 rounded-lg font-mono text-[11px]"
                  />
                  <button type="button" onClick={handleAddBatchText}
                    className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-3 rounded-lg text-[11px] cursor-pointer">
                    + Tambah
                  </button>
                </div>
                {ziplockEpcs.length > 0 && (
                  <p className="text-[10px] text-blue-600 font-medium">
                    ✅ {ziplockEpcs.length} tag siap didaftarkan — klik <strong>Aktifkan {ziplockEpcs.length} Tag</strong> di bawah
                  </p>
                )}
              </div>
            ) : (
              /* Single Mode */
              <div className="border-t border-slate-100 pt-2 space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="font-semibold text-slate-700">Nomor EPC *</label>
                  <button type="button" onClick={generateMockEpc}
                    className="text-blue-500 hover:text-blue-700 font-bold flex items-center gap-1 text-[11px] cursor-pointer">
                    <Sparkles className="w-3 h-3" /> Auto-Hex
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="e.g. E28011606000020410000001"
                  value={enrollForm.epc}
                  onChange={(e) => setEnrollForm({ ...enrollForm, epc: e.target.value.toUpperCase() })}
                  className="w-full p-2 border border-slate-200 rounded-lg font-mono tracking-wider font-bold text-xs"
                />
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="font-semibold text-slate-600 block mb-1">Catatan Batch</label>
              <input
                type="text"
                value={enrollForm.notes}
                onChange={(e) => setEnrollForm({ ...enrollForm, notes: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg text-xs"
              />
            </div>

            <FlameButton
              type="submit"
              disabled={submitting || (enrollMode === 'ziplock' && ziplockEpcs.length === 0)}
              fullWidth
              height={40}
              flameColor={enrollMode === 'ziplock' ? 'blue' : 'blue'}
              showArrow={false}
            >
              {submitting ? (
                <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Memproses…</>
              ) : enrollMode === 'ziplock' ? (
                <><Package className="w-3.5 h-3.5" /> Aktifkan {ziplockEpcs.length} Tag</>
              ) : (
                <><Plus className="w-3.5 h-3.5" /> Registrasi Tag Satuan</>
              )}
            </FlameButton>
          </form>
        </div>

        {/* ── Right: Tags Table ──────────────────────────────────── */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-3 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                Daftar Tag RFID ({tagPagination.total})
              </h2>
              {isSuperAdmin && selectedTags.length > 0 && (
                <FlameButton type="button" onClick={handleBulkDisable} disabled={deleting}
                  height={30} flameColor="amber" showArrow={false} text="">
                  <Ban className="w-3 h-3" /> Nonaktifkan ({selectedTags.length})
                </FlameButton>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Status filter chips */}
              <div className="flex gap-1 text-[11px] font-bold">
                {[
                  { id: 'all', label: 'Semua', a: 'bg-slate-800 text-white', ia: 'bg-slate-100 text-slate-600' },
                  { id: 'active', label: 'Aktif', a: 'bg-blue-600 text-white', ia: 'bg-blue-50 text-blue-700' },
                  { id: 'decommissioned', label: 'Nonaktif', a: 'bg-rose-600 text-white', ia: 'bg-rose-50 text-rose-700' },
                ].map(({ id, label, a, ia }) => (
                  <button key={id} type="button" onClick={() => setStatusFilter(id)}
                    className={`px-2 py-1 rounded-lg transition cursor-pointer ${statusFilter === id ? a : ia}`}>
                    {label}
                  </button>
                ))}
              </div>
              {/* Search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input type="text" placeholder="Cari EPC…" value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 w-32" />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-[10px] uppercase tracking-wide">
                  {isSuperAdmin && (
                    <th className="py-2.5 px-3 w-8">
                      <input type="checkbox"
                        checked={filteredTags.length > 0 && selectedTags.length === filteredTags.length}
                        onChange={toggleSelectAll}
                        className="rounded border-slate-300 text-blue-600 cursor-pointer" />
                    </th>
                  )}
                  <th className="py-2.5 px-3">Nomor EPC</th>
                  <th className="py-2.5 px-3">Material Dipetakan</th>
                  <th className="py-2.5 px-3">Tipe Tag</th>
                  <th className="py-2.5 px-3">Lokasi Gudang</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-center">Audit & Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTags.length === 0 ? (
                  <tr>
                    <td colSpan={isSuperAdmin ? 7 : 6} className="py-10 text-center text-slate-400 text-xs">
                      Tidak ada tag yang cocok.
                    </td>
                  </tr>
                ) : (
                  filteredTags.map((t) => {
                    const isSelected = selectedTags.includes(t.epc);
                    const isDecomm = t.status === 'decommissioned';
                    return (
                      <tr key={t.id} className={`hover:bg-slate-50 transition ${isSelected ? 'bg-blue-50/40' : isDecomm ? 'opacity-60' : ''}`}>
                        {isSuperAdmin && (
                          <td className="py-2 px-3">
                            <input type="checkbox" checked={isSelected} onChange={() => toggleSelectTag(t.epc)}
                              className="rounded border-slate-300 text-blue-600 cursor-pointer" />
                          </td>
                        )}
                        <td className="py-2 px-3 font-mono font-bold text-blue-800 text-[10px]">{t.epc}</td>
                        <td className="py-2 px-3 font-medium text-slate-800">{t.item?.name}</td>
                        <td className="py-2 px-3">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold text-[10px]">
                            {t.tag_type === 'anti_metal' ? 'WZ-258 (Logam)' : t.tag_type === 'sticker' ? 'Stiker' : t.tag_type}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-600">{t.warehouse?.name}</td>
                        <td className="py-2 px-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            isDecomm ? 'bg-slate-100 text-slate-500 border-slate-200'
                            : t.status === 'active' || t.status === 'in_stock' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : t.status === 'in_transit' ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
                            {isDecomm ? 'NONAKTIF' : t.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button type="button" title="Audit Trail" onClick={() => handleViewAudit(t.epc)}
                              className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition cursor-pointer">
                              <History className="w-3.5 h-3.5" />
                            </button>
                            {isSuperAdmin && (
                              <>
                                {isDecomm ? (
                                  <button type="button" title="Aktifkan Kembali" aria-label={`Aktifkan kembali tag ${t.epc}`} onClick={() => handleReactivate(t.epc)} disabled={deleting}
                                    className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition cursor-pointer disabled:opacity-50">
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </button>
                                ) : (
                                  <button type="button" title="Nonaktifkan" aria-label={`Nonaktifkan tag ${t.epc}`} onClick={() => handleDisableSingle(t.epc)} disabled={deleting}
                                    className="p-1 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded transition cursor-pointer disabled:opacity-50">
                                    <Ban className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button type="button" title="Hard Delete Permanen" aria-label={`Hapus permanen tag ${t.epc}`} onClick={() => handleHardDelete(t.epc)} disabled={deleting}
                                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer disabled:opacity-50">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
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

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-3 py-2.5 text-xs text-slate-500">
            <span>Halaman {tagPagination.current_page} dari {tagPagination.last_page} · {tagPagination.total} tag</span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => loadData(true, tagPage - 1)} disabled={loading || tagPage <= 1}
                aria-label="Halaman sebelumnya" className="rounded border border-slate-200 p-1.5 disabled:opacity-40">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => loadData(true, tagPage + 1)} disabled={loading || tagPage >= tagPagination.last_page}
                aria-label="Halaman berikutnya" className="rounded border border-slate-200 p-1.5 disabled:opacity-40">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Generate EPC Modal ─────────────────────────────────────── */}
      {showGenerateModal && (
        <Portal>
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[100]">
            <form onSubmit={handleGenerate} className="bg-white rounded-2xl p-5 w-full max-w-md space-y-4 shadow-2xl">
              <div className="flex justify-between items-center">
                <h2 className="font-bold text-slate-800">Generate EPC Custom</h2>
                <button type="button" onClick={() => setShowGenerateModal(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer"><X className="w-5 h-5" /></button>
              </div>
              <select required value={generateForm.item_id}
                onChange={(e) => { const item = items.find((c) => c.id === Number(e.target.value)); setGenerateForm({ ...generateForm, item_id: e.target.value, tag_type: item?.is_metal ? 'anti_metal' : 'sticker' }); }}
                className="w-full p-2.5 border border-slate-200 rounded-xl text-xs">
                <option value="">Pilih jenis barang</option>
                {items.map((item) => <option key={item.id} value={item.id} disabled={!item.epc_prefix}>{item.code} — {item.name}{!item.epc_prefix ? ' (format belum ada)' : ''}</option>)}
              </select>
              <input type="number" required min="1" max="1000" value={generateForm.quantity}
                onChange={(e) => setGenerateForm({ ...generateForm, quantity: e.target.value })}
                className="w-full p-2.5 border border-slate-200 rounded-xl text-xs" placeholder="Jumlah EPC (max 1000)" />
              <input type="text" value={generateForm.notes}
                onChange={(e) => setGenerateForm({ ...generateForm, notes: e.target.value })}
                className="w-full p-2.5 border border-slate-200 rounded-xl text-xs" placeholder="Catatan batch (opsional)" />
              <p className="text-[11px] text-slate-400">Prefix: {items.find((item) => item.id === Number(generateForm.item_id))?.epc_prefix || '-'}…</p>
              <FlameButton disabled={submitting} type="submit" fullWidth height={40} flameColor="blue" showArrow={false}
                text={submitting ? 'Memproses…' : `Generate ${generateForm.quantity} EPC`}
              />
            </form>
          </div>
        </Portal>
      )}

      {/* ── Audit Trail Modal ──────────────────────────────────────── */}
      {auditModalTag && (
        <Portal>
          <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[88vh] shadow-2xl flex flex-col overflow-hidden border border-slate-200">
              <div className="px-5 py-3.5 bg-slate-900 text-white flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-400" />
                  <div>
                    <h3 className="text-sm font-bold">Audit Trail Tag</h3>
                    <p className="text-[11px] text-slate-400 font-mono">{auditModalTag.epc}</p>
                  </div>
                </div>
                <button type="button" onClick={() => setAuditModalTag(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-5 py-3 border-b border-slate-100 grid grid-cols-4 gap-3 text-xs bg-slate-50">
                {[
                  { label: 'Material', value: auditModalTag.item?.name || '-' },
                  { label: 'Gudang', value: auditModalTag.last_warehouse?.name || '-' },
                  { label: 'Tipe', value: auditModalTag.tag_type || '-' },
                  { label: 'Status', value: auditModalTag.status?.toUpperCase() },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">{label}</span>
                    <span className="font-semibold text-slate-800">{value}</span>
                  </div>
                ))}
              </div>

              <div className="p-5 overflow-y-auto flex-1 space-y-3">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-blue-500" />
                    {auditHistory.length} Event Tercatat
                  </h4>
                  <span className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded font-mono font-bold">IMMUTABLE LEDGER</span>
                </div>

                {loadingAudit ? (
                  <div className="py-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                    <RefreshCw className="w-5 h-5 animate-spin text-blue-500" /> Memuat riwayat…
                  </div>
                ) : auditHistory.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">Belum ada riwayat pergerakan.</div>
                ) : (
                  <div className="space-y-2 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-slate-100">
                    {auditHistory.map((ev, i) => (
                      <div key={ev.id || i} className="relative flex items-start gap-3 pl-1 text-xs">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10 text-[10px] font-bold ${
                          ev.action === 'TAG_DECOMMISSIONED' ? 'bg-rose-500 text-white'
                          : ev.action === 'STOCK_IN' ? 'bg-blue-600 text-white'
                          : 'bg-slate-700 text-white'
                        }`}>{i + 1}</div>
                        <div className="bg-white border border-slate-200 rounded-xl p-2.5 w-full">
                          <div className="flex justify-between items-start gap-2 mb-1">
                            <span className={`font-mono font-bold text-[10px] px-1.5 py-0.5 rounded ${
                              ev.action === 'TAG_DECOMMISSIONED' ? 'bg-rose-100 text-rose-700'
                              : ev.action === 'TAG_REACTIVATED' ? 'bg-blue-100 text-blue-700'
                              : 'bg-slate-100 text-slate-700'
                            }`}>{ev.action}</span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(ev.created_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-slate-600 text-[11px]">{ev.notes || 'Tercatat di sistem.'}</p>
                          <div className="text-[10px] text-slate-400 pt-1.5 border-t border-slate-100 flex justify-between mt-1">
                            <span>Oleh: <strong className="text-slate-600">{ev.holder?.name || 'Sistem'}</strong></span>
                            <span>{ev.warehouse?.name || 'Yard Proyek'}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="px-5 py-3 border-t border-slate-100 flex justify-end">
                <button type="button" onClick={() => setAuditModalTag(null)}
                  className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition cursor-pointer">
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
