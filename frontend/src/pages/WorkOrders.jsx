import React, { useState, useEffect } from 'react';
import { workOrderApi, masterApi, spkApi } from '../services/api';
import { showToast } from '../components/Toast';
import Portal from '../components/Portal';
import { 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  Lock, 
  Package, 
  Plus, 
  ClipboardList, 
  Search, 
  Eye, 
  X,
  Clock,
  ShieldCheck,
  FolderKanban,
  Trash2,
  Calendar,
  Building2,
  Save,
  FolderDown,
  History,
  Zap,
  Info,
  RefreshCw
} from 'lucide-react';

export default function WorkOrders({ currentUser = null }) {
  const [workOrders, setWorkOrders] = useState([]);
  const [selectedWo, setSelectedWo] = useState(null);
  const [selectedWoDetail, setSelectedWoDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPrepareModal, setShowPrepareModal] = useState(false);
  const [preparedItems, setPreparedItems] = useState([]);
  const [preparingWoLoading, setPreparingWoLoading] = useState(null);
  const [submittingPrepared, setSubmittingPrepared] = useState(false);

  // Manual Draft State for WO Creation
  const [woDraftSavedAt, setWoDraftSavedAt] = useState(() => {
    try {
      const raw = localStorage.getItem('mosa_wo_draft');
      return raw ? JSON.parse(raw).timestamp : null;
    } catch {
      return null;
    }
  });

  // Master data for creating Work Order
  const [projects, setProjects] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [spks, setSpks] = useState([]);
  const [availableItems, setAvailableItems] = useState([]);

  // Create Work Order Modal state
  const [showCreateWoModal, setShowCreateWoModal] = useState(false);
  const [newWo, setNewWo] = useState({
    spk_id: '',
    project_id: '',
    warehouse_id: '',
    wo_number: '',
    title: '',
    target_completion_date: '',
    notes: '',
  });
  const [boqRows, setBoqRows] = useState([
    { item_id: '', quota_qty: 1, notes: '' },
  ]);

  // Real-time Warehouse Stock & SPK Contract Quota Helpers
  const getWarehouseStock = (itemId, warehouseId) => {
    if (!itemId || !warehouseId) return 0;
    const item = availableItems.find((it) => it.id === parseInt(itemId, 10));
    if (!item || !item.warehouse_stocks) return 0;
    return Number(item.warehouse_stocks[warehouseId] || 0);
  };

  const getSpkQuotaInfo = (itemId, spkId) => {
    if (!itemId || !spkId) return null;
    const selectedSpk = spks.find((s) => s.id === parseInt(spkId, 10));
    if (!selectedSpk || !selectedSpk.items) return null;

    const spkItem = selectedSpk.items.find((si) => si.item_id === parseInt(itemId, 10));
    if (!spkItem) {
      return { target_qty: 0, allocated: 0, remaining: 0, inSpk: false };
    }

    // Calculate sum of quota_qty for this item across all existing WOs under this SPK (excluding rejected/cancelled)
    const allocated = workOrders
      .filter((w) => w.spk_id === parseInt(spkId, 10) && w.status !== 'rejected' && w.status !== 'cancelled')
      .flatMap((w) => w.boq_items || [])
      .filter((bi) => bi.item_id === parseInt(itemId, 10))
      .reduce((sum, bi) => sum + Number(bi.quota_qty || 0), 0);

    const targetQty = Number(spkItem.target_qty || 0);
    const remaining = Math.max(0, targetQty - allocated);

    return {
      target_qty: targetQty,
      allocated,
      remaining,
      inSpk: true,
      spk_number: selectedSpk.spk_number,
    };
  };

  // Search & Filter
  const [woSearch, setWoSearch] = useState('');
  const [woStatusFilter, setWoStatusFilter] = useState('ALL');

  const loadWorkOrders = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const [woRes, prRes, whRes, spkRes, itRes] = await Promise.all([
        workOrderApi.getWorkOrders(),
        masterApi.getProjects().catch(() => ({ data: [] })),
        masterApi.getWarehouses().catch(() => ({ data: [] })),
        spkApi.getSpks().catch(() => ({ data: [] })),
        masterApi.getItems().catch(() => ({ data: [] })),
      ]);
      setWorkOrders(woRes.data || []);
      setProjects(prRes.data || []);
      setWarehouses(whRes.data || []);
      setSpks(spkRes.data || []);
      setAvailableItems(itRes.data || []);
    } catch (err) {
      console.error('Error loading Work Orders:', err);
      showToast('Gagal memuat daftar Work Order', 'error');
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkOrders();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showCreateWoModal) setShowCreateWoModal(false);
        else if (showPrepareModal) setShowPrepareModal(false);
        else if (selectedWo) setSelectedWo(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showCreateWoModal, showPrepareModal, selectedWo]);

  // Helper to auto-populate form fields based on selected project
  const resolveDataForProject = (projectId, currentWo = {}, shouldReplaceBoq = true) => {
    const pIdNum = parseInt(projectId, 10);
    const selectedProj = projects.find((p) => p.id === pIdNum);
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    if (!selectedProj) {
      return {
        updatedWo: {
          ...currentWo,
          project_id: '',
          warehouse_id: '',
          spk_id: '',
        },
        newBoqRows: null,
        matchingWh: null,
        matchingSpk: null,
        selectedProj: null,
      };
    }

    // 1. Matching Warehouse: direct project_id, pivot projects, or project.warehouses
    const matchingWh = warehouses.find(
      (w) =>
        w.project_id === pIdNum ||
        w.projects?.some((pr) => pr.id === pIdNum) ||
        selectedProj.warehouses?.some((pw) => pw.id === w.id)
    ) || warehouses[0] || null;

    // 2. Matching SPK: direct project_id, or matching principal_id
    const matchingSpk = spks.find((s) => s.project_id === pIdNum) ||
      (selectedProj.principal_id ? spks.find((s) => s.principal_id === selectedProj.principal_id) : null) ||
      null;

    // 3. WO Number: auto-generate with project code if current is empty or matches default format
    const projCodeClean = selectedProj.code ? selectedProj.code.replace(/^PRJ-/, '').replace(/[^A-Z0-9]/gi, '').slice(0, 10) : 'ROLLOUT';
    const isDefaultWoNum = !currentWo.wo_number || /^WO-(ROLLOUT|[A-Z0-9]+)-\d{8}-\d{3}$/.test(currentWo.wo_number);
    const woNumber = isDefaultWoNum
      ? `WO-${projCodeClean}-${todayStr}-${Math.floor(100 + Math.random() * 900)}`
      : currentWo.wo_number;

    // 4. Title: auto-fill if empty or previously auto-generated
    const isAutoTitle = !currentWo.title || currentWo.title.startsWith('Rollout FO') || spks.some((s) => s.title === currentWo.title);
    const title = isAutoTitle
      ? (matchingSpk?.title || `Rollout FO: ${selectedProj.name}`)
      : currentWo.title;

    // 5. Target Completion Date: auto-fill from SPK if available and not manually set
    const targetDate = (!currentWo.target_completion_date && matchingSpk?.end_date)
      ? matchingSpk.end_date
      : (currentWo.target_completion_date || '');

    // 6. Notes: auto-fill with project location/client if empty or auto-generated
    const isAutoNotes = !currentWo.notes || currentWo.notes.startsWith('Lokasi:');
    const notes = isAutoNotes && selectedProj.location
      ? `Lokasi: ${selectedProj.location}${selectedProj.client_name ? ` (${selectedProj.client_name})` : ''}`
      : (matchingSpk?.notes && !currentWo.notes ? matchingSpk.notes : (currentWo.notes || ''));

    // 7. BOQ Items from matching SPK
    let newBoqRows = null;
    if (shouldReplaceBoq && matchingSpk?.items && matchingSpk.items.length > 0) {
      newBoqRows = matchingSpk.items.map((spkItem) => {
        const info = getSpkQuotaInfo(spkItem.item_id, matchingSpk.id);
        const remaining = info && info.inSpk ? info.remaining : Number(spkItem.target_qty || 1);
        return {
          item_id: spkItem.item_id,
          quota_qty: remaining > 0 ? remaining : Math.max(1, Number(spkItem.target_qty || 1)),
          notes: spkItem.notes || `Alokasi kuota SPK #${matchingSpk.spk_number}`,
        };
      });
    }

    return {
      updatedWo: {
        ...currentWo,
        project_id: String(selectedProj.id),
        warehouse_id: matchingWh ? String(matchingWh.id) : (currentWo.warehouse_id || ''),
        spk_id: matchingSpk ? String(matchingSpk.id) : '',
        wo_number: woNumber,
        title,
        target_completion_date: targetDate,
        notes,
      },
      newBoqRows,
      matchingWh,
      matchingSpk,
      selectedProj,
    };
  };

  const handleProjectChange = (pId) => {
    if (!pId) {
      setNewWo((prev) => ({
        ...prev,
        project_id: '',
        warehouse_id: '',
        spk_id: '',
      }));
      return;
    }

    const { updatedWo, newBoqRows, selectedProj, matchingWh, matchingSpk } = resolveDataForProject(pId, newWo, true);
    setNewWo(updatedWo);

    if (newBoqRows && newBoqRows.length > 0) {
      setBoqRows(newBoqRows);
      showToast(
        `⚡ Proyek ${selectedProj.name} dipilih: Gudang (${matchingWh?.name || '-'}), SPK (${matchingSpk?.spk_number || '-'}), dan ${newBoqRows.length} kuota material otomatis terisi!`,
        'success'
      );
    } else {
      showToast(
        `⚡ Proyek ${selectedProj.name} dipilih: Gudang (${matchingWh?.name || '-'}) ${matchingSpk ? `& SPK (${matchingSpk.spk_number})` : ''} otomatis terhubung.`,
        'info'
      );
    }
  };

  const handleSpkChange = (sId) => {
    if (!sId) {
      setNewWo((prev) => ({ ...prev, spk_id: '' }));
      return;
    }

    const selectedSpk = spks.find((s) => s.id === parseInt(sId, 10));
    if (!selectedSpk) {
      setNewWo((prev) => ({ ...prev, spk_id: sId }));
      return;
    }

    setNewWo((prev) => ({
      ...prev,
      spk_id: sId,
      title: (!prev.title || prev.title.startsWith('Rollout FO')) ? (selectedSpk.title || prev.title) : prev.title,
      target_completion_date: (!prev.target_completion_date && selectedSpk.end_date) ? selectedSpk.end_date : prev.target_completion_date,
    }));

    if (selectedSpk.items && selectedSpk.items.length > 0) {
      const isDefaultBoq = boqRows.length <= 1 && (!boqRows[0]?.item_id || boqRows[0]?.notes === 'Target kuota penarikan' || boqRows[0]?.notes?.startsWith('Alokasi kuota SPK'));
      if (isDefaultBoq) {
        syncBoqRowsFromSpk(sId);
      }
    }
  };

  const syncBoqRowsFromSpk = (sId) => {
    const spkObj = spks.find((s) => s.id === parseInt(sId, 10));
    if (!spkObj || !spkObj.items || spkObj.items.length === 0) {
      showToast('Kontrak SPK ini belum memiliki rincian item material.', 'info');
      return;
    }

    const newRows = spkObj.items.map((spkItem) => {
      const info = getSpkQuotaInfo(spkItem.item_id, spkObj.id);
      const remaining = info && info.inSpk ? info.remaining : Number(spkItem.target_qty || 1);
      return {
        item_id: spkItem.item_id,
        quota_qty: remaining > 0 ? remaining : Math.max(1, Number(spkItem.target_qty || 1)),
        notes: spkItem.notes || `Alokasi kuota SPK #${spkObj.spk_number}`,
      };
    });

    setBoqRows(newRows);
    showToast(`📦 Berhasil menyinkronkan ${newRows.length} item material dari SPK #${spkObj.spk_number}!`, 'success');
  };

  const openCreateWoModal = () => {
    // Check if there is a saved draft in localStorage
    const savedDraftRaw = localStorage.getItem('mosa_wo_draft');
    if (savedDraftRaw) {
      try {
        const parsed = JSON.parse(savedDraftRaw);
        if (parsed.newWo && parsed.boqRows) {
          setNewWo(parsed.newWo);
          setBoqRows(parsed.boqRows.length > 0 ? parsed.boqRows : [{ item_id: availableItems[0]?.id || '', quota_qty: 1, notes: 'Target kuota penarikan' }]);
          setShowCreateWoModal(true);
          showToast(`📂 Draf Work Order (${parsed.timestamp || 'Tersimpan'}) otomatis dimuat!`, 'info');
          return;
        }
      } catch {
        // Fallback to default if corrupted
      }
    }

    const defaultProjectId = projects[0]?.id ? String(projects[0].id) : '';
    if (defaultProjectId) {
      const { updatedWo, newBoqRows } = resolveDataForProject(defaultProjectId, {}, true);
      setNewWo(updatedWo);
      if (newBoqRows && newBoqRows.length > 0) {
        setBoqRows(newBoqRows);
      } else {
        setBoqRows([{ item_id: availableItems[0]?.id || '', quota_qty: 1, notes: 'Target kuota penarikan' }]);
      }
    } else {
      const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      setNewWo({
        spk_id: '',
        project_id: '',
        warehouse_id: '',
        wo_number: `WO-ROLLOUT-${todayStr}-${Math.floor(100 + Math.random() * 900)}`,
        title: '',
        target_completion_date: '',
        notes: '',
      });
      setBoqRows([{ item_id: availableItems[0]?.id || '', quota_qty: 1, notes: 'Target kuota penarikan' }]);
    }

    setShowCreateWoModal(true);
  };

  const handleAddBoqRow = () => {
    setBoqRows((prev) => [
      ...prev,
      { item_id: availableItems[0]?.id || '', quota_qty: 1, notes: '' },
    ]);
  };

  const handleRemoveBoqRow = (idx) => {
    setBoqRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleUpdateBoqRow = (idx, field, value) => {
    setBoqRows((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  };

  const handleSaveWoDraft = () => {
    try {
      const nowStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
      const data = { newWo, boqRows, timestamp: nowStr };
      localStorage.setItem('mosa_wo_draft', JSON.stringify(data));
      setWoDraftSavedAt(nowStr);
      showToast(`💾 Draf Work Order & Kuota BOQ tersimpan (${nowStr})`, 'success');
    } catch (e) {
      showToast('Gagal simpan draf WO: ' + e.message, 'error');
    }
  };

  const handleLoadWoDraft = () => {
    try {
      const raw = localStorage.getItem('mosa_wo_draft');
      if (!raw) return showToast('Belum ada draf WO yang tersimpan.', 'info');
      const data = JSON.parse(raw);
      if (data.newWo) {
        setNewWo((prev) => ({
          ...prev,
          ...data.newWo,
          project_id: data.newWo.project_id || projects[0]?.id || '',
          warehouse_id: data.newWo.warehouse_id || warehouses[0]?.id || '',
        }));
      }
      if (data.boqRows && data.boqRows.length > 0) {
        setBoqRows(data.boqRows);
      }
      showToast(`📂 Draf Work Order (${data.timestamp || 'Tersimpan'}) berhasil dimuat!`, 'success');
    } catch (e) {
      showToast('Gagal memuat draf WO: ' + e.message, 'error');
    }
  };

  const handleClearWoDraft = () => {
    localStorage.removeItem('mosa_wo_draft');
    setWoDraftSavedAt(null);
    const defaultProjectId = projects[0]?.id ? String(projects[0].id) : '';
    if (defaultProjectId) {
      const { updatedWo, newBoqRows } = resolveDataForProject(defaultProjectId, {}, true);
      setNewWo(updatedWo);
      setBoqRows(newBoqRows && newBoqRows.length > 0 ? newBoqRows : [{ item_id: availableItems[0]?.id || '', quota_qty: 1, notes: 'Target kuota penarikan' }]);
    } else {
      const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      setNewWo({
        spk_id: '',
        project_id: '',
        warehouse_id: '',
        wo_number: `WO-ROLLOUT-${todayStr}-${Math.floor(100 + Math.random() * 900)}`,
        title: '',
        target_completion_date: '',
        notes: '',
      });
      setBoqRows([
        { item_id: availableItems[0]?.id || '', quota_qty: 1, notes: 'Target kuota penarikan' },
      ]);
    }
    showToast('Draf Work Order dibersihkan dan form direset.', 'info');
  };

  const handleCreateWoSubmit = async (e) => {
    e.preventDefault();
    if (!newWo.project_id) {
      showToast('Pilih proyek rollout terlebih dahulu.', 'warning');
      return;
    }
    if (!newWo.warehouse_id) {
      showToast('Pilih gudang transit terlebih dahulu.', 'warning');
      return;
    }
    if (!newWo.wo_number) {
      showToast('Masukkan nomor Work Order.', 'warning');
      return;
    }
    if (!newWo.title) {
      showToast('Masukkan judul pekerjaan Work Order.', 'warning');
      return;
    }
    if (boqRows.length === 0 || !boqRows[0].item_id) {
      showToast('Tentukan minimal 1 material kuota BOQ.', 'warning');
      return;
    }

    // Validation: Minimum 1 for all quantities
    for (const r of boqRows) {
      const q = parseInt(r.quota_qty, 10);
      if (!q || q < 1) {
        showToast('Setiap rincian kuota BOQ minimal bernilai 1.', 'warning');
        return;
      }
    }

    // SPK Quota Check (Contract limit enforcement)
    if (newWo.spk_id) {
      for (const r of boqRows) {
        const info = getSpkQuotaInfo(r.item_id, newWo.spk_id);
        const itemObj = availableItems.find((it) => it.id === parseInt(r.item_id, 10));
        const itemName = itemObj ? itemObj.name : `Item #${r.item_id}`;
        const itemUnit = itemObj ? itemObj.unit : 'unit';
        const q = parseInt(r.quota_qty, 10);

        if (info && info.inSpk && q > info.remaining) {
          showToast(`❌ Kuota ${itemName} (${q} ${itemUnit}) melebihi sisa kontrak SPK #${info.spk_number} (${info.remaining} ${itemUnit})! Sesuaikan kuota atau ajukan addendum.`, 'error');
          return;
        }
      }
    }

    const payload = {
      project_id: parseInt(newWo.project_id, 10),
      spk_id: newWo.spk_id ? parseInt(newWo.spk_id, 10) : null,
      warehouse_id: parseInt(newWo.warehouse_id, 10),
      wo_number: newWo.wo_number,
      title: newWo.title,
      target_completion_date: newWo.target_completion_date || null,
      notes: newWo.notes || null,
      boq_items: boqRows.map((r) => ({
        item_id: parseInt(r.item_id, 10),
        quota_qty: parseInt(r.quota_qty, 10),
        notes: r.notes || null,
      })),
    };

    try {
      const res = await workOrderApi.createWorkOrder(payload);
      setShowCreateWoModal(false);
      localStorage.removeItem('mosa_wo_draft');
      setWoDraftSavedAt(null);
      setWoStatusFilter('ALL');

      const createdWo = res.data;
      if (createdWo) {
        const fullWo = {
          ...createdWo,
          project: projects.find((p) => p.id === createdWo.project_id) || createdWo.project,
          warehouse: warehouses.find((w) => w.id === createdWo.warehouse_id) || createdWo.warehouse,
        };
        setWorkOrders((prev) => [fullWo, ...(Array.isArray(prev) ? prev.filter((w) => w.id !== createdWo.id) : [])]);
      }
      // Silently refresh in background without table flicker/spinner
      loadWorkOrders(false);

      const isAutoApprove = res.data?.status === 'approved';
      showToast(
        isAutoApprove
          ? `Work Order #${res.data?.wo_number || newWo.wo_number} berhasil dibuat & kuota BOQ langsung terkunci (Auto-Approved oleh PM)!`
          : `Work Order #${res.data?.wo_number || newWo.wo_number} berhasil dibuat! Menunggu Approval PM.`,
        'success'
      );
    } catch (err) {
      showToast('Gagal membuat Work Order: ' + (err.response?.data?.message || err.message), 'error');
    }
  };

  const handleApproveWo = async (woId) => {
    try {
      await workOrderApi.approveWorkOrder(woId);
      setWorkOrders((prev) =>
        prev.map((w) => (w.id === woId ? { ...w, status: 'approved' } : w))
      );
      if (selectedWoDetail?.id === woId) {
        setSelectedWoDetail((prev) => ({ ...prev, status: 'approved' }));
      }
      loadWorkOrders(false);
      showToast('Work Order telah disetujui PM. Kuota penarikan BOQ terkunci!', 'success');
    } catch (err) {
      showToast('Gagal menyetujui WO: ' + (err.response?.data?.message || err.message), 'error');
    }
  };

  const openPrepareModal = async (wo) => {
    if (!wo) return;
    setPreparingWoLoading(wo.id);
    try {
      let targetWo = wo;
      try {
        const res = await workOrderApi.getWorkOrder(wo.id);
        if (res.data) targetWo = res.data;
      } catch {
        // Fallback to locally passed wo
      }

      setSelectedWo(targetWo);
      const items = targetWo.boq_items || targetWo.boqItems || [];
      if (items.length === 0) {
        showToast('Work Order ini belum memiliki rincian material kuota BOQ.', 'warning');
        return;
      }

      setPreparedItems(
        items.map((b) => ({
          item_id: b.item_id,
          item_name: b.item?.name || availableItems.find((it) => it.id === b.item_id)?.name || `Material #${b.item_id}`,
          quota_qty: Number(b.quota_qty || 0),
          prepared_qty: b.prepared_qty !== undefined && b.prepared_qty !== null && Number(b.prepared_qty) > 0
            ? Number(b.prepared_qty)
            : Number(b.quota_qty || 1),
        }))
      );
      setShowPrepareModal(true);
    } catch (err) {
      console.error('Error opening prepare modal:', err);
      showToast('Gagal memuat form persiapan barang: ' + err.message, 'error');
    } finally {
      setPreparingWoLoading(null);
    }
  };

  const handleSubmitPrepared = async (e) => {
    e.preventDefault();
    if (!selectedWo) return;
    setSubmittingPrepared(true);
    try {
      const res = await workOrderApi.reportPrepared(selectedWo.id, preparedItems);
      setShowPrepareModal(false);
      setWorkOrders((prev) =>
        prev.map((w) =>
          w.id === selectedWo.id
            ? {
                ...w,
                status:
                  res.data?.status ||
                  (res.data?.has_shortage ? 'partially_prepared' : 'ready_for_dispatch'),
              }
            : w
        )
      );
      loadWorkOrders(false);
      if (res.data?.has_shortage) {
        showToast('Kuantitas barang disiapkan kurang dari kuota BOQ (Shortage). Notifikasi dikirim ke PM.', 'warning');
      } else {
        showToast('Barang berhasil disiapkan oleh Storeroom!', 'success');
      }
    } catch (err) {
      showToast('Gagal simpan barang disiapkan: ' + (err.response?.data?.message || err.message), 'error');
    } finally {
      setSubmittingPrepared(false);
    }
  };

  const filteredWorkOrders = (Array.isArray(workOrders) ? workOrders : []).filter((wo) => {
    const matchSearch =
      (wo.wo_number || '').toLowerCase().includes(woSearch.toLowerCase()) ||
      (wo.title || '').toLowerCase().includes(woSearch.toLowerCase()) ||
      (wo.project?.name || '').toLowerCase().includes(woSearch.toLowerCase()) ||
      (wo.warehouse?.name || '').toLowerCase().includes(woSearch.toLowerCase());
    const matchStatus = woStatusFilter === 'ALL' || wo.status === woStatusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Work Order & Kuota BOQ</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Penetapan kuota penarikan material oleh PM dan pelaporan fisik oleh Storeroom (Read-Only Kuota BOQ).
          </p>
        </div>
        {(!currentUser || ['superadmin', 'pm'].includes(currentUser.role)) && (
          <button
            onClick={openCreateWoModal}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Buat Work Order Baru</span>
          </button>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-center gap-3">
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Cari No. WO, Judul, Proyek..."
              value={woSearch}
              onChange={(e) => setWoSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium placeholder:text-slate-400"
            />
          </div>

          <select
            value={woStatusFilter}
            onChange={(e) => setWoStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="ALL">Semua Status WO</option>
            <option value="draft">DRAFT (Menunggu PM)</option>
            <option value="approved">APPROVED (Kuota Terkunci)</option>
            <option value="in_progress">IN PROGRESS (Sedang Berjalan)</option>
            <option value="completed">COMPLETED (Selesai)</option>
          </select>
        </div>

        <div className="text-xs font-semibold text-slate-500">
          Total: <strong className="text-slate-800">{filteredWorkOrders.length}</strong> Work Orders
        </div>
      </div>

      {/* Full-Width High-Density Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-3.5">No. WO & Tanggal</th>
                <th className="py-3 px-3.5">Proyek & Lokasi</th>
                <th className="py-3 px-3.5">Gudang Transit</th>
                <th className="py-3 px-3.5">Judul Pekerjaan</th>
                <th className="py-3 px-3.5">Dibuat Oleh & Approval</th>
                <th className="py-3 px-3.5 text-center">Rincian Kuota BOQ</th>
                <th className="py-3 px-3.5 text-center">Status</th>
                <th className="py-3 px-3.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredWorkOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <FolderKanban className="w-8 h-8 text-slate-300" />
                      <p className="font-bold text-slate-700">Belum ada data Work Order yang sesuai.</p>
                      <p className="text-xs text-slate-500">Sesuaikan kata kunci pencarian atau klik "Buat Work Order Baru".</p>
                      {(woSearch || woStatusFilter !== 'ALL') && (
                        <button
                          type="button"
                          onClick={() => {
                            setWoSearch('');
                            setWoStatusFilter('ALL');
                          }}
                          className="mt-2 px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Reset Filter</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredWorkOrders.map((wo) => {
                  const items = wo.boq_items || wo.boqItems || [];
                  const totalQuota = items.reduce((s, it) => s + Number(it.quota_qty || 0), 0);
                  const totalPrepared = items.reduce((s, it) => s + Number(it.prepared_qty || 0), 0);
                  const totalWithdrawn = items.reduce((s, it) => s + Number(it.withdrawn_qty || 0), 0);
                  const totalReturned = items.reduce((s, it) => s + Number(it.returned_qty || 0), 0);
                  const totalRemaining = items.reduce((s, it) => s + Math.max(0, (it.quota_qty || 0) - (it.withdrawn_qty || 0) + (it.returned_qty || 0)), 0);
                  const isFullyPrepared = totalPrepared >= totalQuota && totalQuota > 0;
                  const isPartiallyPrepared = totalPrepared > 0 && totalPrepared < totalQuota;
                  const isFullyCompleted = wo.status === 'completed' || (totalQuota > 0 && totalRemaining === 0 && totalWithdrawn >= totalQuota);
                  const approverName = wo.approved_by?.name || wo.approvedBy?.name;
                  return (
                    <tr key={wo.id} className="hover:bg-slate-50/80 transition group">
                      <td className="py-2.5 px-3.5 font-mono">
                        <div className="font-bold text-slate-900 group-hover:text-emerald-700 transition">
                          {wo.wo_number}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {new Date(wo.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                      </td>
                      <td className="py-2.5 px-3.5">
                        <span className="font-semibold text-slate-800 block">{wo.project?.name || '-'}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{wo.project?.code}</span>
                      </td>
                      <td className="py-2.5 px-3.5 text-slate-700 font-medium">
                        {wo.warehouse?.name || '-'}
                      </td>
                      <td className="py-2.5 px-3.5 max-w-xs">
                        <div className="font-semibold text-slate-800 line-clamp-1">{wo.title}</div>
                      </td>
                      <td className="py-2.5 px-3.5 text-slate-600">
                        <div className="font-semibold text-slate-800 flex items-center gap-1">
                          <span>{wo.pm?.name || 'PM'}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded">
                            {wo.pm?.role || 'PM'}
                          </span>
                        </div>
                        {wo.status === 'approved' || wo.status === 'in_progress' || wo.status === 'completed' ? (
                          <div className="text-[10px] text-emerald-700 font-medium mt-0.5">
                            ✓ Disetujui: <strong>{approverName || wo.approval_request?.final_approved_by_user?.name || 'PM / Superadmin'}</strong>
                          </div>
                        ) : wo.approval_request && (wo.approval_request.status === 'pending' || wo.approval_request.status === 'revision_requested') ? (
                          <div className="text-[10px] text-amber-700 font-medium mt-0.5 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-amber-600 animate-pulse" />
                            <span>Step {wo.approval_request.current_step_order}/{wo.approval_request.total_steps}: <strong>{wo.approval_request.current_approver_user?.name || wo.pm?.name || 'Reviewer'}</strong></span>
                          </div>
                        ) : (
                          <div className="text-[10px] text-amber-600 font-medium mt-0.5">
                            ⏳ Menunggu Approval PM
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3.5 text-center">
                        <span className="font-bold text-slate-800 block">
                          {items.length} Material ({totalQuota} Pcs Kuota)
                        </span>
                        {wo.status !== 'draft' && (
                          <span className={`inline-block mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded border ${
                            isFullyPrepared
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : isPartiallyPrepared
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}>
                            {isFullyPrepared
                              ? `📦 Siap di Rak: ${totalPrepared}/${totalQuota} Pcs`
                              : isPartiallyPrepared
                              ? `⚠️ Sebagian: ${totalPrepared}/${totalQuota} Pcs`
                              : `⏳ Belum Disiapkan (0/${totalQuota})`}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3.5 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                          isFullyCompleted
                            ? 'bg-purple-100 text-purple-800 border border-purple-200'
                            : wo.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : wo.status === 'in_progress'
                            ? 'bg-blue-100 text-blue-800 border border-blue-200'
                            : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}>
                          {isFullyCompleted ? 'COMPLETED (100%)' : wo.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedWoDetail(wo)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Detail BOQ</span>
                          </button>

                          {wo.status === 'draft' && (!currentUser || ['superadmin', 'pm'].includes(currentUser.role)) && (
                            <button
                              onClick={() => handleApproveWo(wo.id)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-xs cursor-pointer"
                              title="Setujui Kuota BOQ (PM / Superadmin)"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Approve</span>
                            </button>
                          )}

                          {wo.status === 'draft' && currentUser?.role === 'storeroom' && (
                            <button
                              disabled
                              className="px-2.5 py-1 bg-slate-100 text-slate-400 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-not-allowed border border-slate-200"
                              title={`Work Order belum disetujui (${wo.approval_request?.current_approver_user?.name ? 'Menunggu review ' + wo.approval_request.current_approver_user.name : 'Draft PM'}). Storeroom belum dapat menyiapkan barang.`}
                            >
                              <Lock className="w-3.5 h-3.5 text-slate-400" />
                              <span>Terkunci</span>
                            </button>
                          )}

                          {isFullyCompleted ? (
                            <span
                              className="px-2 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-xs font-bold inline-flex items-center gap-1"
                              title="Seluruh kuota material Work Order ini telah 100% selesai ditarik dan dikerjakan."
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" />
                              <span className="hidden sm:inline text-[11px]">Selesai</span>
                            </span>
                          ) : (wo.status === 'approved' || wo.status === 'in_progress') && (!currentUser || ['superadmin', 'storeroom', 'pm'].includes(currentUser.role)) && (
                            <button
                              disabled={preparingWoLoading === wo.id}
                              onClick={() => openPrepareModal(wo)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-xs cursor-pointer ${
                                isFullyPrepared
                                  ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-300'
                                  : 'bg-blue-600 hover:bg-blue-700 text-white'
                              }`}
                              title="Lapor Fisik Disiapkan"
                            >
                              {preparingWoLoading === wo.id ? (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  <span>Memuat...</span>
                                </>
                              ) : (
                                <>
                                  <ClipboardList className="w-3.5 h-3.5" />
                                  <span>{isFullyPrepared ? `✓ Siap (${totalPrepared} Pcs)` : 'Siapkan'}</span>
                                </>
                              )}
                            </button>
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

      {/* Slide-over / Modal Detail Kuota BOQ */}
      {selectedWoDetail && (
        <Portal>
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[100] animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-5xl w-full space-y-5 shadow-2xl relative my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                    {selectedWoDetail.project?.name || 'Proyek'}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    selectedWoDetail.status === 'approved'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}>
                    {selectedWoDetail.status.toUpperCase()}
                  </span>
                </div>
                <h3 className="font-black text-lg text-slate-900 mt-1">{selectedWoDetail.wo_number}</h3>
                <p className="text-xs text-slate-600">{selectedWoDetail.title}</p>
              </div>
              <button
                onClick={() => setSelectedWoDetail(null)}
                className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Creator & Approval Info Box */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs">
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Informasi Pembuat (Creator):</span>
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>{selectedWoDetail.pm?.name || 'PM'}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded font-normal">
                    {selectedWoDetail.pm?.role || 'PM'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">
                  Dibuat pada: {new Date(selectedWoDetail.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                </div>
              </div>

              <div className="space-y-1 sm:border-l sm:border-slate-200 sm:pl-3">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Status Persetujuan (Approval):</span>
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <ShieldCheck className={`w-3.5 h-3.5 ${selectedWoDetail.status === 'approved' ? 'text-emerald-600' : 'text-amber-600'}`} />
                  <span>
                    {selectedWoDetail.status === 'approved' || selectedWoDetail.status === 'in_progress' || selectedWoDetail.status === 'completed'
                      ? (selectedWoDetail.approved_by?.name || selectedWoDetail.approvedBy?.name || selectedWoDetail.approval_request?.final_approved_by_user?.name || 'Disetujui PM / Superadmin')
                      : selectedWoDetail.approval_request && (selectedWoDetail.approval_request.status === 'pending' || selectedWoDetail.approval_request.status === 'revision_requested')
                      ? `Menunggu Review Step ${selectedWoDetail.approval_request.current_step_order}/${selectedWoDetail.approval_request.total_steps}`
                      : 'Menunggu Persetujuan PM'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">
                  {selectedWoDetail.approved_at
                    ? `Disetujui pada: ${new Date(selectedWoDetail.approved_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}`
                    : selectedWoDetail.approval_request?.current_approver_user
                    ? `Sedang di-review oleh: ${selectedWoDetail.approval_request.current_approver_user.name}`
                    : 'Belum disetujui (Draft Kuota)'}
                </div>
              </div>
            </div>

            {/* Invariant Note */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 flex items-start gap-3">
              <Lock className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-600 leading-relaxed">
                <strong className="text-slate-800 block">Aturan Kuota BOQ (Read-Only Storeroom):</strong>
                Kuota material dikunci secara permanen oleh PM. Staf storeroom hanya berhak melaporkan kuantitas fisik yang berhasil disiapkan. Penarikan melebihi kuota akan ditolak otomatis saat verifikasi RFID.
              </div>
            </div>

            {/* BOQ Quota Status Table */}
            <div>
              <h4 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                <Package className="w-4 h-4 text-emerald-600" />
                Daftar Kuota Material & Status Penarikan Lapangan:
              </h4>

              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-[11px]">
                    <tr>
                      <th className="p-2.5">Material</th>
                      <th className="p-2.5 text-right bg-emerald-50 text-emerald-900">Kuota PM</th>
                      <th className="p-2.5 text-right">Disiapkan</th>
                      <th className="p-2.5 text-right">Barang Keluar</th>
                      <th className="p-2.5 text-right">Retur</th>
                      <th className="p-2.5 text-right bg-slate-100 font-bold">Sisa Kuota</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(selectedWoDetail.boq_items || selectedWoDetail.boqItems || []).map((boq) => {
                      const sisaKuota = Math.max(0, (boq.quota_qty || 0) - (boq.withdrawn_qty || 0) + (boq.returned_qty || 0));
                      const isShortage = (boq.prepared_qty || 0) < (boq.quota_qty || 0);
                      return (
                        <tr key={boq.id} className="hover:bg-slate-50">
                          <td className="p-2.5">
                            <div className="font-semibold text-slate-800">{boq.item?.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{boq.item?.code}</div>
                          </td>
                          <td className="p-2.5 text-right font-mono font-bold text-emerald-700 bg-emerald-50/50">
                            {boq.quota_qty} {boq.item?.unit}
                          </td>
                          <td className="p-2.5 text-right font-mono font-semibold">
                            <span className={isShortage ? 'text-amber-600 font-bold' : 'text-slate-700'}>
                              {boq.prepared_qty} {boq.item?.unit}
                              {isShortage && <span className="block text-[9px] text-amber-600 font-sans">⚠️ Shortage</span>}
                            </span>
                          </td>
                          <td className="p-2.5 text-right font-mono text-slate-700">
                            {boq.withdrawn_qty} {boq.item?.unit}
                          </td>
                          <td className="p-2.5 text-right font-mono text-blue-600">
                            {boq.returned_qty} {boq.item?.unit}
                          </td>
                          <td className="p-2.5 text-right font-mono font-bold text-slate-900 bg-slate-100">
                            {sisaKuota} {boq.item?.unit}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Timeline & Audit Log */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <History className="w-4 h-4 text-emerald-600" />
                Log Aktivitas, Riwayat Approval & Progres Fisik (Timeline Audit):
              </h4>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {/* Event 1: Inisiasi WO */}
                  <div className="relative">
                    <span className="absolute -left-6 top-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-white" />
                    <div className="text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-900">Work Order & Kuota BOQ Dibuat</span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {new Date(selectedWoDetail.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        Dibuat oleh <strong className="text-slate-800">{selectedWoDetail.pm?.name || 'Project Manager'}</strong> dengan total {(selectedWoDetail.boq_items || selectedWoDetail.boqItems || []).reduce((s, it) => s + Number(it.quota_qty || 0), 0)} kuota material untuk proyek <strong>{selectedWoDetail.project?.name}</strong>.
                      </p>
                    </div>
                  </div>

                  {/* Event 2: Approval Status & Histories */}
                  {selectedWoDetail.approval_request ? (
                    selectedWoDetail.approval_request.histories && selectedWoDetail.approval_request.histories.length > 0 ? (
                      selectedWoDetail.approval_request.histories.map((hist, hIdx) => {
                        const isApproved = hist.status === 'approved';
                        const isRejected = hist.status === 'rejected';
                        return (
                          <div key={hIdx} className="relative">
                            <span className={`absolute -left-6 top-0.5 w-3 h-3 rounded-full ring-4 ring-white ${
                              isApproved ? 'bg-emerald-500' : isRejected ? 'bg-rose-500' : 'bg-amber-500'
                            }`} />
                            <div className="text-xs">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-slate-900">
                                  Step {hist.step_order}: {isApproved ? 'Disetujui (Approved)' : isRejected ? 'Ditolak (Rejected)' : 'Review Dilakukan'}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {new Date(hist.action_at || hist.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-600 mt-0.5">
                                Disetujui oleh <strong className="text-slate-800">{hist.action_by_user?.name || 'Reviewer'}</strong> ({hist.action_by_user?.role || 'Approver'})
                                {hist.notes && <span className="block text-slate-500 italic mt-0.5">Catatan: "{hist.notes}"</span>}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="relative">
                        <span className="absolute -left-6 top-0.5 w-3 h-3 rounded-full bg-amber-400 ring-4 ring-white" />
                        <div className="text-xs">
                          <span className="font-bold text-amber-800">Menunggu Review: Step {selectedWoDetail.approval_request.current_step_order}/{selectedWoDetail.approval_request.total_steps}</span>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Sedang di-review oleh: <strong className="text-slate-700">{selectedWoDetail.approval_request.current_approver_user?.name || 'Approver'}</strong>
                          </p>
                        </div>
                      </div>
                    )
                  ) : selectedWoDetail.approved_at && (
                    <div className="relative">
                      <span className="absolute -left-6 top-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-white" />
                      <div className="text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-900">Persetujuan Kuota PM Selesai</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {new Date(selectedWoDetail.approved_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          Disetujui oleh <strong className="text-slate-800">{selectedWoDetail.approved_by?.name || selectedWoDetail.approvedBy?.name || 'Project Manager'}</strong>.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Event 3: Pelaporan Fisik Storeroom */}
                  {(selectedWoDetail.boq_items || selectedWoDetail.boqItems || []).some((b) => (b.prepared_qty || 0) > 0) && (
                    <div className="relative">
                      <span className="absolute -left-6 top-0.5 w-3 h-3 rounded-full bg-blue-500 ring-4 ring-white" />
                      <div className="text-xs">
                        <span className="font-bold text-slate-900">Penyiapan Fisik Gudang (Storeroom Staging)</span>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          Total <strong>{(selectedWoDetail.boq_items || selectedWoDetail.boqItems || []).reduce((s, it) => s + Number(it.prepared_qty || 0), 0)} Pcs</strong> barang siap di staging bay gudang <strong>{selectedWoDetail.warehouse?.name}</strong>.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Event 4: Pengeluaran Material */}
                  {(selectedWoDetail.boq_items || selectedWoDetail.boqItems || []).some((b) => (b.withdrawn_qty || 0) > 0) && (
                    <div className="relative">
                      <span className="absolute -left-6 top-0.5 w-3 h-3 rounded-full bg-indigo-500 ring-4 ring-white" />
                      <div className="text-xs">
                        <span className="font-bold text-slate-900">Penarikan Material Keluar (Outbound RFID)</span>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          Total <strong>{(selectedWoDetail.boq_items || selectedWoDetail.boqItems || []).reduce((s, it) => s + Number(it.withdrawn_qty || 0), 0)} Pcs</strong> telah ditarik keluar oleh mandor lapangan.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-between items-center pt-3 border-t border-slate-100">
              <button
                onClick={() => setSelectedWoDetail(null)}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Tutup
              </button>

              <div className="flex gap-2">
                {(() => {
                  const bItems = selectedWoDetail.boq_items || selectedWoDetail.boqItems || [];
                  const totalQuota = bItems.reduce((s, it) => s + Number(it.quota_qty || 0), 0);
                  const totalWithdrawn = bItems.reduce((s, it) => s + Number(it.withdrawn_qty || 0), 0);
                  const totalRemaining = bItems.reduce((s, it) => s + Math.max(0, (it.quota_qty || 0) - (it.withdrawn_qty || 0) + (it.returned_qty || 0)), 0);
                  const isCompleted = selectedWoDetail.status === 'completed' || (totalQuota > 0 && totalRemaining === 0 && totalWithdrawn >= totalQuota);

                  if (isCompleted) {
                    return (
                      <div className="flex items-center gap-1.5 px-4 py-2 bg-purple-50 text-purple-700 border border-purple-200 rounded-xl text-xs font-bold">
                        <CheckCircle2 className="w-4 h-4 text-purple-600" />
                        <span>Selesai (100% Kuota Terpenuhi & Ditarik)</span>
                      </div>
                    );
                  }

                  if (selectedWoDetail.status === 'draft' && (!currentUser || ['superadmin', 'pm'].includes(currentUser.role))) {
                    return (
                      <button
                        onClick={() => handleApproveWo(selectedWoDetail.id)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Approve Kuota PM
                      </button>
                    );
                  }

                  if ((selectedWoDetail.status === 'approved' || selectedWoDetail.status === 'in_progress') && (!currentUser || ['superadmin', 'storeroom', 'pm'].includes(currentUser.role))) {
                    return (
                      <button
                        onClick={() => {
                          const wo = selectedWoDetail;
                          setSelectedWoDetail(null);
                          openPrepareModal(wo);
                        }}
                        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow cursor-pointer"
                      >
                        <ClipboardList className="w-4 h-4" />
                        Lapor Persiapan Storeroom
                      </button>
                    );
                  }

                  return null;
                })()}
              </div>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {/* Modal Storeroom Siapkan Barang */}
      {showPrepareModal && (
        <Portal>
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[100] animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-2xl w-full space-y-4 shadow-2xl my-8 max-h-[92vh] overflow-y-auto">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-800">Laporan Persiapan Fisik (Storeroom)</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Storeroom melaporkan kuantitas fisik material yang tersedia di rak untuk WO: <strong>{selectedWo?.wo_number}</strong>.
              </p>
            </div>

            <form onSubmit={handleSubmitPrepared} className="space-y-4 text-xs">
              <div className="space-y-2 border border-slate-200 p-2.5 rounded-2xl max-h-64 overflow-y-auto bg-slate-50/50">
                {preparedItems.map((item, idx) => (
                  <div key={item.item_id} className="flex justify-between items-center bg-white p-3 rounded-xl border border-slate-200">
                    <div>
                      <div className="font-bold text-slate-800">{item.item_name}</div>
                      <div className="text-[10px] text-emerald-700 font-mono font-semibold">Target Kuota PM: {item.quota_qty}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500 font-semibold">Disiapkan:</span>
                      <input
                        type="number"
                        min="0"
                        value={item.prepared_qty}
                        onChange={(e) => {
                          const newItems = [...preparedItems];
                          newItems[idx].prepared_qty = e.target.value;
                          setPreparedItems(newItems);
                        }}
                        className="w-20 p-1.5 border border-slate-300 rounded-lg text-right font-mono font-bold text-slate-800 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPrepareModal(false)}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-100 rounded-xl text-slate-700 font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingPrepared}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow cursor-pointer flex items-center gap-1.5"
                >
                  {submittingPrepared ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <span>Simpan Laporan Persiapan</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
        </Portal>
      )}

      {/* Modal Buat Work Order (WO) Baru */}
      {showCreateWoModal && (
        <Portal>
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[100] animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-5xl w-full space-y-5 shadow-2xl my-8 max-h-[94vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FolderKanban className="w-5 h-5 text-emerald-600" />
                <div>
                  <h2 className="text-base font-bold text-slate-800">Buat Work Order (WO) & Kuota BOQ Baru</h2>
                  <p className="text-[11px] text-slate-400">Tentukan kuota material rollout yang disetujui untuk ditarik ke lapangan.</p>
                </div>
              </div>
              <button onClick={() => setShowCreateWoModal(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateWoSubmit} className="space-y-4 text-xs">
              {/* Manual Draft Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-amber-50/70 border border-amber-200/80 rounded-2xl gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                  <Clock className="w-4 h-4 text-amber-600" />
                  <span>{woDraftSavedAt ? `Draf tersimpan: ${woDraftSavedAt}` : 'Draf WO: Belum tersimpan'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveWoDraft}
                    className="px-3 py-1.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition active:scale-95 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5 text-amber-700" />
                    <span>Simpan Draf Form</span>
                  </button>
                  {woDraftSavedAt && (
                    <>
                      <button
                        type="button"
                        onClick={handleLoadWoDraft}
                        className="px-3 py-1.5 bg-white hover:bg-blue-50 text-blue-700 border border-blue-300 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition active:scale-95 cursor-pointer"
                      >
                        <FolderDown className="w-3.5 h-3.5" />
                        <span>Muat Draf</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleClearWoDraft}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                        title="Hapus Draf"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Proyek Rollout FO *</label>
                  <select
                    required
                    value={newWo.project_id}
                    onChange={(e) => handleProjectChange(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500 transition"
                  >
                    <option value="">-- Pilih Proyek Rollout --</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Kontrak SPK Terkait (Opsional)</label>
                  <select
                    value={newWo.spk_id}
                    onChange={(e) => handleSpkChange(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500 transition"
                  >
                    <option value="">-- Tidak Terikat Kontrak SPK Tertentu --</option>
                    {spks.filter((s) => !newWo.project_id || s.project_id === parseInt(newWo.project_id, 10)).length > 0 && (
                      <optgroup label="⚡ Kontrak SPK Terkait Proyek Ini">
                        {spks
                          .filter((s) => !newWo.project_id || s.project_id === parseInt(newWo.project_id, 10))
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.spk_number}: {s.title}
                            </option>
                          ))}
                      </optgroup>
                    )}
                    {spks.filter((s) => newWo.project_id && s.project_id !== parseInt(newWo.project_id, 10)).length > 0 && (
                      <optgroup label="Kontrak SPK Proyek Lainnya">
                        {spks
                          .filter((s) => s.project_id !== parseInt(newWo.project_id, 10))
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.spk_number}: {s.title}
                            </option>
                          ))}
                      </optgroup>
                    )}
                  </select>
                </div>
              </div>

              {/* Project Auto-Sync Info Badge */}
              {newWo.project_id && (() => {
                const currentProj = projects.find((p) => p.id === parseInt(newWo.project_id, 10));
                const currentWh = warehouses.find((w) => w.id === parseInt(newWo.warehouse_id, 10));
                const currentSpk = spks.find((s) => s.id === parseInt(newWo.spk_id, 10));
                if (!currentProj) return null;
                return (
                  <div className="p-3 bg-gradient-to-r from-emerald-50 to-teal-50/60 border border-emerald-200/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-xs animate-fade-in">
                    <div className="flex items-start sm:items-center gap-2.5">
                      <div className="p-1.5 bg-emerald-600 text-white rounded-xl shrink-0 mt-0.5 sm:mt-0 shadow-xs">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-emerald-950 text-xs">Auto-Sync Data Proyek Aktif:</span>
                          <span className="text-[11px] font-bold px-2 py-0.5 bg-emerald-100/80 text-emerald-800 rounded-lg">
                            {currentProj.name} ({currentProj.code})
                          </span>
                        </div>
                        <p className="text-[11px] text-emerald-700 mt-0.5">
                          🏢 Gudang: <b className="text-emerald-900">{currentWh ? currentWh.name : 'Belum Terpilih'}</b>
                          {' • '}
                          📑 SPK: <b className="text-emerald-900">{currentSpk ? currentSpk.spk_number : 'Non-SPK / Mandiri'}</b>
                          {currentProj.client_name ? ` • Klien: ${currentProj.client_name}` : ''}
                        </p>
                      </div>
                    </div>
                    {currentSpk?.items && currentSpk.items.length > 0 && (
                      <button
                        type="button"
                        onClick={() => syncBoqRowsFromSpk(currentSpk.id)}
                        className="px-2.5 py-1.5 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition active:scale-95 cursor-pointer shrink-0 ml-auto sm:ml-0"
                        title="Muat ulang seluruh item material kontrak SPK"
                      >
                        <Zap className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Sinkronkan Material SPK ({currentSpk.items.length})</span>
                      </button>
                    )}
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Gudang Transit Material *</label>
                  <select
                    required
                    value={newWo.warehouse_id}
                    onChange={(e) => setNewWo({ ...newWo, warehouse_id: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500 transition"
                  >
                    <option value="">-- Pilih Gudang Transit --</option>
                    {/* Gudang yang melayani proyek ini */}
                    {warehouses.filter((wh) => {
                      if (!newWo.project_id) return true;
                      const pId = parseInt(newWo.project_id, 10);
                      const currentProj = projects.find((p) => p.id === pId);
                      return (
                        wh.project_id === pId ||
                        wh.projects?.some((pr) => pr.id === pId) ||
                        currentProj?.warehouses?.some((pw) => pw.id === wh.id)
                      );
                    }).length > 0 && (
                      <optgroup label="🏢 Gudang Proyek Ini & Shared Hub">
                        {warehouses
                          .filter((wh) => {
                            if (!newWo.project_id) return true;
                            const pId = parseInt(newWo.project_id, 10);
                            const currentProj = projects.find((p) => p.id === pId);
                            return (
                              wh.project_id === pId ||
                              wh.projects?.some((pr) => pr.id === pId) ||
                              currentProj?.warehouses?.some((pw) => pw.id === wh.id)
                            );
                          })
                          .map((wh) => {
                            const isShared = wh.projects && wh.projects.length > 1;
                            return (
                              <option key={wh.id} value={wh.id}>
                                {wh.name} ({wh.code}) {isShared ? '⚡ [Shared Hub]' : ''}
                              </option>
                            );
                          })}
                      </optgroup>
                    )}
                    {/* Gudang lainnya yang tidak terikat langsung */}
                    {newWo.project_id && warehouses.filter((wh) => {
                      const pId = parseInt(newWo.project_id, 10);
                      const currentProj = projects.find((p) => p.id === pId);
                      return !(
                        wh.project_id === pId ||
                        wh.projects?.some((pr) => pr.id === pId) ||
                        currentProj?.warehouses?.some((pw) => pw.id === wh.id)
                      );
                    }).length > 0 && (
                      <optgroup label="Gudang Proyek Lainnya">
                        {warehouses
                          .filter((wh) => {
                            const pId = parseInt(newWo.project_id, 10);
                            const currentProj = projects.find((p) => p.id === pId);
                            return !(
                              wh.project_id === pId ||
                              wh.projects?.some((pr) => pr.id === pId) ||
                              currentProj?.warehouses?.some((pw) => pw.id === wh.id)
                            );
                          })
                          .map((wh) => (
                            <option key={wh.id} value={wh.id}>
                              {wh.name} ({wh.code}) ⚠️ [Beda Proyek]
                            </option>
                          ))}
                      </optgroup>
                    )}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Nomor Work Order *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. WO-BGR-2026-002"
                    value={newWo.wo_number}
                    onChange={(e) => setNewWo({ ...newWo, wo_number: e.target.value.toUpperCase() })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-mono font-bold text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Judul Pekerjaan / Segmen Rollout *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Pemasangan 40 Tiang & Penarikan Kabel Segmen Baranangsiang - Katulampa"
                  value={newWo.title}
                  onChange={(e) => setNewWo({ ...newWo, title: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-semibold text-slate-800"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Target Selesai Pekerjaan</label>
                  <input
                    type="date"
                    value={newWo.target_completion_date}
                    onChange={(e) => setNewWo({ ...newWo, target_completion_date: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-medium"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Catatan PM</label>
                  <input
                    type="text"
                    placeholder="e.g. Prioritas penyambungan kabel feeder utama"
                    value={newWo.notes}
                    onChange={(e) => setNewWo({ ...newWo, notes: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              {/* BOQ Items Builder */}
              <div className="border border-slate-200 rounded-2xl p-3.5 bg-slate-50/60 space-y-3">
                <div className="flex flex-wrap justify-between items-center gap-2">
                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-emerald-600" />
                    <span>Rincian Kuota Material BOQ (Kunci Kuota PM):</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {newWo.spk_id && (() => {
                      const selectedSpk = spks.find((s) => s.id === parseInt(newWo.spk_id, 10));
                      if (!selectedSpk?.items?.length) return null;
                      return (
                        <button
                          type="button"
                          onClick={() => syncBoqRowsFromSpk(newWo.spk_id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded-lg font-bold text-[11px] transition cursor-pointer shadow-2xs active:scale-95"
                          title="Muat ulang seluruh item material dari kontrak SPK"
                        >
                          <Zap className="w-3.5 h-3.5 text-blue-600" />
                          <span>Isi dari SPK ({selectedSpk.items.length})</span>
                        </button>
                      );
                    })()}
                    <button
                      type="button"
                      onClick={handleAddBoqRow}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg font-bold text-[11px] transition cursor-pointer shadow-2xs active:scale-95"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah Material</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {boqRows.map((row, idx) => {
                    const itemObj = availableItems.find((it) => it.id === parseInt(row.item_id, 10));
                    const whStock = getWarehouseStock(row.item_id, newWo.warehouse_id);
                    const spkInfo = getSpkQuotaInfo(row.item_id, newWo.spk_id);
                    const selectedWh = warehouses.find((w) => w.id === parseInt(newWo.warehouse_id, 10));
                    const unit = itemObj?.unit || 'Unit';
                    const qty = parseInt(row.quota_qty, 10) || 1;

                    const isOverWarehouseStock = row.item_id && qty > whStock;
                    const isOverSpkQuota = Boolean(newWo.spk_id && spkInfo && spkInfo.inSpk && qty > spkInfo.remaining);
                    const isNotInSpk = Boolean(newWo.spk_id && spkInfo && !spkInfo.inSpk);

                    return (
                      <div key={idx} className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs space-y-2.5">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                          <div className="flex-1">
                            <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Material Rollout FO</label>
                            <select
                              required
                              value={row.item_id}
                              onChange={(e) => handleUpdateBoqRow(idx, 'item_id', e.target.value)}
                              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-xs text-slate-800"
                            >
                              <option value="">-- Pilih Material FO --</option>
                              {availableItems.map((it) => (
                                <option key={it.id} value={it.id}>
                                  {it.name} ({it.unit}): {it.code}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="w-full sm:w-36">
                            <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Target Kuota ({unit})</label>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min={1}
                                required
                                placeholder="1"
                                value={row.quota_qty}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value, 10) || 1);
                                  handleUpdateBoqRow(idx, 'quota_qty', val);
                                }}
                                className={`w-full p-2 border rounded-xl text-right font-mono font-bold text-xs ${
                                  isOverSpkQuota
                                    ? 'border-rose-400 bg-rose-50/50 text-rose-800 focus:ring-rose-500'
                                    : isOverWarehouseStock
                                    ? 'border-amber-400 bg-amber-50/40 text-amber-900 focus:ring-amber-500'
                                    : 'border-slate-200 bg-slate-50 text-slate-800'
                                }`}
                              />
                            </div>
                          </div>

                          <div className="flex-1">
                            <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Catatan Teknis / Spec</label>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                placeholder="e.g. Feeder utama, segmen 1"
                                value={row.notes}
                                onChange={(e) => handleUpdateBoqRow(idx, 'notes', e.target.value)}
                                className="w-full p-2 border border-slate-200 rounded-xl text-xs bg-slate-50"
                              />
                              {boqRows.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveBoqRow(idx)}
                                  className="p-2 text-slate-400 hover:text-rose-600 rounded-xl hover:bg-rose-50 transition shrink-0 cursor-pointer"
                                  title="Hapus Material"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Real-time Inventory & SPK Badges + Shortcuts */}
                        {row.item_id && (
                          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {/* Warehouse Stock Badge */}
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg font-medium ${
                                  whStock > 0
                                    ? 'bg-blue-50 text-blue-800 border border-blue-200'
                                    : 'bg-slate-100 text-slate-500 border border-slate-200'
                                }`}
                                title={`Stok fisik aktif di ${selectedWh?.name || 'Gudang'}`}
                              >
                                <Package className="w-3 h-3 text-blue-600" />
                                <span>Stok Gudang: <b className="font-mono">{whStock}</b> {unit}</span>
                              </span>

                              {/* SPK Quota Badge */}
                              {newWo.spk_id && spkInfo && (
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg font-medium ${
                                    !spkInfo.inSpk
                                      ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                      : spkInfo.remaining > 0
                                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                                  }`}
                                  title="Sisa kuota kontrak SPK setelah dikurangi alokasi WO lain"
                                >
                                  <FileText className="w-3 h-3 text-emerald-600" />
                                  {spkInfo.inSpk ? (
                                    <span>Sisa SPK: <b className="font-mono">{spkInfo.remaining}</b> / {spkInfo.target_qty} {unit}</span>
                                  ) : (
                                    <span>Tidak terdaftar di SPK ini</span>
                                  )}
                                </span>
                              )}
                            </div>

                            {/* Quick Shortcuts */}
                            <div className="flex items-center gap-1.5 ml-auto">
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Pintasan:</span>
                              {whStock > 0 && (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateBoqRow(idx, 'quota_qty', whStock)}
                                  className="px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-[10px] font-bold flex items-center gap-1 transition active:scale-95 cursor-pointer"
                                  title="Isi Qty sama dengan seluruh stok gudang saat ini"
                                >
                                  <Zap className="w-2.5 h-2.5 text-blue-600" />
                                  <span>Max Stok ({whStock})</span>
                                </button>
                              )}

                              {newWo.spk_id && spkInfo && spkInfo.inSpk && spkInfo.remaining > 0 && (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateBoqRow(idx, 'quota_qty', spkInfo.remaining)}
                                  className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-bold flex items-center gap-1 transition active:scale-95 cursor-pointer"
                                  title="Isi Qty sama dengan sisa kuota kontrak SPK"
                                >
                                  <Zap className="w-2.5 h-2.5 text-emerald-600" />
                                  <span>Max SPK ({spkInfo.remaining})</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleUpdateBoqRow(idx, 'quota_qty', 1)}
                                className="px-2 py-0.5 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-[10px] font-bold transition active:scale-95 cursor-pointer"
                                title="Reset ke kuota default minimal (1)"
                              >
                                Min (1)
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Warnings & Alerts */}
                        {isOverSpkQuota && (
                          <div className="p-2 bg-rose-50 border border-rose-200 rounded-xl text-[11px] text-rose-800 flex items-start gap-1.5 animate-fade-in font-medium">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                            <span>
                              <b>Melebihi Kuota SPK:</b> Qty ({qty} {unit}) melebihi sisa kontrak SPK #{spkInfo.spk_number} ({spkInfo.remaining} {unit}). Sesuaikan kuota atau ajukan Addendum SPK.
                            </span>
                          </div>
                        )}

                        {!isOverSpkQuota && isOverWarehouseStock && (
                          <div className="p-2 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 flex items-start gap-1.5 animate-fade-in">
                            <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                            <span>
                              <b>Perhatian Stok Gudang:</b> Qty ({qty} {unit}) melebihi stok fisik gudang ({whStock} {unit}). WO tetap bisa dibuat untuk perencanaan, pastikan jadwal Delivery Principal tiba sebelum tanggal penarikan.
                            </span>
                          </div>
                        )}

                        {isNotInSpk && (
                          <div className="p-2 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 flex items-start gap-1.5 animate-fade-in">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                            <span>
                              <b>Item di luar Kontrak:</b> Material ini tidak tertera dalam kontrak SPK #{spkInfo.spk_number}. Pastikan bukan pekerjaan di luar perjanjian komersial.
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateWoModal(false)}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-50 rounded-xl text-slate-700 font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveWoDraft}
                  className="px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl font-bold transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <Save className="w-4 h-4 text-amber-700" />
                  <span>Simpan Draf</span>
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow transition cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Buat Work Order</span>
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
