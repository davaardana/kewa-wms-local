import { FlameButton } from '../components/ui/flame-button';
import React, { useState, useEffect, useCallback, useTransition } from 'react';
import { shippingApi, masterApi, tagApi } from '../services/api';
import { showToast } from '../components/Toast';
import { showConfirm } from '../components/ConfirmDialog';
import { SkeletonTable } from '../components/ui/skeleton-loader';
import {
  FileText, Plus, CheckCircle, XCircle, Clock, Package,
  ArrowDownCircle, ArrowUpCircle, Search, Filter, Eye,
  ChevronLeft, Tag, Scan, AlertTriangle, RefreshCw,
  Truck, Warehouse as WhIcon, X, Check, Loader2, Box, ShieldCheck, Pencil, Trash2,
  LayoutGrid, List
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
const CreateDocModal = ({ isOpen, onClose, onCreated, warehouses, items, documentToEdit = null }) => {
  const isOperationalEdit = Boolean(documentToEdit && documentToEdit.status !== 'draft');
  const [type, setType] = useState('inbound');
  const [warehouseId, setWarehouseId] = useState('');
  const [notes, setNotes] = useState('');
  const [docItems, setDocItems] = useState([{ item_id: '', expected_qty: 1 }]);
  const [loading, setLoading] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = React.useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    if (documentToEdit) {
      setType(documentToEdit.type || 'inbound');
      setWarehouseId(String(documentToEdit.warehouse_id || ''));
      setNotes(documentToEdit.notes || '');
      setDocItems((documentToEdit.items || []).map(item => ({ item_id: String(item.item_id), expected_qty: Number(item.expected_qty) || 1 })));
      setAttachments(documentToEdit.attachments || []);
    } else {
      setType('inbound');
      setWarehouseId('');
      setNotes('');
      setDocItems([{ item_id: '', expected_qty: 1 }]);
      setAttachments([]);
    }
  }, [isOpen, documentToEdit]);

  const addItem = () => setDocItems([...docItems, { item_id: '', expected_qty: 1 }]);
  const removeItem = (idx) => setDocItems(docItems.filter((_, i) => i !== idx));
  const updateItem = (idx, field, value) => {
    const updated = [...docItems];
    if (field === 'item_id' && value && updated.some((item, itemIdx) => itemIdx !== idx && item.item_id === value)) {
      showToast('Barang tersebut sudah dipilih. Ubah jumlah pada baris yang sudah ada.', 'error');
      return;
    }
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
      const payload = isOperationalEdit
        ? { notes: notes || null, attachments: attachments.length > 0 ? attachments : null }
        : {
            type,
            warehouse_id: parseInt(warehouseId),
            notes: notes || null,
            items: validItems,
            attachments: attachments.length > 0 ? attachments : null,
          };
      const res = documentToEdit
        ? await shippingApi.updateDocument(documentToEdit.id, payload)
        : await shippingApi.createDocument(payload);
      showToast(documentToEdit ? 'Draft dokumen berhasil diperbarui.' : 'Dokumen berhasil dibuat!', 'success');
      onCreated(res.data.document);
      onClose();
    } catch (err) {
      showToast(err.response?.data?.message || 'Gagal membuat dokumen.', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[calc(100vw-2rem)] max-w-lg max-h-[92vh] overflow-x-hidden overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Plus className="w-4 h-4 text-blue-600" /> {documentToEdit ? (isOperationalEdit ? 'Edit Catatan/Lampiran' : 'Edit Draft Dokumen') : 'Buat Dokumen Baru'}
            </h2>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={isOperationalEdit} onClick={() => setType('inbound')}
              className={`p-3 rounded-xl border-2 text-center transition disabled:cursor-not-allowed disabled:opacity-70 ${type === 'inbound' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
              <ArrowDownCircle className={`w-5 h-5 mx-auto mb-1 ${type === 'inbound' ? 'text-blue-600' : 'text-slate-400'}`} />
              <div className="text-xs font-bold">Barang Masuk</div>
              <div className="text-[10px] text-slate-500">Inbound</div>
            </button>
            <button type="button" disabled={isOperationalEdit} onClick={() => setType('outbound')}
              className={`p-3 rounded-xl border-2 text-center transition disabled:cursor-not-allowed disabled:opacity-70 ${type === 'outbound' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
              <ArrowUpCircle className={`w-5 h-5 mx-auto mb-1 ${type === 'outbound' ? 'text-blue-600' : 'text-slate-400'}`} />
              <div className="text-xs font-bold">Barang Keluar</div>
              <div className="text-[10px] text-slate-500">Outbound</div>
            </button>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Gudang</label>
            <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} required disabled={isOperationalEdit}
              className="w-full p-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
              <option value="">Pilih gudang...</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-700">Daftar Barang</label>
              {!isOperationalEdit && <button type="button" onClick={addItem} className="text-[10px] font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1">
                <Plus className="w-3 h-3" /> Tambah
              </button>}
            </div>
            <div className="space-y-2">
              {docItems.map((di, idx) => (
                <div key={idx} className="min-w-0 p-3 border border-slate-200 rounded-xl bg-slate-50/60 space-y-2">
                  <div className="flex min-w-0 gap-2 items-center">
                    <select value={di.item_id} onChange={e => updateItem(idx, 'item_id', e.target.value)} required disabled={isOperationalEdit}
                      className="min-w-0 w-full flex-1 p-2 border border-slate-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none">
                      <option value="">Pilih item...</option>
                      {items.map(it => {
                        const selectedElsewhere = docItems.some((item, itemIdx) => itemIdx !== idx && item.item_id === String(it.id));
                        return <option key={it.id} value={it.id} disabled={selectedElsewhere}>{it.name} ({it.code})</option>;
                      })}
                    </select>
                    {!isOperationalEdit && docItems.length > 1 && (
                      <button type="button" onClick={() => removeItem(idx)} aria-label="Hapus item" className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <label className="min-w-0 flex-1 text-[10px] font-semibold text-slate-600 break-words leading-4">
                      Jumlah {di.item_id ? items.find(it => String(it.id) === di.item_id)?.name || 'barang' : 'barang'}
                    </label>
                    <input type="number" min="1" value={di.expected_qty} onChange={e => updateItem(idx, 'expected_qty', e.target.value)} disabled={isOperationalEdit}
                      className="w-24 shrink-0 p-2 border border-slate-200 rounded-lg text-xs text-center bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      placeholder="Jumlah" required />
                    <span className="text-[10px] text-slate-400">unit</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 text-[10px] text-slate-500">
              {docItems.filter(item => item.item_id).length} jenis barang, {docItems.reduce((total, item) => total + (item.item_id ? item.expected_qty : 0), 0)} total unit.
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
            text={loading ? 'Menyimpan...' : documentToEdit ? 'Simpan Perubahan' : 'Buat Dokumen'}
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
  const [loadingTags, setLoadingTags] = useState(false);
  const [tagLoadError, setTagLoadError] = useState(false);
  const [searchEpc, setSearchEpc] = useState('');

  useEffect(() => {
    const documentItem = (doc?.items || []).find(item => Number(item.id) === Number(selectedItem));
    if (!isOpen || !doc || !documentItem) {
      setAllTags([]);
      setLoadingTags(false);
      setTagLoadError(false);
      return undefined;
    }

    let cancelled = false;
    setLoadingTags(true);
    setTagLoadError(false);
    // OUTBOUND: tag di gudang berstatus 'attached' (sudah stock-in).
    // INBOUND: tag dari vendor berstatus 'active' (belum ada di gudang mana pun).
    const tagStatus = doc.type === 'outbound' ? 'attached' : 'active';
    tagApi.getTags({
      status: tagStatus,
      item_id: documentItem.item_id,
      ...(doc.type === 'outbound' ? { warehouse_id: doc.warehouse_id } : {}),
    }).then(res => {
      if (cancelled) return;
      const tagList = res.data?.data || res.data || [];
      setAllTags(Array.isArray(tagList) ? tagList : []);
    }).catch(() => {
      if (cancelled) return;
      setAllTags([]);
      setTagLoadError(true);
    }).finally(() => {
      if (!cancelled) setLoadingTags(false);
    });

    return () => { cancelled = true; };
  }, [isOpen, doc, selectedItem]);

  // Tag availability is fetched by catalog item_id; selectedItem is a document-item ID.
  const filteredTags = allTags.filter(t => {
    if (searchEpc && !t.epc.toLowerCase().includes(searchEpc.toLowerCase())) return false;
    // Exclude already assigned tags
    const assignedEpcs = (doc?.tags || []).map(dt => dt.tag_epc);
    if (assignedEpcs.includes(t.epc)) return false;
    return true;
  });

  const toggleTag = (epc) => {
    const documentItem = (doc?.items || []).find(item => Number(item.id) === Number(selectedItem));
    const alreadyAssigned = (doc?.tags || []).filter(tag => Number(tag.shipping_document_item_id) === Number(selectedItem)).length;
    const remaining = Math.max(0, Number(documentItem?.expected_qty || 0) - alreadyAssigned);
    if (selectedTags.includes(epc)) {
      setSelectedTags(prev => prev.filter(e => e !== epc));
      return;
    }
    if (selectedTags.length >= remaining) {
      showToast(`Item ini hanya memerlukan ${remaining} tag lagi.`, 'warning');
      return;
    }
    setSelectedTags(prev => [...prev, epc]);
  };

  // Pilih semua tag yang tampil (dibatasi oleh sisa kuota item)
  const handleSelectAll = () => {
    const documentItem = (doc?.items || []).find(item => Number(item.id) === Number(selectedItem));
    const alreadyAssigned = (doc?.tags || []).filter(tag => Number(tag.shipping_document_item_id) === Number(selectedItem)).length;
    const remaining = Math.max(0, Number(documentItem?.expected_qty || 0) - alreadyAssigned);
    const allVisible = filteredTags.map(t => t.epc);
    const allSelected = allVisible.every(epc => selectedTags.includes(epc));

    if (allSelected) {
      // Batal semua — hapus hanya yang visible
      setSelectedTags(prev => prev.filter(epc => !allVisible.includes(epc)));
    } else {
      // Pilih semua visible, dibatasi kuota tersisa
      const newEpcs = allVisible.filter(epc => !selectedTags.includes(epc));
      const canAdd   = remaining - selectedTags.length;
      if (canAdd <= 0) {
        showToast(`Kuota item sudah penuh (${remaining} tag).`, 'warning');
        return;
      }
      const toAdd = newEpcs.slice(0, canAdd);
      if (newEpcs.length > canAdd) {
        showToast(`Hanya ${canAdd} tag lagi yang bisa dipilih (kuota ${remaining}).`, 'warning');
      }
      setSelectedTags(prev => [...prev, ...toAdd]);
    }
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

          {/* Tag list header: select-all + counter */}
          {selectedItem && !loadingTags && filteredTags.length > 0 && (() => {
            const documentItem = (doc?.items || []).find(item => Number(item.id) === Number(selectedItem));
            const alreadyAssigned = (doc?.tags || []).filter(tag => Number(tag.shipping_document_item_id) === Number(selectedItem)).length;
            const remaining = Math.max(0, Number(documentItem?.expected_qty || 0) - alreadyAssigned);
            const visibleEpcs = filteredTags.map(t => t.epc);
            const allVisibleSelected = visibleEpcs.length > 0 && visibleEpcs.every(epc => selectedTags.includes(epc));
            const someSelected = visibleEpcs.some(epc => selectedTags.includes(epc));
            return (
              <div className="flex items-center justify-between py-1 px-1">
                <label className="flex items-center gap-2 cursor-pointer select-none" onClick={handleSelectAll}>
                  <input
                    type="checkbox"
                    readOnly
                    checked={allVisibleSelected}
                    ref={el => { if (el) el.indeterminate = someSelected && !allVisibleSelected; }}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <span className="text-xs font-semibold text-slate-600">
                    {allVisibleSelected ? 'Batal Semua' : 'Pilih Semua'}
                  </span>
                </label>
                <span className="text-xs text-slate-400">
                  <span className={`font-semibold ${selectedTags.length > 0 ? 'text-blue-600' : 'text-slate-500'}`}>{selectedTags.length}</span>
                  <span className="text-slate-400"> / {remaining} tag dipilih</span>
                </span>
              </div>
            );
          })()}

          {/* Tag list */}
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {loadingTags ? (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Memuat tag...</div>
            ) : filteredTags.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-400">
                {tagLoadError ? 'Gagal memuat tag. Coba pilih ulang item.' : selectedItem ? 'Tidak ada tag aktif untuk item ini.' : 'Pilih item terlebih dahulu.'}
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
const DocumentDetail = ({ docId, onBack, currentUser, warehouses, items }) => {
  const [doc, setDoc] = useState(null);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const fetchInFlightRef = React.useRef(false);
  const fetchErrorShownRef = React.useRef(false);
  // Track last known scanned_tags count to detect new gate approvals for toast notification
  const lastScannedTagsRef = React.useRef(null);

  const fetchDoc = useCallback(async () => {
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    try {
      const res = await shippingApi.getDocument(docId);
      const freshDoc = res.data.document;
      // Fix B+F: push notification saat tag baru terbaca oleh gate
      const freshScanned = freshDoc.scanned_tags ?? 0;
      if (lastScannedTagsRef.current !== null && freshScanned > lastScannedTagsRef.current) {
        const delta = freshScanned - lastScannedTagsRef.current;
        showToast(`✅ Gate menyetujui ${delta} tag baru — progress: ${freshScanned}/${freshDoc.total_tags}`, 'success');
      }
      lastScannedTagsRef.current = freshScanned;
      setDoc(freshDoc);
      setProgress(res.data.progress);
      fetchErrorShownRef.current = false;
    } catch (err) {
      if (!fetchErrorShownRef.current) {
        showToast('Gagal memuat dokumen.', 'error');
        fetchErrorShownRef.current = true;
      }
    } finally {
      fetchInFlightRef.current = false;
      setLoading(false);
    }
  }, [docId]);

  useEffect(() => { fetchDoc(); }, [fetchDoc]);

  // Fix B: Ganti polling 1s dengan SSE /gate/stream untuk dokumen in_progress.
  // SSE jauh lebih efisien — koneksi long-poll tunggal daripada 1 request/detik.
  // Saat SSE menerima event gate yang cocok dengan dokumen ini, trigger fetchDoc()
  // untuk memperbarui progress. Fallback ke polling 3.5s jika SSE tidak tersedia.
  // Fix C: Aktifkan SSE juga untuk status 'approved' — gate scan pertama mengubah
  // status dari approved → in_progress; tanpa SSE, perubahan ini tidak terdeteksi UI.
  useEffect(() => {
    if (!['draft', 'approved', 'in_progress'].includes(doc?.status)) return;

    let isDisposed = false;
    let sseController = null;
    let sseConnecting = false;
    let pollTimer = null;
    let sseReconnectTimer = null;

    const getApiBase = () => {
      if (typeof window === 'undefined') return '/api';
      if (window.location.port !== '5173') return '/api';
      return `http://${window.location.hostname}:8000/api`;
    };

    const startSse = async () => {
      if (isDisposed || sseConnecting) return;
      sseConnecting = true;
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }

      sseController = new AbortController();
      try {
        const endpoint = new URL(`${getApiBase().replace(/\/$/, '')}/gate/stream`, window.location.origin);
        const token = localStorage.getItem('mosa_token');
        const response = await fetch(endpoint.toString(), {
          headers: { Accept: 'text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          signal: sseController.signal,
        });
        if (!response.ok || !response.body) throw new Error(`SSE ${response.status}`);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (!isDisposed) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
          const frames = buffer.split('\n\n');
          buffer = frames.pop() || '';
          for (const frame of frames) {
            const dataLines = [];
            frame.split('\n').forEach((line) => {
              if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
            });
            if (!dataLines.length) continue;
            try {
              const payload = JSON.parse(dataLines.join(''));
              const events = Array.isArray(payload) ? payload : [payload];
              // Cek apakah ada event gate yang cocok dengan dokumen ini
              // Gunakan == (loose) untuk handle integer vs string comparison
              const relevant = events.some(
                // eslint-disable-next-line eqeqeq
                (e) => e.shipping_document_id == docId
              );
              if (relevant) fetchDoc();
            } catch (_) { /* skip invalid frames */ }
          }
        }
      } catch (err) {
        if (!isDisposed && err.name !== 'AbortError') {
          // Fallback ke polling jika SSE gagal (e.g., proxy tidak support streaming)
          if (!pollTimer) {
            pollTimer = setInterval(() => {
              if (!isDisposed) fetchDoc();
            }, 3500);
          }
          // Coba reconnect SSE setelah 5 detik
          sseReconnectTimer = setTimeout(() => {
            sseConnecting = false;
            if (!isDisposed) startSse();
          }, 5000);
          return;
        }
      }
      sseConnecting = false;
      if (!isDisposed) {
        // SSE stream ditutup server (55s window) — reconnect segera
        sseReconnectTimer = setTimeout(() => {
          if (!isDisposed) startSse();
        }, 250);
      }
    };

    startSse();

    return () => {
      isDisposed = true;
      if (sseController) sseController.abort();
      if (pollTimer) clearInterval(pollTimer);
      if (sseReconnectTimer) clearTimeout(sseReconnectTimer);
    };
  }, [doc?.status, docId, fetchDoc]);

  const handleApprove = async () => {
    const ok = await showConfirm({
      title: 'ACC & Selesaikan Dokumen',
      message: `Approve dan selesaikan dokumen ini? Semua tag yang telah terbaca oleh gate akan dikonfirmasi. Status akan menjadi "Selesai" dan tidak dapat diubah kembali.`,
      confirmText: 'ACC & Selesaikan',
    });
    if (!ok) return;
    setActionLoading('approve');
    // Optimistic UI
    const prevDoc = doc;
    setDoc(d => ({ ...d, status: 'completed' }));
    try {
      await shippingApi.approveDocument(doc.id);
      showToast('Dokumen berhasil di-approve dan diselesaikan!', 'success');
      fetchDoc(); // sync actual server state
    } catch (err) {
      setDoc(prevDoc); // rollback
      showToast(err.response?.data?.message || 'Gagal approve.', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const handleComplete = async () => {
    const ok = await showConfirm({ title: 'Selesaikan Dokumen', message: 'Semua tag sudah cocok. ACC dokumen ini?', confirmText: 'ACC & Selesaikan' });
    if (!ok) return;
    setActionLoading('complete');
    // Percepatan #6: Optimistic UI — tampilkan completed sebelum server confirm
    const prevDoc = doc;
    setDoc(d => ({ ...d, status: 'completed' }));
    try {
      await shippingApi.completeDocument(doc.id);
      showToast('Dokumen selesai! Semua tag cocok ✓', 'success');
      fetchDoc();
    } catch (err) {
      setDoc(prevDoc); // rollback
      showToast(err.response?.data?.message || 'Gagal menyelesaikan.', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const openStockReconciliation = async () => {
    setActionLoading('reconcile-preview');
    try {
      const res = await shippingApi.previewStockReconciliation(doc.id);
      const preview = res.data;
      if (!(preview.gate_evidence_valid || preview.legacy_reconciliation_available) || !preview.eligible_count) {
        showToast(preview.blocked_reason || 'Belum ada tag yang memenuhi syarat untuk dicatat sebagai stok.', 'error');
        return;
      }

      const legacyWarning = preview.gate_evidence_valid
        ? ''
        : ' Riwayat gate lama tidak membuktikan seluruh EPC dalam satu lintasan valid; tindakan akan tercatat sebagai attestasi PM/Superadmin, bukan persetujuan gate.';
      const ok = await showConfirm({
        title: 'Catat Stok Masuk',
        message: `Catat ${preview.eligible_count} tag pada ${doc.document_number} sebagai stok di ${doc.warehouse?.name || 'gudang tujuan'}? Pastikan barang dan EPC benar-benar sudah diperiksa fisik.${legacyWarning}`,
        confirmText: `Catat ${preview.eligible_count} ke Stok`,
      });
      if (!ok) return;

      setActionLoading('stock-in');
      const evidenceReference = `UI_PHYSICAL_CONFIRMATION:${doc.document_number}:${currentUser?.id || 'user'}:${new Date().toISOString()}`;
      const result = await shippingApi.reconcileInboundStock(doc.id, {
        evidence_reference: evidenceReference,
        physical_confirmation: true,
      });
      showToast(result.data.message, result.data.reconciled_count ? 'success' : 'info');
      fetchDoc();
    } catch (err) {
      showToast(err.response?.data?.message || 'Gagal mencatat stok masuk.', 'error');
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

  const handleArchiveDocument = async () => {
    const ok = await showConfirm({ title: 'Hapus / Arsipkan Dokumen', message: 'Dokumen akan disembunyikan dari daftar aktif, tetapi record, tag, dan bukti gate/custody tetap disimpan untuk audit. Dokumen aktif yang sudah memiliki pembacaan gate tidak dapat diarsipkan.', confirmText: 'Hapus dari Daftar', type: 'danger' });
    if (!ok) return;
    setActionLoading('archive');
    try {
      await shippingApi.deleteDocument(doc.id);
      showToast('Dokumen diarsipkan; bukti operasional tetap tersimpan.', 'success');
      onBack();
    } catch (err) {
      showToast(err.response?.data?.message || 'Dokumen tidak dapat diarsipkan.', 'error');
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

  const canApprove = ['pm', 'superadmin'].includes(currentUser?.role) && doc.status === 'in_progress' && !doc.archived_at;
  const canEditDocument = ['pm', 'superadmin'].includes(currentUser?.role) && !doc.archived_at;
  const canArchiveDocument = currentUser?.role === 'superadmin' && !doc.archived_at;
  const canAssignTags = ['pic_lapangan', 'pm', 'superadmin'].includes(currentUser?.role) && ['draft', 'approved', 'in_progress'].includes(doc.status);
  const canCancel = ['pm', 'superadmin'].includes(currentUser?.role) && doc.status !== 'completed';
  const canReconcileInbound = ['pm', 'superadmin'].includes(currentUser?.role) && doc.type === 'inbound' && doc.status === 'completed';

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
            {doc.archived_at ? <span className="inline-flex rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">Diarsipkan</span> : <StatusBadge status={doc.status} />}
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
      {progress && (
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
        {canEditDocument && (
          <FlameButton onClick={() => setEditModalOpen(true)} height={36} flameColor="blue" showArrow={false} text="">
            <Pencil className="w-3.5 h-3.5" /> {doc.status === 'draft' ? 'Edit Dokumen' : 'Edit Catatan/Lampiran'}
          </FlameButton>
        )}
        {canArchiveDocument && (
          <FlameButton onClick={handleArchiveDocument} disabled={actionLoading === 'archive'} height={36} flameColor="rose" showArrow={false} text="">
            <Trash2 className="w-3.5 h-3.5" /> {actionLoading === 'archive' ? 'Mengarsipkan...' : 'Hapus / Arsipkan'}
          </FlameButton>
        )}
        {canApprove && (
          <FlameButton onClick={handleApprove} disabled={actionLoading === 'approve'}
            height={36} flameColor="green" showArrow={false} text="">
            <Check className="w-3.5 h-3.5" /> {actionLoading === 'approve' ? 'Memproses...' : 'ACC — Selesaikan'}
          </FlameButton>
        )}
        {canAssignTags && (
          <FlameButton onClick={() => setAssignModalOpen(true)}
            height={36} flameColor="blue" showArrow={false} text="">
            <Tag className="w-3.5 h-3.5" /> Assign Tag RFID
          </FlameButton>
        )}
        {canReconcileInbound && (
          <FlameButton onClick={openStockReconciliation} disabled={actionLoading === 'reconcile-preview' || actionLoading === 'stock-in'}
            height={36} flameColor="blue" showArrow={false} text="">
            <ShieldCheck className="w-3.5 h-3.5" /> {actionLoading === 'reconcile-preview' ? 'Memeriksa...' : actionLoading === 'stock-in' ? 'Mencatat...' : 'Catat Stok Masuk'}
          </FlameButton>
        )}
        {canCancel && doc.status !== 'cancelled' && (
          <FlameButton onClick={handleCancel} disabled={actionLoading === 'cancel'}
            height={36} flameColor="rose" showArrow={false} text="">
            <XCircle className="w-3.5 h-3.5" /> Batalkan
          </FlameButton>
        )}
      </div>
      {currentUser?.role === 'superadmin' && doc.status !== 'draft' && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
          Untuk menjaga audit, data fisik dokumen non-draft (jenis, gudang, item, kuantitas, EPC) terkunci; hanya catatan/lampiran dapat diedit. Hapus mengarsipkan record, bukan menghapus bukti. Dokumen aktif yang sudah dibaca gate tidak dapat diarsipkan.
        </div>
      )}

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
      <CreateDocModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onCreated={() => { setEditModalOpen(false); fetchDoc(); }}
        warehouses={warehouses || []}
        items={items || []}
        documentToEdit={doc}
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
  const [archivedFilter, setArchivedFilter] = useState(false);
  // Percepatan: pisah searchQuery (input) dari debouncedSearch (API trigger)
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [documentToEdit, setDocumentToEdit] = useState(null);
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [warehouses, setWarehouses] = useState([]);
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ current_page: 1, last_page: 1 });
  // ── Rekomendasi #3: Kanban Board View toggle ──────────────────────
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'board'
  // Percepatan #5: useTransition — filter non-urgent, UI tetap responsif
  const [isPending, startTransition] = useTransition();

  const fetchDocs = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, per_page: 15 };
      if (statusFilter) params.status = statusFilter;
      if (typeFilter) params.type = typeFilter;
      if (debouncedSearch) params.search = debouncedSearch;
      if (archivedFilter && currentUser?.role === 'superadmin') params.archived = 1;

      const res = await shippingApi.getDocuments(params);
      setDocs(res.data.data || []);
      setPagination({ current_page: res.data.current_page || 1, last_page: res.data.last_page || 1 });
    } catch (err) {
      showToast('Gagal memuat daftar dokumen.', 'error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, debouncedSearch, archivedFilter, currentUser?.role]);

  // Debounce search input 400ms — hanya trigger API setelah user berhenti mengetik
  useEffect(() => {
    const timer = setTimeout(() => startTransition(() => setDebouncedSearch(searchQuery)), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

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
        warehouses={warehouses}
        items={items}
      />
    );
  }

  const canCreate = ['pm', 'superadmin'].includes(currentUser?.role);
  const canEditDocuments = ['pm', 'superadmin'].includes(currentUser?.role);
  const canArchiveDocuments = currentUser?.role === 'superadmin';
  const handleEditFromList = async (event, doc) => {
    event.stopPropagation();
    try {
      const res = await shippingApi.getDocument(doc.id);
      setDocumentToEdit(res.data.document);
      setCreateModalOpen(true);
    } catch (err) {
      showToast(err.response?.data?.message || 'Gagal memuat dokumen untuk edit.', 'error');
    }
  };
  const handleArchiveFromList = async (event, doc) => {
    event.stopPropagation();
    const ok = await showConfirm({ title: 'Hapus / Arsipkan Dokumen', message: `${doc.document_number} akan disembunyikan dari daftar aktif, tetapi seluruh tag dan bukti audit tetap tersimpan. Jika dokumen aktif sudah dibaca gate, arsip akan ditolak.`, confirmText: 'Hapus dari Daftar', type: 'danger' });
    if (!ok) return;
    try {
      await shippingApi.deleteDocument(doc.id);
      showToast('Dokumen diarsipkan; bukti operasional tetap tersimpan.', 'success');
      fetchDocs(pagination.current_page);
    } catch (err) {
      showToast(err.response?.data?.message || 'Dokumen tidak dapat diarsipkan.', 'error');
    }
  };
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

        {/* ── Rekomendasi #3: View Mode Toggle ─────────────────────────── */}
        <div className="flex rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
          <button
            onClick={() => setViewMode('list')}
            title="Tampilan List"
            className={`px-2.5 py-1.5 transition flex items-center gap-1 text-xs font-semibold ${
              viewMode === 'list' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode('board')}
            title="Tampilan Kanban"
            className={`px-2.5 py-1.5 transition flex items-center gap-1 text-xs font-semibold border-l border-slate-200 ${
              viewMode === 'board' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {currentUser?.role === 'superadmin' && (
        <button onClick={() => { setArchivedFilter(value => !value); setStatusFilter(''); setTypeFilter(''); }}
          className={`px-3 py-1.5 text-[11px] font-semibold rounded-xl border transition ${archivedFilter ? 'bg-slate-800 text-white border-slate-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
          {archivedFilter ? 'Kembali ke Aktif' : 'Lihat Arsip'}
        </button>
      )}

      {/* Documents List / Board */}
      {loading ? (
        <SkeletonTable rows={6} cols={4} />
      ) : docs.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <div className="text-sm font-semibold text-slate-500">Belum ada dokumen</div>
          <div className="text-xs text-slate-400 mt-1">
            {canCreate ? 'Klik "Buat Dokumen" untuk memulai.' : 'Dokumen dari PM akan muncul di sini.'}
          </div>
        </div>
      ) : viewMode === 'board' ? (
        // ── Rekomendasi #3: Kanban Board View ──────────────────────────
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-3 min-w-max">
            {[
              { status: 'draft',       label: 'Draft',         color: 'bg-slate-100 border-slate-300',   badge: 'bg-slate-200 text-slate-700', dot: 'bg-slate-400' },
              { status: 'approved',    label: 'Disetujui',     color: 'bg-blue-50 border-blue-200',      badge: 'bg-blue-100 text-blue-700',   dot: 'bg-blue-500' },
              { status: 'in_progress', label: 'Sedang Proses', color: 'bg-amber-50 border-amber-200',    badge: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500 animate-pulse' },
              { status: 'completed',   label: 'Selesai',       color: 'bg-emerald-50 border-emerald-200',badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
            ].map(col => {
              const colDocs = docs.filter(d => d.status === col.status);
              return (
                <div key={col.status} className={`w-72 flex-shrink-0 rounded-2xl border ${col.color} flex flex-col`}>
                  {/* Column header */}
                  <div className="px-3 py-2.5 flex items-center justify-between border-b border-current border-opacity-20">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                      <span className="text-xs font-bold text-slate-700">{col.label}</span>
                    </div>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${col.badge}`}>
                      {colDocs.length}
                    </span>
                  </div>
                  {/* Cards */}
                  <div className="flex-1 p-2 space-y-2 max-h-[65vh] overflow-y-auto">
                    {colDocs.length === 0 && (
                      <div className="py-6 text-center text-[11px] text-slate-400">Tidak ada dokumen</div>
                    )}
                    {colDocs.map(doc => (
                      <button
                        key={doc.id}
                        onClick={() => setSelectedDocId(doc.id)}
                        className="w-full text-left bg-white rounded-xl border border-slate-200 p-3 shadow-xs hover:shadow-md hover:border-blue-300 transition-all cursor-pointer group"
                      >
                        {/* Doc type indicator */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${
                              doc.type === 'inbound' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'
                            }`}>
                              {doc.type === 'inbound'
                                ? <ArrowDownCircle className="w-3.5 h-3.5" />
                                : <ArrowUpCircle className="w-3.5 h-3.5" />}
                            </span>
                            <span className="text-[10px] font-bold text-slate-500 uppercase">
                              {doc.type === 'inbound' ? 'Masuk' : 'Keluar'}
                            </span>
                          </div>
                          <Eye className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-500 transition flex-shrink-0" />
                        </div>
                        {/* Doc number */}
                        <div className="text-xs font-black text-slate-800 group-hover:text-blue-700 transition leading-tight mb-1">
                          {doc.document_number}
                        </div>
                        {/* Meta */}
                        <div className="text-[10px] text-slate-400 truncate mb-2">
                          {doc.creator?.name} • {doc.warehouse?.name}
                        </div>
                        {/* Progress bar */}
                        {doc.total_tags > 0 && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-[9px] font-mono text-slate-400">
                              <span>{doc.scanned_tags || 0}/{doc.total_tags} tag</span>
                              <span>{doc.total_tags > 0 ? Math.round(((doc.scanned_tags || 0) / doc.total_tags) * 100) : 0}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  (doc.scanned_tags || 0) >= doc.total_tags ? 'bg-emerald-500' : 'bg-amber-400'
                                }`}
                                style={{ width: `${doc.total_tags > 0 ? Math.round(((doc.scanned_tags || 0) / doc.total_tags) * 100) : 0}%` }}
                              />
                            </div>
                          </div>
                        )}
                        {/* Items count */}
                        <div className="mt-2 text-[10px] text-slate-400">
                          {doc.items_count || 0} jenis material
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        // ── List View (default) ──────────────────────────────────────
        <div className="space-y-2">
          {docs.map(doc => (
            <div key={doc.id}
              className="w-full bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-2 hover:border-blue-300 hover:shadow-md transition group">
              <button onClick={() => setSelectedDocId(doc.id)} className="min-w-0 flex-1 p-1 text-left cursor-pointer">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${doc.type === 'inbound' ? 'bg-blue-100 text-blue-600' : 'bg-blue-100 text-blue-600'}`}>
                    {doc.type === 'inbound' ? <ArrowDownCircle className="w-4 h-4" /> : <ArrowUpCircle className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-800 group-hover:text-blue-700 transition">{doc.document_number}</span>
                      {doc.archived_at ? <span className="inline-flex rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">Diarsipkan</span> : <StatusBadge status={doc.status} />}
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
              {canEditDocuments && !doc.archived_at && (
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={event => handleEditFromList(event, doc)} title={doc.status === 'draft' ? 'Edit draft' : 'Edit catatan/lampiran'} aria-label={`Edit dokumen ${doc.document_number}`} className="p-2 rounded-lg text-blue-600 hover:bg-blue-50">
                    <Pencil className="w-4 h-4" />
                  </button>
                  {canArchiveDocuments && !doc.archived_at && (
                    <button onClick={event => handleArchiveFromList(event, doc)} title="Hapus/arsipkan (audit dipertahankan)" aria-label={`Hapus atau arsipkan ${doc.document_number}`} className="p-2 rounded-lg text-rose-600 hover:bg-rose-50">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
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
        onClose={() => { setCreateModalOpen(false); setDocumentToEdit(null); }}
        onCreated={() => { fetchDocs(); setDocumentToEdit(null); }}
        warehouses={warehouses}
        items={items}
        documentToEdit={documentToEdit}
      />
    </div>
  );
}
