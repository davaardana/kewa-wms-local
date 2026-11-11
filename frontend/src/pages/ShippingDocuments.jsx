import { FlameButton } from '../components/ui/flame-button';
import React, { useState, useEffect, useCallback } from 'react';
import { shippingApi, masterApi, tagApi } from '../services/api';
import { showToast } from '../components/Toast';
import { showConfirm } from '../components/ConfirmDialog';
import {
  FileText, Plus, CheckCircle, XCircle, Clock, Package,
  ArrowDownCircle, ArrowUpCircle, Search, Filter, Eye,
  ChevronLeft, Tag, Scan, AlertTriangle, RefreshCw,
  Truck, Warehouse as WhIcon, X, Check, Loader2, Box
} from 'lucide-react';

// ─── Status Badge Component ───
const StatusBadge = ({ status }) => {
  const styles = {
    draft: 'bg-slate-100 text-slate-600 border-slate-200',
    approved: 'bg-blue-50 text-blue-700 border-blue-200',
    in_progress: 'bg-amber-50 text-amber-700 border-amber-200',
    completed: 'bg-blue-50 text-blue-700 border-blue-200',
    cancelled: 'bg-red-50 text-red-600 border-red-200',
  };
  const labels = {
    draft: 'Draft',
    approved: 'Disetujui',
    in_progress: 'Sedang Proses',
    completed: 'Selesai',
    cancelled: 'Dibatalkan',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${styles[status] || styles.draft}`}>
      {status === 'completed' && <CheckCircle className="w-3 h-3" />}
      {status === 'in_progress' && <Loader2 className="w-3 h-3 animate-spin" />}
      {status === 'cancelled' && <XCircle className="w-3 h-3" />}
      {labels[status] || status}
    </span>
  );
};

// ─── Progress Bar Component ───
const ProgressBar = ({ scanned, total, compact = false }) => {
  const pct = total > 0 ? Math.round((scanned / total) * 100) : 0;
  const isFull = pct === 100;
  return (
    <div className={compact ? 'w-full' : 'w-full space-y-1'}>
      {!compact && (
        <div className="flex justify-between text-[10px] font-mono text-slate-500">
          <span>{scanned}/{total} tag</span>
          <span className={isFull ? 'text-blue-600 font-bold' : ''}>{pct}%</span>
        </div>
      )}
      <div className={`w-full bg-slate-200 rounded-full overflow-hidden ${compact ? 'h-1.5' : 'h-2'}`}>
        <div
          className={`h-full rounded-full transition-all duration-500 ${isFull ? 'bg-blue-500' : pct > 0 ? 'bg-amber-400' : 'bg-slate-300'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

// ─── Create Document Modal ───
const CreateDocModal = ({ isOpen, onClose, onCreated, warehouses, items }) => {
  const [type, setType] = useState('inbound');
  const [warehouseId, setWarehouseId] = useState('');
  const [notes, setNotes] = useState('');
  const [docItems, setDocItems] = useState([{ item_id: '', expected_qty: 1 }]);
  const [loading, setLoading] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = React.useRef(null);

  const addItem = () => setDocItems([...docItems, { item_id: '', expected_qty: 1 }]);
  const removeItem = (idx) => setDocItems(docItems.filter((_, i) => i !== idx));
  const updateItem = (idx, field, value) => {
    const updated = [...docItems];
    updated[idx][field] = field === 'expected_qty' ? parseInt(value) || 1 : value;
    setDocItems(updated);
  };

  const getFileIcon = (mime) => {
    if (!mime) return '\u{1F4CE}';
    if (mime.includes('pdf')) return '\u{1F4C4}';
    if (mime.includes('word') || mime.includes('doc')) return '\u{1F4DD}';
    if (mime.includes('image')) return '\u{1F5BC}';
    return '\u{1F4CE}';
  };

  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    if (attachments.length + files.length > 5) {
      showToast('Maksimal 5 file lampiran.', 'error');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setUploading(true);
    try {
      const { uploadApi } = await import('../services/api');
      const results = await Promise.all(files.map(f => uploadApi.uploadFile(f, 'shipping_documents')));
      const newAtts = results.map(r => ({
        url: r.data.url,
        original_name: r.data.original_name,
        size: r.data.size,
        mime_type: r.data.mime_type,
      }));
      setAttachments(prev => [...prev, ...newAtts]);
      showToast(`${files.length} file berhasil diunggah.`, 'success');
    } catch (err) {
      showToast('Gagal upload: ' + (err.response?.data?.message || err.message), 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeAttachment = (idx) => setAttachments(prev => prev.filter((_, i) => i !== idx));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validItems = docItems.filter(i => i.item_id && i.expected_qty > 0);
    if (!validItems.length) { showToast('Tambahkan minimal 1 item.', 'error'); return; }
    if (!warehouseId) { showToast('Pilih gudang.', 'error'); return; }
    setLoading(true);
    try {
      const res = await shippingApi.createDocument({
        type,
        warehouse_id: parseInt(warehouseId),
        notes: notes || null,
        items: validItems,
        attachments: attachments.length > 0 ? attachments : null,
      });
      showToast('Dokumen berhasil dibuat!', 'success');
      onCreated(res.data.document);
      onClose();
      setDocItems([{ item_id: '', expected_qty: 1 }]);
      setNotes('');
      setAttachments([]);
      setWarehouseId('');
      setType('inbound');
    } catch (err) {
      showToast(err.response?.data?.message || 'Gagal membuat dokumen.', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Plus className="w-4 h-4 text-blue-600" /> Buat Dokumen Baru
            </h2>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setType('inbound')}
              className={`p-3 rounded-xl border-2 text-center transition ${type === 'inbound' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
              <ArrowDownCircle className={`w-5 h-5 mx-auto mb-1 ${type === 'inbound' ? 'text-blue-600' : 'text-slate-400'}`} />
              <div className="text-xs font-bold">Barang Masuk</div>
              <div className="text-[10px] text-slate-500">Inbound</div>
            </button>
            <button type="button" onClick={() => setType('outbound')}
              className={`p-3 rounded-xl border-2 text-center transition ${type === 'outbound' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
              <ArrowUpCircle className={`w-5 h-5 mx-auto mb-1 ${type === 'outbound' ? 'text-blue-600' : 'text-slate-400'}`} />
              <div className="text-xs font-bold">Barang Keluar</div>
              <div className="text-[10px] text-slate-500">Outbound</div>
            </button>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Gudang</label>
            <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} required
              className="w-full p-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
              <option value="">Pilih gudang...</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-700">Daftar Barang</label>
              <button type="button" onClick={addItem} className="text-[10px] font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1">
                <Plus className="w-3 h-3" /> Tambah
              </button>
            </div>
            <div className="space-y-2">
              {docItems.map((di, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <select value={di.item_id} onChange={e => updateItem(idx, 'item_id', e.target.value)} required
                    className="flex-1 p-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none">
                    <option value="">Pilih item...</option>
                    {items.map(it => <option key={it.id} value={it.id}>{it.name} ({it.code})</option>)}
                  </select>
                  <input type="number" min="1" value={di.expected_qty} onChange={e => updateItem(idx, 'expected_qty', e.target.value)}
                    className="w-20 p-2 border border-slate-200 rounded-lg text-xs text-center focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="Qty" required />
                  {docItems.length > 1 && (
                    <button type="button" onClick={() => removeItem(idx)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Catatan (opsional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full p-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
              placeholder="Catatan tambahan..." />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-700">Lampiran ({attachments.length}/5)</label>
              <span className="text-[10px] text-slate-400">PDF, Word, Gambar - Maks 10MB</span>
            </div>
            {attachments.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {attachments.map((att, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-sm">{getFileIcon(att.mime_type)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium text-slate-700 truncate">{att.original_name}</div>
                      <div className="text-[10px] text-slate-400">{formatSize(att.size)}</div>
                    </div>
                    <button type="button" onClick={() => removeAttachment(idx)}
                      className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded flex-shrink-0">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {attachments.length < 5 && (
              <>
                <input ref={fileRef} type="file" id="doc-attach-input"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                  multiple className="hidden" onChange={handleFileChange} />
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="w-full py-2.5 border-2 border-dashed border-slate-300 rounded-xl text-xs font-semibold text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition flex items-center justify-center gap-2 disabled:opacity-60">
                  {uploading
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Mengupload...</>
                    : <><Plus className="w-3.5 h-3.5" /> Tambah Lampiran</>}
                </button>
              </>
            )}
          </div>

          <FlameButton type="submit" disabled={loading || uploading}
            fullWidth height={42} flameColor="blue" showArrow={false}
            text={loading ? 'Membuat...' : 'Buat Dokumen'}
          />
        </form>
      </div>
    </div>
  );
};

// ─── Assign Tags Modal ───
const AssignTagsModal = ({ isOpen, onClose, document: doc, onAssigned }) => {
  const [allTags, setAllTags] = useState([]);
  const [selectedItem, setSelectedItem] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchEpc, setSearchEpc] = useState('');

  useEffect(() => {
    if (isOpen && doc) {
      const tagStatus = doc.type === 'outbound' ? 'attached' : 'active';
      tagApi.getTags({ status: tagStatus, per_page: 500 }).then(res => {
        const tagList = res.data?.data || res.data || [];
        setAllTags(Array.isArray(tagList) ? tagList : []);
      }).catch(() => setAllTags([]));
    }
  }, [isOpen, doc]);

  // Filter tags by selected item
  const filteredTags = allTags.filter(t => {
    if (selectedItem && t.item_id !== parseInt(selectedItem)) return false;
    if (searchEpc && !t.epc.toLowerCase().includes(searchEpc.toLowerCase())) return false;
    // Exclude already assigned tags
    const assignedEpcs = (doc?.tags || []).map(dt => dt.tag_epc);
    if (assignedEpcs.includes(t.epc)) return false;
    return true;
  });

  const toggleTag = (epc) => {
    setSelectedTags(prev => prev.includes(epc) ? prev.filter(e => e !== epc) : [...prev, epc]);
  };

  const handleAssign = async () => {
    if (!selectedTags.length || !selectedItem) {
      showToast('Pilih item dan minimal 1 tag.', 'error');
      return;
    }
    setLoading(true);
    try {
      const tags = selectedTags.map(epc => ({
        epc,
        document_item_id: parseInt(selectedItem),
      }));
      const res = await shippingApi.assignTags(doc.id, tags);
      showToast(res.data.message, 'success');
      if (res.data.errors?.length) {
        res.data.errors.forEach(e => showToast(e, 'error'));
      }
      setSelectedTags([]);
      onAssigned();
    } catch (err) {
      showToast(err.response?.data?.message || 'Gagal assign tag.', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !doc) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Tag className="w-4 h-4 text-blue-600" /> Assign Tag RFID
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 space-y-3 flex-1 overflow-y-auto">
          {/* Select document item */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Pilih Item Dokumen</label>
            <select value={selectedItem} onChange={e => { setSelectedItem(e.target.value); setSelectedTags([]); }}
              className="w-full p-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none">
              <option value="">Pilih item...</option>
              {(doc.items || []).map(di => (
                <option key={di.id} value={di.id}>{di.item?.name || 'Item'} — butuh {di.expected_qty} tag</option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input value={searchEpc} onChange={e => setSearchEpc(e.target.value)} placeholder="Cari EPC..."
              className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          </div>

          {/* Tag list */}
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {filteredTags.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-400">
                {selectedItem ? 'Tidak ada tag tersedia untuk item ini.' : 'Pilih item terlebih dahulu.'}
              </div>
            ) : (
              filteredTags.map(t => (
                <label key={t.epc} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition ${selectedTags.includes(t.epc) ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50 border border-transparent'}`}>
                  <input type="checkbox" checked={selectedTags.includes(t.epc)} onChange={() => toggleTag(t.epc)}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                  <code className="text-[11px] font-mono text-slate-700">{t.epc}</code>
                </label>
              ))
            )}
          </div>

          {selectedTags.length > 0 && (
            <div className="text-xs text-blue-600 font-semibold">{selectedTags.length} tag dipilih</div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 flex-shrink-0">
          <FlameButton onClick={handleAssign} disabled={loading || !selectedTags.length}
            fullWidth height={42} flameColor="blue" showArrow={false}
            text={loading ? 'Menyimpan...' : `Assign ${selectedTags.length} Tag`}
          />
        </div>
      </div>
    </div>
  );
};


// ─── Document Detail View ───
const DocumentDetail = ({ docId, onBack, currentUser }) => {
  const [doc, setDoc] = useState(null);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState('');

  const fetchDoc = useCallback(async () => {
    try {
      const res = await shippingApi.getDocument(docId);
      setDoc(res.data.document);
      setProgress(res.data.progress);
    } catch (err) {
      showToast('Gagal memuat dokumen.', 'error');
    } finally {
      setLoading(false);
    }
  }, [docId]);

  useEffect(() => { fetchDoc(); }, [fetchDoc]);

  // Auto-refresh every 5s when in_progress
  useEffect(() => {
    if (doc?.status !== 'in_progress') return;
    const interval = setInterval(fetchDoc, 5000);
    return () => clearInterval(interval);
  }, [doc?.status, fetchDoc]);

  const handleApprove = async () => {
    const ok = await showConfirm({ title: 'Approve Dokumen', message: 'Yakin approve dokumen ini? Setelah approve, PIC Lapangan bisa mulai assign tag.', confirmText: 'Approve' });
    if (!ok) return;
    setActionLoading('approve');
    try {
      await shippingApi.approveDocument(doc.id);
      showToast('Dokumen berhasil di-approve!', 'success');
      fetchDoc();
    } catch (err) {
      showToast(err.response?.data?.message || 'Gagal approve.', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const handleComplete = async () => {
    const ok = await showConfirm({ title: 'Selesaikan Dokumen', message: 'Semua tag sudah cocok. ACC dokumen ini?', confirmText: 'ACC & Selesaikan' });
    if (!ok) return;
    setActionLoading('complete');
    try {
      await shippingApi.completeDocument(doc.id);
      showToast('Dokumen selesai! Semua tag cocok ✓', 'success');
      fetchDoc();
    } catch (err) {
      showToast(err.response?.data?.message || 'Gagal menyelesaikan.', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const handleCancel = async () => {
    const ok = await showConfirm({ title: 'Batalkan Dokumen', message: 'Yakin membatalkan dokumen ini?', confirmText: 'Batalkan', type: 'danger' });
    if (!ok) return;
    setActionLoading('cancel');
    try {
      await shippingApi.cancelDocument(doc.id);
      showToast('Dokumen dibatalkan.', 'success');
      fetchDoc();
    } catch (err) {
      showToast(err.response?.data?.message || 'Gagal membatalkan.', 'error');
    } finally {
      setActionLoading('');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="text-center py-20 text-slate-400 text-sm">Dokumen tidak ditemukan.</div>
    );
  }

  const canApprove = ['pm', 'superadmin'].includes(currentUser?.role) && doc.status === 'draft';
  const canAssignTags = ['pic_lapangan', 'pm', 'superadmin'].includes(currentUser?.role) && ['approved', 'in_progress'].includes(doc.status);
  const canComplete = ['pic_lapangan', 'superadmin'].includes(currentUser?.role) && doc.status === 'in_progress' && progress?.is_complete;
  const canCancel = ['pm', 'superadmin'].includes(currentUser?.role) && doc.status !== 'completed';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 transition">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-bold text-slate-800 truncate">{doc.document_number}</h2>
            <StatusBadge status={doc.status} />
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${doc.type === 'inbound' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
              {doc.type === 'inbound' ? <ArrowDownCircle className="w-3 h-3" /> : <ArrowUpCircle className="w-3 h-3" />}
              {doc.type === 'inbound' ? 'Masuk' : 'Keluar'}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Dibuat oleh {doc.creator?.name} • Gudang: {doc.warehouse?.name}
            {doc.approver && ` • Disetujui oleh ${doc.approver.name}`}
          </div>
        </div>
        <button onClick={fetchDoc} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 transition" title="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Progress Card */}
      {progress && doc.status !== 'draft' && (
        <div className={`p-4 rounded-xl border-2 ${progress.is_complete ? 'bg-blue-50 border-blue-300' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Scan className={`w-4 h-4 ${progress.is_complete ? 'text-blue-600' : 'text-amber-500'}`} />
              <span className="text-sm font-bold text-slate-800">Progress Scan Gate</span>
            </div>
            <span className={`text-lg font-black ${progress.is_complete ? 'text-blue-600' : 'text-amber-600'}`}>
              {progress.percentage}%
            </span>
          </div>
          <ProgressBar scanned={progress.scanned_tags} total={progress.total_tags} />
          {progress.missing_tags > 0 && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-600">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{progress.missing_tags} tag belum terbaca — barang harus lewat gate</span>
            </div>
          )}
          {progress.is_complete && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-blue-700 font-semibold">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Semua tag terbaca! Siap untuk ACC.</span>
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        {canApprove && (
          <FlameButton onClick={handleApprove} disabled={actionLoading === 'approve'}
            height={36} flameColor="blue" showArrow={false} text="">
            <Check className="w-3.5 h-3.5" /> {actionLoading === 'approve' ? 'Meng-approve...' : 'Approve Dokumen'}
          </FlameButton>
        )}
        {canAssignTags && (
          <FlameButton onClick={() => setAssignModalOpen(true)}
            height={36} flameColor="blue" showArrow={false} text="">
            <Tag className="w-3.5 h-3.5" /> Assign Tag RFID
          </FlameButton>
        )}
        {canComplete && (
          <FlameButton onClick={handleComplete} disabled={actionLoading === 'complete'}
            height={36} flameColor="green" showArrow={false} text="">
            <CheckCircle className="w-3.5 h-3.5" /> {actionLoading === 'complete' ? 'Menyelesaikan...' : 'ACC — Selesaikan'}
          </FlameButton>
        )}
        {canCancel && doc.status !== 'cancelled' && (
          <FlameButton onClick={handleCancel} disabled={actionLoading === 'cancel'}
            height={36} flameColor="rose" showArrow={false} text="">
            <XCircle className="w-3.5 h-3.5" /> Batalkan
          </FlameButton>
        )}
      </div>

      {/* Items Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <Package className="w-4 h-4 text-slate-500" />
          <span className="text-xs font-bold text-slate-700">Daftar Barang ({doc.items?.length || 0} item)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wider">
                <th className="px-4 py-2.5 text-left font-semibold">Item</th>
                <th className="px-4 py-2.5 text-center font-semibold">Target</th>
                <th className="px-4 py-2.5 text-center font-semibold">Terbaca</th>
                <th className="px-4 py-2.5 text-center font-semibold">Progress</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(doc.items || []).map(di => (
                <tr key={di.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-800">{di.item?.name || '—'}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{di.item?.code}</div>
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-slate-700">{di.expected_qty}</td>
                  <td className="px-4 py-3 text-center font-bold">
                    <span className={di.scanned_qty >= di.expected_qty ? 'text-blue-600' : 'text-amber-600'}>
                      {di.scanned_qty}
                    </span>
                  </td>
                  <td className="px-4 py-3 w-32">
                    <ProgressBar scanned={di.scanned_qty} total={di.expected_qty} compact />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tags Detail */}
      {doc.tags && doc.tags.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <Tag className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-bold text-slate-700">Tag RFID ({doc.tags.length} tag)</span>
          </div>
          <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
            {doc.tags.map(dt => (
              <div key={dt.id} className={`px-4 py-2.5 flex items-center justify-between ${dt.status === 'scanned' ? 'bg-blue-50/50' : ''}`}>
                <div className="flex items-center gap-2">
                  {dt.status === 'scanned'
                    ? <CheckCircle className="w-3.5 h-3.5 text-blue-500" />
                    : <Clock className="w-3.5 h-3.5 text-amber-400" />}
                  <code className="text-[11px] font-mono text-slate-700">{dt.tag_epc}</code>
                </div>
                <div className="text-[10px] text-slate-500">
                  {dt.status === 'scanned'
                    ? <span className="text-blue-600">Terbaca {dt.scanned_at ? new Date(dt.scanned_at).toLocaleString('id-ID') : ''}</span>
                    : <span className="text-amber-600">Menunggu scan...</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {doc.notes && (
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Catatan</div>
          <div className="text-xs text-slate-700">{doc.notes}</div>
        </div>
      )}


      {/* Attachments */}
      {doc.attachments && doc.attachments.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Lampiran</div>
          <div className="space-y-2">
            {doc.attachments.map((att, idx) => {
              const icon = att.mime_type?.includes('pdf') ? '📄'
                : att.mime_type?.includes('word') || att.mime_type?.includes('doc') ? '📝'
                : att.mime_type?.includes('image') ? '🖼️' : '📎';
              const sizeLabel = att.size
                ? att.size < 1024*1024 ? `${(att.size/1024).toFixed(1)} KB` : `${(att.size/(1024*1024)).toFixed(1)} MB`
                : '';
              return (
                <a key={idx} href={att.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition group">
                  <span className="text-lg leading-none">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-semibold text-slate-700 group-hover:text-blue-700 truncate">{att.original_name}</div>
                    {sizeLabel && <div className="text-[10px] text-slate-400">{sizeLabel}</div>}
                  </div>
                  <span className="text-[10px] text-blue-500 font-semibold opacity-0 group-hover:opacity-100 transition">Buka</span>
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* Assign Tags Modal */}
      <AssignTagsModal
        isOpen={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        document={doc}
        onAssigned={() => { setAssignModalOpen(false); fetchDoc(); }}
      />
    </div>
  );
};


// ─── Main ShippingDocuments Page ───
export default function ShippingDocuments({ currentUser }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [warehouses, setWarehouses] = useState([]);
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ current_page: 1, last_page: 1 });

  const fetchDocs = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, per_page: 15 };
      if (statusFilter) params.status = statusFilter;
      if (typeFilter) params.type = typeFilter;
      if (searchQuery) params.search = searchQuery;

      const res = await shippingApi.getDocuments(params);
      setDocs(res.data.data || []);
      setPagination({ current_page: res.data.current_page || 1, last_page: res.data.last_page || 1 });
    } catch (err) {
      showToast('Gagal memuat daftar dokumen.', 'error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, searchQuery]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  useEffect(() => {
    masterApi.getWarehouses().then(res => setWarehouses(res.data?.data || res.data || [])).catch(() => {});
    masterApi.getItems().then(res => setItems(res.data?.data || res.data || [])).catch(() => {});
  }, []);

  // If viewing detail
  if (selectedDocId) {
    return (
      <DocumentDetail
        docId={selectedDocId}
        onBack={() => { setSelectedDocId(null); fetchDocs(); }}
        currentUser={currentUser}
      />
    );
  }

  const canCreate = ['pm', 'superadmin'].includes(currentUser?.role);
  const statusTabs = [
    { value: '', label: 'Semua', icon: null },
    { value: 'draft', label: 'Draft', icon: Clock },
    { value: 'approved', label: 'Disetujui', icon: Check },
    { value: 'in_progress', label: 'Proses', icon: Loader2 },
    { value: 'completed', label: 'Selesai', icon: CheckCircle },
  ];

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-black text-slate-800 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            Dokumen Barang
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
          </p>
        </div>
        {canCreate && (
          <FlameButton onClick={() => setCreateModalOpen(true)}
            height={36} flameColor="blue" showArrow={false} text="">
            <Plus className="w-4 h-4" /> Buat Dokumen
          </FlameButton>
        )}
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Status tabs */}
        <div className="flex bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          {statusTabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.value} onClick={() => setStatusFilter(tab.value)}
                className={`px-3 py-1.5 text-[11px] font-semibold flex items-center gap-1 transition ${statusFilter === tab.value ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                {Icon && <Icon className="w-3 h-3" />} {tab.label}
              </button>
            );
          })}
        </div>

        {/* Type filter */}
        <div className="flex bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <button onClick={() => setTypeFilter('')}
            className={`px-3 py-1.5 text-[11px] font-semibold transition ${!typeFilter ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
            Semua
          </button>
          <button onClick={() => setTypeFilter('inbound')}
            className={`px-3 py-1.5 text-[11px] font-semibold flex items-center gap-1 transition ${typeFilter === 'inbound' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
            <ArrowDownCircle className="w-3 h-3" /> Masuk
          </button>
          <button onClick={() => setTypeFilter('outbound')}
            className={`px-3 py-1.5 text-[11px] font-semibold flex items-center gap-1 transition ${typeFilter === 'outbound' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
            <ArrowUpCircle className="w-3 h-3" /> Keluar
          </button>
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Cari no. dokumen..."
            className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-xs" />
        </div>
      </div>

      {/* Documents List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
        </div>
      ) : docs.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <div className="text-sm font-semibold text-slate-500">Belum ada dokumen</div>
          <div className="text-xs text-slate-400 mt-1">
            {canCreate ? 'Klik "Buat Dokumen" untuk memulai.' : 'Dokumen dari PM akan muncul di sini.'}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => (
            <button key={doc.id} onClick={() => setSelectedDocId(doc.id)}
              className="w-full bg-white rounded-xl border border-slate-200 p-4 text-left hover:border-blue-300 hover:shadow-md transition group cursor-pointer">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${doc.type === 'inbound' ? 'bg-blue-100 text-blue-600' : 'bg-blue-100 text-blue-600'}`}>
                    {doc.type === 'inbound' ? <ArrowDownCircle className="w-4 h-4" /> : <ArrowUpCircle className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-800 group-hover:text-blue-700 transition">{doc.document_number}</span>
                      <StatusBadge status={doc.status} />
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                      {doc.creator?.name} • {doc.warehouse?.name} • {doc.items_count || 0} item
                    </div>
                  </div>
                </div>

                {/* Progress mini */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  {(doc.total_tags > 0 || doc.status === 'in_progress') && (
                    <div className="w-24">
                      <ProgressBar scanned={doc.scanned_tags || 0} total={doc.total_tags || 0} compact />
                      <div className="text-[9px] text-slate-400 text-right mt-0.5 font-mono">
                        {doc.scanned_tags || 0}/{doc.total_tags || 0}
                      </div>
                    </div>
                  )}
                  <Eye className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition" />
                </div>
              </div>
            </button>
          ))}

          {/* Pagination */}
          {pagination.last_page > 1 && (
            <div className="flex justify-center gap-2 pt-2">
              {Array.from({ length: pagination.last_page }, (_, i) => i + 1).map(page => (
                <button key={page} onClick={() => fetchDocs(page)}
                  className={`w-8 h-8 rounded-lg text-xs font-bold transition ${page === pagination.current_page ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                  {page}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Modal */}
      <CreateDocModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={() => fetchDocs()}
        warehouses={warehouses}
        items={items}
      />
    </div>
  );
}
