import React, { useState, useEffect } from 'react';
import { spkApi, deliveryApi, masterApi, uploadApi, approvalApi, devicesApi, tagApi } from '../services/api';
import { openAuthenticatedEdgeSocket } from '../services/edgeWebSocket';
import { showToast } from '../components/Toast';
import Portal from '../components/Portal';
import {
  FileCheck,
  PackagePlus,
  AlertTriangle,
  CheckCircle,
  Clock,
  Plus,
  Eye,
  DollarSign,
  Truck,
  Radio,
  Scan,
  ShieldCheck,
  ArrowRightLeft,
  Upload,
  FileText,
  Image as ImageIcon,
  ExternalLink,
  X,
  Camera,
  Search,
  Filter,
  CheckCircle2,
  Trash2,
  Building2,
  Package,
  Layers,
  FileUp,
  Paperclip,
  Calculator,
  Info,
  Calendar,
  Sparkles,
  Save,
  FolderDown,
  Lock,
  Shield,
  UserCheck,
  History,
  Copy,
  ChevronDown,
  ChevronUp,
  Target
} from 'lucide-react';

export default function SpkProcurement({ defaultView = 'spk', currentUser = null, onNavigate = null }) {
  const [spks, setSpks] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [activeView, setActiveView] = useState(defaultView); // 'spk' | 'dispatch_scan' | 'receiving_scan' | 'deliveries'

  // Dynamic view switcher that synchronizes with Sidebar & URL hash
  const handleSwitchView = (newView) => {
    setActiveView(newView);
    if (onNavigate) {
      const viewToPageMap = {
        spk: 'spk-list',
        dispatch_scan: 'dispatch-scan',
        receiving_scan: 'receiving-scan',
        deliveries: 'deliveries-monitor',
      };
      if (viewToPageMap[newView]) {
        onNavigate(viewToPageMap[newView]);
      }
    }
  };

  // Manual Draft State for SPK Creation
  const [spkDraftSavedAt, setSpkDraftSavedAt] = useState(() => {
    try {
      const raw = localStorage.getItem('mosa_spk_draft');
      return raw ? JSON.parse(raw).timestamp : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (defaultView) {
      setActiveView(defaultView);
    }
  }, [defaultView]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedSpk, setSelectedSpk] = useState(null);
  const [warehouses, setWarehouses] = useState([]);
  const [principals, setPrincipals] = useState([]);
  const [projects, setProjects] = useState([]);
  const [availableItems, setAvailableItems] = useState([]);
  const [epcLookup, setEpcLookup] = useState({ value: '', loading: false, result: null });

  const handleEpcLookup = async (e) => {
    e.preventDefault();
    if (!epcLookup.value.trim()) return;
    setEpcLookup((prev) => ({ ...prev, loading: true, result: null }));
    try {
      const { data } = await tagApi.getTag(epcLookup.value.trim().toUpperCase());
      setEpcLookup((prev) => ({ ...prev, loading: false, result: data.tag }));
    } catch (err) {
      setEpcLookup((prev) => ({ ...prev, loading: false, result: { error: err.response?.status === 404 ? 'EPC tidak terdaftar' : (err.response?.data?.message || err.message) } }));
    }
  };

  // Create SPK Modal state
  const [showCreateSpkModal, setShowCreateSpkModal] = useState(false);
  const [createSpkForm, setCreateSpkForm] = useState({
    principal_id: '',
    project_id: '',
    spk_number: '',
    title: '',
    total_amount: 0,
    payment_status: 'unpaid',
    document_url: '',
    notes: '',
    items: [
      { item_id: '', target_qty: 1, price_per_unit: 0 },
    ],
  });

  // Dynamic projects filtered by selected principal for SPK creation
  const availableProjectsForSpk = React.useMemo(() => {
    if (!createSpkForm.principal_id) return [];
    const prinIdNum = parseInt(createSpkForm.principal_id, 10);
    return projects.filter((p) => p.principal_id === prinIdNum);
  }, [projects, createSpkForm.principal_id]);

  // Preview Modal for Photo / Document
  const [previewMedia, setPreviewMedia] = useState(null); // { url, type, title }
  const [selectedDeliveryDetail, setSelectedDeliveryDetail] = useState(null);

  // Handheld 1: Dispatch Form state (Principal Yard)
  const [dispatchForm, setDispatchForm] = useState({
    spk_id: '',
    warehouse_id: '',
    delivery_number: '',
    epc_text: '',
    item_id: '',
    qty: 10,
    proof_photo_url: '',
    document_url: '',
    notes: 'Muat dari Yard Principal MyRepublic',
  });

  // Multi-item dispatch allocations: { [itemId]: { selected: boolean, qty: number, epc_text: string, remaining_quota: number, target_qty: number, already_dispatched: number, item_name: string, item_code: string } }
  const [dispatchItemAllocations, setDispatchItemAllocations] = useState({});
  const [activeScanItemId, setActiveScanItemId] = useState(null);
  const activeScanItemIdRef = React.useRef(activeScanItemId);
  const selectedSpkRef = React.useRef(selectedSpk);

  useEffect(() => {
    activeScanItemIdRef.current = activeScanItemId;
  }, [activeScanItemId]);

  useEffect(() => {
    selectedSpkRef.current = selectedSpk;
  }, [selectedSpk]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (previewMedia) setPreviewMedia(null);
        else if (showCreateSpkModal) setShowCreateSpkModal(false);
        else if (selectedDeliveryDetail) setSelectedDeliveryDetail(null);
        else if (selectedSpk) setSelectedSpk(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewMedia, showCreateSpkModal, selectedDeliveryDetail, selectedSpk]);

  const initializeDispatchForSpk = (spk) => {
    if (!spk) return;
    setSelectedSpk(spk);
    selectedSpkRef.current = spk;
    const initialAlloc = {};
    let firstSelectedId = null;

    (spk.items || []).forEach((it) => {
      const alreadyDispatched = (spk.deliveries || [])
        .flatMap((d) => d.items || [])
        .filter((di) => di.item_id === it.item_id)
        .reduce((sum, di) => sum + Number(di.delivered_qty || 0), 0);

      const remaining = Math.max(0, Number(it.target_qty || 0) - alreadyDispatched);
      const isSelected = remaining > 0;
      if (isSelected && !firstSelectedId) {
        firstSelectedId = it.item_id;
      }

      initialAlloc[it.item_id] = {
        selected: isSelected,
        qty: remaining,
        epc_text: '',
        remaining_quota: remaining,
        target_qty: Number(it.target_qty || 0),
        already_dispatched: alreadyDispatched,
        item_name: it.item?.name || `Item #${it.item_id}`,
        item_code: it.item?.item_code || '',
      };
    });

    setDispatchItemAllocations(initialAlloc);
    setActiveScanItemId(firstSelectedId || (spk.items?.[0]?.item_id || null));
    setDispatchForm((prev) => ({
      ...prev,
      spk_id: spk.id,
      delivery_number: `SJ-${spk.principal?.code || 'PRIN'}-${Date.now().toString().slice(-4)}`,
      item_id: firstSelectedId || spk.items?.[0]?.item_id || 1,
      epc_text: '',
    }));
  };

  // Handheld 2: Receiving Scan state (Warehouse Receiving Bay)
  const [selectedDeliveryId, setSelectedDeliveryId] = useState('');
  const [receivingEpcsText, setReceivingEpcsText] = useState('');
  const [receivingPhotoUrl, setReceivingPhotoUrl] = useState('');
  const [receivingDocUrl, setReceivingDocUrl] = useState('');
  const [reconciliationResult, setReconciliationResult] = useState(null);
  const selectedDelivery = React.useMemo(() => deliveries.find((d) => d.id === parseInt(selectedDeliveryId, 10)) || null, [deliveries, selectedDeliveryId]);

  // Pre-Check Discrepancy Modal state
  const [discrepancyModalOpen, setDiscrepancyModalOpen] = useState(false);
  const [discrepancyData, setDiscrepancyData] = useState(null);
  const [escalationNotes, setEscalationNotes] = useState('');
  const [escalationPhotoUrl, setEscalationPhotoUrl] = useState('');
  const [escalationDocUrl, setEscalationDocUrl] = useState('');
  const [isSubmittingEscalation, setIsSubmittingEscalation] = useState(false);

  // Handheld 2: Material Manifest & Shortage Guidance state
  const [receivingMaterialFilter, setReceivingMaterialFilter] = useState('ALL'); // 'ALL' | 'SHORTAGE' | 'COMPLETED'
  const [highlightedItemId, setHighlightedItemId] = useState(null);
  const [expandedReceivingItemIds, setExpandedReceivingItemIds] = useState({});

  // Real-time calculation of material breakdown in arriving truck (Manifest vs Scanned vs Missing)
  const receivingMaterialsBreakdown = React.useMemo(() => {
    const del = deliveries.find((d) => d.id === parseInt(selectedDeliveryId, 10));
    if (!del || !del.items || del.items.length === 0) return [];

    const isDeliveryCompleted = del.status === 'approved' || del.reconciliation_status === 'matched';
    const textEpcs = receivingEpcsText
      .split('\n')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    // If delivery is completed or historical received exists, incorporate into active scanned pool
    const historicalReceived = Array.isArray(del.received_epcs_json)
      ? del.received_epcs_json.map((s) => s.trim().toUpperCase()).filter(Boolean)
      : [];
    const effectiveScannedEpcs = (textEpcs.length > 0)
      ? textEpcs
      : (isDeliveryCompleted ? historicalReceived : []);

    const scannedSet = new Set(effectiveScannedEpcs);
    const dispatchedEpcs = Array.isArray(del.dispatch_epcs_json) ? del.dispatch_epcs_json : [];
    const epcItemsMap = del.epc_items_map || {};

    return del.items.map((di) => {
      const itemId = di.item_id;
      const itemName = di.item?.name || `Item #${itemId}`;
      const itemCode = di.item?.code || di.item?.item_code || '-';
      const unit = di.item?.unit || 'Unit';
      const manifestQty = Number(di.delivered_qty) || 0;

      // Dispatched EPCs for this specific item
      let itemManifestEpcs = [];
      if (Array.isArray(di.dispatched_epcs) && di.dispatched_epcs.length > 0) {
        itemManifestEpcs = di.dispatched_epcs;
      } else {
        itemManifestEpcs = dispatchedEpcs.filter((epc) => {
          const mapped = epcItemsMap[epc];
          return mapped ? Number(mapped.item_id) === Number(itemId) : false;
        });
        if (itemManifestEpcs.length === 0 && del.items.length === 1) {
          itemManifestEpcs = dispatchedEpcs;
        }
      }

      // Reconcile scanned vs manifest
      let scannedForThisItem = itemManifestEpcs.filter((epc) => scannedSet.has(epc));
      let missingForThisItem = itemManifestEpcs.filter((epc) => !scannedSet.has(epc));

      // Extra scanned tags mapped to this item that were not in manifest
      const extraScannedForThisItem = effectiveScannedEpcs.filter((epc) => {
        if (itemManifestEpcs.includes(epc)) return false;
        const mapped = epcItemsMap[epc];
        return mapped ? Number(mapped.item_id) === Number(itemId) : false;
      });

      let totalScannedCount = scannedForThisItem.length + extraScannedForThisItem.length;

      // When delivery is already completed (100% matched & approved), ensure stats reflect verified arrival
      if (isDeliveryCompleted) {
        if (totalScannedCount === 0 && manifestQty > 0) {
          totalScannedCount = manifestQty;
        }
        if (scannedForThisItem.length === 0 && itemManifestEpcs.length > 0) {
          scannedForThisItem = itemManifestEpcs;
        }
        missingForThisItem = [];
      }

      const missingCount = Math.max(0, manifestQty - totalScannedCount);
      const isCompleted = manifestQty > 0 && totalScannedCount >= manifestQty;
      const percent = manifestQty > 0 ? Math.min(100, Math.round((totalScannedCount / manifestQty) * 100)) : 0;

      return {
        itemId,
        itemName,
        itemCode,
        unit,
        manifestQty,
        manifestEpcs: itemManifestEpcs,
        scannedEpcs: [...scannedForThisItem, ...extraScannedForThisItem],
        missingEpcs: isDeliveryCompleted ? [] : missingForThisItem,
        scannedCount: totalScannedCount,
        missingCount,
        isCompleted,
        percent,
      };
    });
  }, [deliveries, selectedDeliveryId, receivingEpcsText]);

  // Synchronize textarea with historical received EPCs when switching delivery
  useEffect(() => {
    if (!selectedDeliveryId) return;
    const del = deliveries.find((d) => d.id === parseInt(selectedDeliveryId, 10));
    if (del) {
      const isCompleted = del.status === 'approved' || del.reconciliation_status === 'matched';
      if (isCompleted && Array.isArray(del.received_epcs_json) && del.received_epcs_json.length > 0) {
        setReceivingEpcsText(del.received_epcs_json.join('\n'));
      }
    }
  }, [selectedDeliveryId, deliveries]);

  // Direct guidance action: highlight and expand a specific material (e.g. missing items)
  const handleFocusShortageItem = (targetItemId) => {
    setReceivingMaterialFilter('ALL');
    setHighlightedItemId(targetItemId);
    setExpandedReceivingItemIds((prev) => ({ ...prev, [targetItemId]: true }));
    setTimeout(() => {
      const el = document.getElementById(`receiving-item-card-${targetItemId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);
  };

  const handleCopyMissingEpcs = (item) => {
    if (!item.missingEpcs || item.missingEpcs.length === 0) return;
    navigator.clipboard.writeText(item.missingEpcs.join('\n'));
    showToast(`Daftar ${item.missingEpcs.length} EPC belum tiba untuk "${item.itemName}" berhasil disalin ke clipboard!`, 'success');
  };

  // Authorization helper: Only the originator/creator of the SPK (or superadmin) can dispatch
  const canDispatchSpk = (spk) => {
    if (!spk) return false;
    if (!currentUser) return true;
    if (currentUser.role === 'superadmin') return true;
    const creatorId = spk.created_by_user_id || spk.created_by?.id || spk.createdBy?.id || spk.approval_request?.requester_user_id;
    if (creatorId) {
      return Number(creatorId) === Number(currentUser.id);
    }
    return currentUser.role === 'procurement';
  };

  // Quota & Fulfillment helper: Calculate target vs dispatched/delivered quantities
  const getSpkFulfillment = (spk) => {
    if (!spk) return { totalTarget: 0, totalDelivered: 0, totalDispatched: 0, isCompleted: false, percent: 0 };
    const totalTarget = spk.items?.reduce((sum, it) => sum + Number(it.target_qty || 0), 0) || 0;
    const totalReceived = spk.items?.reduce((sum, it) => sum + Number(it.received_qty || 0), 0) || 0;
    
    // Total tags dispatched across all deliveries for this SPK
    const totalDispatched = spk.deliveries?.reduce((sum, d) => {
      const epcCount = Array.isArray(d.dispatch_epcs_json) ? d.dispatch_epcs_json.length : 0;
      return sum + epcCount;
    }, 0) || 0;

    // A SPK is considered completed/fulfilled if dispatched or received meets or exceeds target
    const effectiveProgress = Math.max(totalReceived, totalDispatched);
    const isCompleted = totalTarget > 0 && effectiveProgress >= totalTarget;
    const percent = totalTarget > 0 ? Math.min(100, Math.round((effectiveProgress / totalTarget) * 100)) : 0;

    return {
      totalTarget,
      totalReceived,
      totalDispatched,
      effectiveProgress,
      isCompleted,
      percent,
    };
  };

  // Live RFID Reader WebSocket Connection (Port 2078)
  const [wsConnected, setWsConnected] = useState(false);
  const [lastScannedEpc, setLastScannedEpc] = useState(null);
  const [readerDevices, setReaderDevices] = useState([]);
  const [selectedReaderId, setSelectedReaderId] = useState('');
  const [readerError, setReaderError] = useState('');
  const wsRef = React.useRef(null);
  const activeViewRef = React.useRef(activeView);
  const scanWarehouseId = activeView === 'dispatch_scan'
    ? Number(dispatchForm.warehouse_id)
    : activeView === 'receiving_scan' ? Number(selectedDelivery?.warehouse_id) : 0;

  useEffect(() => { activeViewRef.current = activeView; }, [activeView]);

  useEffect(() => {
    let cancelled = false;
    setReaderDevices([]);
    setSelectedReaderId('');
    if (!scanWarehouseId) return undefined;
    devicesApi.getDevices({ warehouse_id: scanWarehouseId, handheld_eligible: 1 })
      .then(({ data }) => {
        if (cancelled) return;
        const devices = data || [];
        setReaderDevices(devices);
        if (devices.length === 1) setSelectedReaderId(String(devices[0].id));
      })
      .catch(() => !cancelled && setReaderError('Daftar reader handheld gagal dimuat.'));
    return () => { cancelled = true; };
  }, [scanWarehouseId]);

  useEffect(() => {
    let ws = null;
    let reconnectTimer = null;
    let isUnmounted = false;

    const warehouseId = scanWarehouseId;
    if (!['dispatch_scan', 'receiving_scan'].includes(activeView) || !warehouseId || !selectedReaderId) return undefined;

    const connectWs = async () => {
      if (isUnmounted) return;
      try {
        ws = await openAuthenticatedEdgeSocket(warehouseId, ['SET_MODE:ENROLLMENT'], {
          onAuthenticated: (socket) => {
            if (isUnmounted) return socket.close();
            socket.send(JSON.stringify({ action: 'SET_MODE', mode: 'ENROLLMENT' }));
            setReaderError(''); setWsConnected(true);
          },
          onClose: () => { if (!isUnmounted) { setWsConnected(false); reconnectTimer = setTimeout(connectWs, 3000); } },
          onError: () => { if (!isUnmounted) setWsConnected(false); },
          onMessage: (data) => {
            if (data.type !== 'TAG_READ' || !data.epc) return;
            if (Number(data.warehouse_id) !== warehouseId || data.operational_mode !== 'ENROLLMENT') return;
            const cleanEpc = data.epc.toUpperCase().trim();
            setLastScannedEpc(cleanEpc);
            if (activeViewRef.current === 'dispatch_scan') {
              const curSpk = selectedSpkRef.current;
              if (!(curSpk && getSpkFulfillment(curSpk).isCompleted)) {
              setDispatchItemAllocations((prevAlloc) => {
                const currentActiveId = activeScanItemIdRef.current;
                const targetItemId = (currentActiveId && prevAlloc[currentActiveId]?.selected) ? currentActiveId : Object.keys(prevAlloc).find((id) => prevAlloc[id]?.selected);
                if (!targetItemId || !prevAlloc[targetItemId]) return prevAlloc;
                const curItem = prevAlloc[targetItemId];
                const curEpcs = (curItem.epc_text || '').split('\n').map((s) => s.trim().toUpperCase()).filter(Boolean);
                return curEpcs.includes(cleanEpc) ? prevAlloc : { ...prevAlloc, [targetItemId]: { ...curItem, epc_text: curEpcs.length ? `${curItem.epc_text.trim()}\n${cleanEpc}` : cleanEpc } };
              });
              }
            }
            if (activeViewRef.current === 'receiving_scan') setReceivingEpcsText((prev) => {
              const currentList = prev.split('\n').map((s) => s.trim().toUpperCase()).filter(Boolean);
              return currentList.includes(cleanEpc) ? prev : (currentList.length ? `${prev.trim()}\n${cleanEpc}` : cleanEpc);
            });
          },
        }, selectedReaderId, activeView === 'dispatch_scan' ? 'HANDHELD_DISPATCH' : 'HANDHELD_RECEIVING');
        if (isUnmounted) return ws.close();
        wsRef.current = ws;
      } catch (e) {
        if (!isUnmounted) { setWsConnected(false); setReaderError(e.response?.data?.message || e.message || 'Reader gagal terhubung.'); reconnectTimer = setTimeout(connectWs, 3000); }
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
  }, [activeView, scanWarehouseId, selectedReaderId]);

  // Search, Filter & Detail Drawer states
  const [spkSearch, setSpkSearch] = useState('');
  const [spkStatusFilter, setSpkStatusFilter] = useState('ALL');
  const [spkPrincipalFilter, setSpkPrincipalFilter] = useState('ALL');
  const [spkApprovalFilter, setSpkApprovalFilter] = useState('ALL'); // 'ALL' | 'my_turn' | 'pending' | 'approved' | 'rejected'
  const [selectedSpkDetail, setSelectedSpkDetail] = useState(null);

  // Approval Action Modal states (Direct Action in Menu)
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [selectedSpkForApproval, setSelectedSpkForApproval] = useState(null);
  const [approvalActionType, setApprovalActionType] = useState('approved');
  const [approvalComments, setApprovalComments] = useState('');
  const [processingApproval, setProcessingApproval] = useState(false);

  const canApproveSpk = (spk) => {
    if (!currentUser || !spk || !spk.approval_request) return false;
    const req = spk.approval_request;
    if (req.status !== 'pending' && req.status !== 'revision_requested') return false;
    if (currentUser.role === 'superadmin') return true;
    if (Number(req.current_approver_user_id) === Number(currentUser.id)) return true;
    if (currentUser.role === 'pm' && (req.current_step_order === 1 || !req.current_approver_user_id)) return true;
    if (currentUser.role === 'management' && req.current_step_order >= 2) return true;
    return false;
  };

  const handleOpenSpkApproval = (spk, actionType = 'approved') => {
    setSelectedSpkForApproval(spk);
    setApprovalActionType(actionType);
    setApprovalComments('');
    setApprovalModalOpen(true);
  };

  const handleSubmitSpkApproval = async () => {
    if (!selectedSpkForApproval || !currentUser) return;
    const appReq = selectedSpkForApproval.approval_request;
    if (!appReq) {
      showToast('Permohonan approval untuk SPK ini tidak ditemukan.', 'warning');
      return;
    }
    if ((approvalActionType === 'rejected' || approvalActionType === 'revision_requested') && !approvalComments.trim()) {
      showToast('Wajib mengisi catatan/alasan penolakan atau revisi.', 'warning');
      return;
    }

    setProcessingApproval(true);
    try {
      await approvalApi.processAction(appReq.id, {
        action: approvalActionType,
        user_id: currentUser.id,
        comments: approvalComments,
      });

      const labels = {
        approved: 'disetujui',
        rejected: 'ditolak',
        revision_requested: 'dimintakan revisi',
      };
      showToast(`Kontrak SPK #${selectedSpkForApproval.spk_number} berhasil ${labels[approvalActionType]}!`, 'success');
      const approvedSpkId = selectedSpkForApproval.id;
      setApprovalModalOpen(false);
      setSelectedSpkForApproval(null);
      if (selectedSpkDetail?.id === approvedSpkId) {
        setSelectedSpkDetail(null);
      }
      setSpks((prev) =>
        prev.map((s) =>
          s.id === approvedSpkId
            ? {
                ...s,
                approval_request: s.approval_request
                  ? { ...s.approval_request, status: approvalActionType }
                  : null,
              }
            : s
        )
      );
      loadAll(false);
    } catch (err) {
      showToast(err.response?.data?.message || 'Gagal memproses approval SPK', 'error');
    } finally {
      setProcessingApproval(false);
    }
  };

  const [deliverySearch, setDeliverySearch] = useState('');
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState('ALL');

  const filteredSpks = spks.filter((spk) => {
    const matchSearch =
      spk.spk_number.toLowerCase().includes(spkSearch.toLowerCase()) ||
      spk.title.toLowerCase().includes(spkSearch.toLowerCase()) ||
      (spk.principal?.name || '').toLowerCase().includes(spkSearch.toLowerCase());
    const matchStatus = spkStatusFilter === 'ALL' || spk.payment_status === spkStatusFilter;
    const matchPrincipal = spkPrincipalFilter === 'ALL' || spk.principal_id === parseInt(spkPrincipalFilter, 10);

    let matchApproval = true;
    const appReq = spk.approval_request;
    if (spkApprovalFilter === 'approved') {
      matchApproval = !appReq || appReq.status === 'approved';
    } else if (spkApprovalFilter === 'pending') {
      matchApproval = appReq && (appReq.status === 'pending' || appReq.status === 'revision_requested');
    } else if (spkApprovalFilter === 'rejected') {
      matchApproval = appReq && appReq.status === 'rejected';
    } else if (spkApprovalFilter === 'my_turn') {
      matchApproval = canApproveSpk(spk);
    }

    return matchSearch && matchStatus && matchPrincipal && matchApproval;
  });

  const filteredDeliveries = deliveries.filter((del) => {
    const matchSearch =
      del.delivery_number.toLowerCase().includes(deliverySearch.toLowerCase()) ||
      (del.spk?.spk_number || '').toLowerCase().includes(deliverySearch.toLowerCase()) ||
      (del.spk?.principal?.name || '').toLowerCase().includes(deliverySearch.toLowerCase());
    const matchStatus =
      deliveryStatusFilter === 'ALL' ||
      del.status === deliveryStatusFilter ||
      del.reconciliation_status === deliveryStatusFilter;
    return matchSearch && matchStatus;
  });

  const loadAll = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const [spkRes, delRes, whRes, prinRes, projRes, itemRes] = await Promise.all([
        spkApi.getSpks(),
        deliveryApi.getDeliveries(),
        masterApi.getWarehouses(),
        masterApi.getPrincipals(),
        masterApi.getProjects(),
        masterApi.getItems(),
      ]);
      setSpks(spkRes.data);
      setDeliveries(delRes.data);
      setWarehouses(whRes.data);
      setPrincipals(prinRes.data);
      setProjects(projRes.data);
      setAvailableItems(itemRes.data);
      if (spkRes.data.length > 0 && !selectedSpk) {
        initializeDispatchForSpk(spkRes.data[0]);
        setDispatchForm((prev) => ({
          ...prev,
          warehouse_id: whRes.data[0]?.id || 1,
        }));
      }
      if (delRes.data.length > 0 && !selectedDeliveryId) {
        setSelectedDeliveryId(delRes.data[0].id);
      }
    } catch (err) {
      console.error('Error loading SPK & Deliveries:', err);
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  // Generic File Upload Handler
  const handleFileUpload = async (file, folder, onSuccess) => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadApi.uploadFile(file, folder);
      onSuccess(res.data.url);
      showToast(`Berhasil mengunggah: ${res.data.original_name}`, 'success');
    } catch (err) {
      showToast('Gagal unggah file: ' + (err.response?.data?.message || err.message), 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleAddItemRow = () => {
    setCreateSpkForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        { item_id: availableItems[0]?.id || '', target_qty: 1, price_per_unit: 0 },
      ],
    }));
  };

  const handleRemoveItemRow = (index) => {
    setCreateSpkForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, idx) => idx !== index),
    }));
  };

  const handleUpdateItemRow = (index, field, value) => {
    setCreateSpkForm((prev) => {
      const updated = [...prev.items];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, items: updated };
    });
  };

  const handleSaveSpkDraft = () => {
    try {
      const nowStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
      const data = { form: createSpkForm, timestamp: nowStr };
      localStorage.setItem('mosa_spk_draft', JSON.stringify(data));
      setSpkDraftSavedAt(nowStr);
      showToast(`💾 Draf Kontrak SPK tersimpan (${nowStr})`, 'success');
    } catch (e) {
      showToast('Gagal simpan draf SPK: ' + e.message, 'error');
    }
  };

  const handleLoadSpkDraft = () => {
    try {
      const raw = localStorage.getItem('mosa_spk_draft');
      if (!raw) return showToast('Belum ada draf SPK yang tersimpan.', 'info');
      const data = JSON.parse(raw);
      if (data.form) setCreateSpkForm(data.form);
      showToast(`📂 Draf SPK (${data.timestamp}) berhasil dimuat!`, 'success');
    } catch (e) {
      showToast('Gagal memuat draf: ' + e.message, 'error');
    }
  };

  const handleClearSpkDraft = () => {
    localStorage.removeItem('mosa_spk_draft');
    setSpkDraftSavedAt(null);
    showToast('Draf SPK dibersihkan.', 'info');
  };

  const handleCreateSpkSubmit = async (e) => {
    e.preventDefault();
    if (!createSpkForm.principal_id) {
      showToast('Silakan pilih Principal.', 'warning');
      return;
    }
    if (!createSpkForm.spk_number) {
      showToast('Masukkan nomor SPK.', 'warning');
      return;
    }
    if (createSpkForm.items.length === 0 || !createSpkForm.items[0].item_id) {
      showToast('Tentukan minimal 1 jenis material.', 'warning');
      return;
    }

    const calculatedTotal = createSpkForm.items.reduce(
      (sum, it) => sum + (Number(it.target_qty || 0) * Number(it.price_per_unit || 0)),
      0
    );

    const payload = {
      principal_id: parseInt(createSpkForm.principal_id, 10),
      project_id: createSpkForm.project_id ? parseInt(createSpkForm.project_id, 10) : null,
      spk_number: createSpkForm.spk_number,
      title: createSpkForm.title,
      total_amount: calculatedTotal,
      payment_status: createSpkForm.payment_status,
      document_url: createSpkForm.document_url || null,
      notes: createSpkForm.notes || null,
      items: createSpkForm.items.map((it) => ({
        item_id: parseInt(it.item_id, 10),
        target_qty: parseInt(it.target_qty, 10),
        price_per_unit: parseFloat(it.price_per_unit),
      })),
      payment_terms_json: [
        { term: 1, percentage: 30, amount: Math.round(calculatedTotal * 0.3), status: createSpkForm.payment_status === 'paid' ? 'paid' : 'unpaid' },
        { term: 2, percentage: 50, amount: Math.round(calculatedTotal * 0.5), status: createSpkForm.payment_status === 'paid' ? 'paid' : 'unpaid' },
        { term: 3, percentage: 20, amount: Math.round(calculatedTotal * 0.2), status: createSpkForm.payment_status === 'paid' ? 'paid' : 'unpaid' },
      ],
    };

    try {
      const res = await spkApi.createSpk(payload);
      showToast(`Kontrak SPK Berhasil Dibuat!\nNo. SPK: ${res.data.spk?.spk_number || createSpkForm.spk_number}`, 'success');
      setShowCreateSpkModal(false);
      const createdSpk = res.data.spk || res.data;
      if (createdSpk) {
        const fullSpk = {
          ...createdSpk,
          principal: principals.find((p) => p.id === createdSpk.principal_id) || createdSpk.principal,
          project: projects.find((p) => p.id === createdSpk.project_id) || createdSpk.project,
          items: createdSpk.items || payload.items.map((it) => ({
            ...it,
            item: availableItems.find((a) => a.id === it.item_id),
          })),
          deliveries: createdSpk.deliveries || [],
        };
        setSpks((prev) => [fullSpk, ...(Array.isArray(prev) ? prev.filter((s) => s.id !== fullSpk.id) : [])]);
      }
      loadAll(false);
    } catch (err) {
      showToast('Gagal buat SPK: ' + (err.response?.data?.message || err.message), 'error');
    }
  };

  const handleDispatchSubmit = async (e) => {
    e.preventDefault();

    const selectedEntries = Object.entries(dispatchItemAllocations).filter(
      ([id, alloc]) => alloc.selected && Number(alloc.qty) > 0
    );

    if (selectedEntries.length === 0) {
      showToast('Pilih minimal 1 jenis material muatan dan tentukan kuantitinya.', 'warning');
      return;
    }

    const itemsPayload = [];
    let allDispatchedEpcs = [];

    for (const [id, alloc] of selectedEntries) {
      const epcList = (alloc.epc_text || '')
        .split('\n')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);

      if (epcList.length === 0) {
        showToast(`Daftar tag EPC untuk ${alloc.item_name} belum di-scan.`, 'warning');
        return;
      }

      if (epcList.length !== Number(alloc.qty)) {
        showToast(
          `Jumlah tag EPC untuk ${alloc.item_name} (${epcList.length} tag) harus sama dengan kuantiti rencana (${alloc.qty} unit).`,
          'warning'
        );
        return;
      }

      itemsPayload.push({
        item_id: parseInt(id, 10),
        delivered_qty: Number(alloc.qty),
        epcs: epcList,
      });

      allDispatchedEpcs = allDispatchedEpcs.concat(epcList);
    }

    // Check duplicate EPCs across all items
    const uniqueEpcs = new Set(allDispatchedEpcs);
    if (uniqueEpcs.size !== allDispatchedEpcs.length) {
      showToast('Terdapat duplikasi tag EPC antar barang muatan. Setiap fisik tag harus unik.', 'warning');
      return;
    }

    try {
      setUploading(true);
      const res = await deliveryApi.recordDispatchScan({
        spk_id: parseInt(dispatchForm.spk_id, 10),
        warehouse_id: parseInt(dispatchForm.warehouse_id, 10),
        delivery_number: dispatchForm.delivery_number,
        dispatch_epcs: allDispatchedEpcs,
        items: itemsPayload,
        proof_photo_url: dispatchForm.proof_photo_url || null,
        document_url: dispatchForm.document_url || null,
        notes: dispatchForm.notes,
      });

      showToast(
        `Manifest Surat Jalan ${res.data.delivery?.delivery_number || dispatchForm.delivery_number} berhasil dikunci dengan ${itemsPayload.length} jenis material (${allDispatchedEpcs.length} tag)!`,
        'success'
      );
      const newDel = res.data.delivery || res.data;
      if (newDel) {
        setDeliveries((prev) => [newDel, ...(Array.isArray(prev) ? prev.filter((d) => d.id !== newDel.id) : [])]);
      }
      loadAll(false);
      handleSwitchView('deliveries');
    } catch (err) {
      showToast('Gagal simpan dispatch scan: ' + (err.response?.data?.message || err.message), 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleReceivingSubmit = async (e) => {
    e.preventDefault();
    if (!selectedDeliveryId) {
      showToast('Pilih pengiriman surat jalan yang tiba.', 'warning');
      return;
    }

    const del = deliveries.find((d) => d.id === parseInt(selectedDeliveryId, 10));
    if (!del) {
      showToast('Data pengiriman surat jalan tidak ditemukan.', 'error');
      return;
    }

    const epcList = receivingEpcsText
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (epcList.length === 0) {
      showToast('Masukkan daftar EPC hasil scan bongkar truk.', 'warning');
      return;
    }

    // Bandingkan manifest keberangkatan pabrik (Handheld 1) vs penerimaan gudang (Handheld 2)
    const dispatchedEpcs = Array.isArray(del.dispatch_epcs_json) ? del.dispatch_epcs_json : [];
    const missingInTransit = dispatchedEpcs.filter((epc) => !epcList.includes(epc));
    const unexpected = epcList.filter((epc) => !dispatchedEpcs.includes(epc));
    const matched = dispatchedEpcs.filter((epc) => epcList.includes(epc));
    const isFullMatch = missingInTransit.length === 0 && unexpected.length === 0;

    // PREVIEW FIRST: Kedua skenario (Full Match maupun Mismatch) WAJIB menampilkan pratinjau dulu beserta aksi lanjutannya
    setDiscrepancyData({
      delivery: del,
      dispatched: dispatchedEpcs,
      received: epcList,
      matched,
      missingInTransit,
      unexpected,
      isFullMatch,
    });
    setEscalationNotes('');
    setEscalationPhotoUrl(receivingPhotoUrl || '');
    setEscalationDocUrl(receivingDocUrl || '');
    setDiscrepancyModalOpen(true);
  };

  const handleConfirmFullMatchRestock = async () => {
    if (!discrepancyData) return;

    setIsSubmittingEscalation(true);
    try {
      const res = await deliveryApi.recordReceivingScan(discrepancyData.delivery.id, {
        received_epcs: discrepancyData.received,
        proof_photo_url: receivingPhotoUrl || null,
        document_url: receivingDocUrl || null,
        notes: 'Hasil verifikasi 100% Cocok (Full Match) di loading bay gudang transit',
      });

      setReconciliationResult(res.data.reconciliation);
      const targetDelId = discrepancyData.delivery.id;
      setDiscrepancyModalOpen(false);
      setDiscrepancyData(null);
      setDeliveries((prev) =>
        prev.map((d) =>
          d.id === targetDelId
            ? { ...d, status: 'approved', reconciliation_status: 'matched' }
            : d
        )
      );
      loadAll(false);
      showToast('🎉 100% Cocok! Semua muatan diverifikasi lengkap dan telah direstock ke inventaris aktif gudang.', 'success');
    } catch (err) {
      showToast('Gagal verifikasi receiving: ' + (err.response?.data?.message || err.message), 'error');
    } finally {
      setIsSubmittingEscalation(false);
    }
  };

  const handleConfirmEscalationToPm = async () => {
    if (!discrepancyData) return;

    if (!escalationNotes.trim()) {
      showToast('Wajib mengisi Kronologi & Catatan Lapangan sebagai Berita Acara.', 'warning');
      return;
    }

    if (!escalationPhotoUrl.trim()) {
      showToast('Wajib melampirkan Foto Bukti Fisik Bak Truk / Area Bongkar sebagai bukti muatan.', 'warning');
      return;
    }

    setIsSubmittingEscalation(true);
    try {
      const res = await deliveryApi.recordReceivingScan(discrepancyData.delivery.id, {
        received_epcs: discrepancyData.received,
        proof_photo_url: escalationPhotoUrl.trim(),
        document_url: escalationDocUrl.trim() || null,
        notes: escalationNotes.trim(),
      });

      setReconciliationResult(res.data.reconciliation);
      const targetDelId = discrepancyData.delivery.id;
      setDiscrepancyModalOpen(false);
      setDiscrepancyData(null);
      setDeliveries((prev) =>
        prev.map((d) =>
          d.id === targetDelId
            ? { ...d, status: 'pending_pm_approval', reconciliation_status: 'discrepancy' }
            : d
        )
      );
      loadAll(false);
      showToast('⚠️ Berita Acara Selisih berhasil dibuat dan diteruskan ke Project Manager untuk investigasi approval.', 'warning');
    } catch (err) {
      showToast('Gagal eskalasi selisih: ' + (err.response?.data?.message || err.message), 'error');
    } finally {
      setIsSubmittingEscalation(false);
    }
  };

  const handleCancelAndRescan = () => {
    setDiscrepancyModalOpen(false);
    setDiscrepancyData(null);
    showToast('Data belum tersimpan. Silakan periksa ulang isi muatan truk dan scan kembali tag yang belum terpindai.', 'info');
  };

  const handleApproveDelivery = async (delId) => {
    try {
      await deliveryApi.approveDelivery(delId);
      setDeliveries((prev) =>
        prev.map((d) => (d.id === delId ? { ...d, status: 'approved' } : d))
      );
      loadAll(false);
      showToast('Delivery berhasil di-approve oleh PM!', 'success');
    } catch (err) {
      showToast('Gagal approve delivery: ' + (err.response?.data?.message || err.message), 'error');
    }
  };

  const viewMeta = {
    spk: {
      title: 'Kontrak SPK & PO Vendor',
      subtitle: 'Pengelolaan kontrak pemesanan tiang & kabel ke Principal beserta termin pembayaran.',
    },
    dispatch_scan: {
      title: 'Muat Truk di Principal (Handheld 1: Dispatch)',
      subtitle: 'Tagging RFID tiang & kabel di yard pabrik dan penguncian manifest keberangkatan truk.',
    },
    receiving_scan: {
      title: 'Bongkar & Terima Truk (Handheld 2: Receiving)',
      subtitle: 'Pindai muatan truk saat tiba di gudang transit & pencocokan otomatis susut di perjalanan (in-transit shrinkage).',
    },
    deliveries: {
      title: 'Status Truk & Pengiriman',
      subtitle: 'Pemantauan armada truk yang sedang di jalan dan histori surat jalan penerimaan gudang transit.',
    },
  };

  return (
    <div className="space-y-6">
      {/* Dynamic Header Matching Active Sub-Menu */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">
            {viewMeta[activeView]?.title || 'Pengadaan & Logistik Material'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {viewMeta[activeView]?.subtitle || ''}
          </p>
        </div>
        {['dispatch_scan', 'receiving_scan'].includes(activeView) && (
          <form onSubmit={handleEpcLookup} className="w-full sm:w-auto flex gap-2">
            <input value={epcLookup.value} onChange={(e) => setEpcLookup({ value: e.target.value.toUpperCase(), loading: false, result: null })} placeholder="Cek peruntukan EPC" className="min-w-0 sm:w-64 p-2 border border-slate-300 rounded-xl font-mono text-xs" />
            <button className="px-3 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold">{epcLookup.loading ? '…' : 'Cek EPC'}</button>
          </form>
        )}
      </div>

      {epcLookup.result && ['dispatch_scan', 'receiving_scan'].includes(activeView) && (
        <div className={`p-3 rounded-xl border text-xs ${epcLookup.result.error ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-blue-50 border-blue-200 text-blue-900'}`}>
          {epcLookup.result.error || <><strong>{epcLookup.result.epc}</strong> — {epcLookup.result.item?.code}: {epcLookup.result.item?.name} · status <strong>{epcLookup.result.status}</strong>{epcLookup.result.project ? ` · proyek ${epcLookup.result.project.name}` : ''}</>}
        </div>
      )}

      {/* VIEW 1: SPK Contracts (Enterprise High-Density Data Table) */}
      {activeView === 'spk' && (
        <div className="space-y-3.5">
          {/* Action & Filter Bar */}
          <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-center gap-3">
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              {/* Search */}
              <div className="relative flex-1 sm:w-72">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Cari No. SPK, Vendor, atau Judul..."
                  value={spkSearch}
                  onChange={(e) => setSpkSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium placeholder:text-slate-400"
                />
              </div>

              {/* Status Filter */}
              <select
                value={spkStatusFilter}
                onChange={(e) => setSpkStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="ALL">Semua Status Bayar</option>
                <option value="paid">Lunas (PAID)</option>
                <option value="partial">Parsial (PARTIAL)</option>
                <option value="unpaid">Belum Bayar (UNPAID)</option>
              </select>

              {/* Principal Filter */}
              <select
                value={spkPrincipalFilter}
                onChange={(e) => setSpkPrincipalFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="ALL">Semua Principal</option>
                {principals.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>

              {/* Approval Status Filter */}
              <select
                value={spkApprovalFilter}
                onChange={(e) => setSpkApprovalFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="ALL">Semua Status Approval</option>
                <option value="my_turn">⚡ Perlu Tindakan Saya</option>
                <option value="approved">Disetujui (Approved)</option>
                <option value="pending">Menunggu Review (Pending)</option>
                <option value="rejected">Ditolak / Perlu Revisi</option>
              </select>
            </div>

            {/* Create Button */}
            {(!currentUser || ['superadmin', 'procurement'].includes(currentUser.role)) && (
              <button
                onClick={() => {
                  const defaultPrin = principals[0];
                  const matchingProjects = defaultPrin ? projects.filter(p => p.principal_id === defaultPrin.id) : [];
                  const defaultItem = availableItems[0];
                  setCreateSpkForm({
                    principal_id: defaultPrin?.id || '',
                    project_id: matchingProjects[0]?.id || '',
                    spk_number: `SPK/${defaultPrin?.code || 'PRIN'}-OPS/${new Date().getFullYear()}/${Math.floor(100 + Math.random() * 900)}`,
                    title: `Pengadaan Tiang & Material Rollout FO`,
                    total_amount: 0,
                    payment_status: 'unpaid',
                    document_url: '',
                    notes: 'Kontrak pengadaan baru terintegrasi sistem MOSA WMS',
                    items: [
                      { item_id: defaultItem?.id || '', target_qty: 1, price_per_unit: 0 },
                    ],
                  });
                  setShowCreateSpkModal(true);
                }}
                className="w-full md:w-auto flex items-center justify-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow transition active:scale-95 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Buat SPK Baru</span>
              </button>
            )}
          </div>

          {/* High-Density Data Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-3.5">No. SPK & Tanggal</th>
                    <th className="py-3 px-3.5">Principal Vendor</th>
                    <th className="py-3 px-3.5">Nama Pengadaan</th>
                    <th className="py-3 px-3.5">Material</th>
                    <th className="py-3 px-3.5 text-right">Nilai Kontrak</th>
                    <th className="py-3 px-3.5 text-center">Status Bayar</th>
                    <th className="py-3 px-3.5 text-center">Approval & Reviewer</th>
                    <th className="py-3 px-3.5 text-center">Dokumen</th>
                    <th className="py-3 px-3.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSpks.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-500">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <p className="font-bold text-slate-700">Tidak ada kontrak SPK yang cocok dengan filter pencarian.</p>
                          <p className="text-xs text-slate-500">Silakan sesuaikan filter atau tambahkan SPK baru.</p>
                          {(spkSearch || spkStatusFilter !== 'ALL' || spkPrincipalFilter !== 'ALL' || spkApprovalFilter !== 'ALL') && (
                            <button
                              type="button"
                              onClick={() => {
                                setSpkSearch('');
                                setSpkStatusFilter('ALL');
                                setSpkPrincipalFilter('ALL');
                                setSpkApprovalFilter('ALL');
                              }}
                              className="mt-1 px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Reset Filter</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredSpks.map((spk) => {
                      const appReq = spk.approval_request;
                      const isSpkApproved = !appReq || appReq.status === 'approved';
                      const isPendingReview = appReq && (appReq.status === 'pending' || appReq.status === 'revision_requested');
                      const approverName = appReq?.current_approver_user?.name;
                      const finalApproverName = appReq?.final_approved_by_user?.name;

                      return (
                        <tr key={spk.id} className="hover:bg-slate-50/80 transition group">
                          <td className="py-2.5 px-3.5 font-mono">
                            <div className="font-bold text-slate-900 group-hover:text-emerald-700 transition">
                              {spk.spk_number}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {new Date(spk.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </div>
                          </td>
                          <td className="py-2.5 px-3.5">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 font-bold text-[11px]">
                              {spk.principal?.name || 'Principal'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3.5">
                            <div className="font-semibold text-slate-800 line-clamp-1 max-w-xs">{spk.title}</div>
                            {spk.project && (
                              <div className="text-[10px] text-slate-400 truncate">Proyek: {spk.project.name}</div>
                            )}
                            <div className="text-[10px] text-slate-500 mt-0.5 font-medium flex items-center gap-1">
                              <span>Dibuat:</span>
                              <strong className="text-slate-700">{spk.created_by?.name || spk.approval_request?.requester_user?.name || spk.procurement_user?.name || 'Siti Aminah (Procurement)'}</strong>
                            </div>
                          </td>
                          <td className="py-2.5 px-3.5">
                            {(() => {
                              const ful = getSpkFulfillment(spk);
                              return (
                                <div>
                                  <div className="flex items-center justify-between gap-1.5 font-semibold text-slate-700">
                                    <span>{spk.items?.length || 0} Jenis</span>
                                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                                      ful.isCompleted ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                                    }`}>
                                      {ful.effectiveProgress}/{ful.totalTarget} Pcs
                                    </span>
                                  </div>
                                  <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1 overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all duration-300 ${
                                        ful.isCompleted ? 'bg-emerald-500' : 'bg-indigo-500'
                                      }`}
                                      style={{ width: `${ful.percent}%` }}
                                    />
                                  </div>
                                  <span className="block text-[9px] text-slate-400 mt-0.5 font-medium">
                                    {ful.isCompleted ? '✓ Kuota Terpenuhi (100%)' : `Terkirim: ${ful.percent}%`}
                                  </span>
                                </div>
                              );
                            })()}
                          </td>
                          <td className="py-2.5 px-3.5 text-right font-mono font-bold text-slate-900">
                            Rp {Number(spk.total_amount).toLocaleString('id-ID')}
                          </td>
                          <td className="py-2.5 px-3.5 text-center">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              spk.payment_status === 'paid'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : spk.payment_status === 'partial'
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : 'bg-rose-100 text-rose-800 border border-rose-200'
                            }`}>
                              {spk.payment_status.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-2.5 px-3.5 text-center min-w-[140px]">
                            {isSpkApproved ? (
                              <div>
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  <span>APPROVED</span>
                                </span>
                                {finalApproverName && (
                                  <div className="text-[9px] text-slate-500 mt-0.5">
                                    oleh: <strong className="text-slate-700">{finalApproverName}</strong>
                                  </div>
                                )}
                              </div>
                            ) : isPendingReview ? (
                              <div>
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                  <Clock className="w-3 h-3 text-amber-600 animate-pulse" />
                                  <span>STEP {appReq.current_step_order}/{appReq.total_steps}</span>
                                </span>
                                <div className="text-[9px] text-amber-700 mt-0.5 font-medium">
                                  Menunggu: <strong className="text-slate-800">{approverName || 'Reviewer'}</strong>
                                </div>
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                <X className="w-3 h-3 text-rose-600" />
                                <span>{appReq?.status?.toUpperCase() || 'DRAFT'}</span>
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3.5 text-center">
                            {spk.document_url ? (
                              <button
                                onClick={() => setPreviewMedia({ url: spk.document_url, type: 'document', title: `Kontrak SPK ${spk.spk_number}` })}
                                className="p-1 text-blue-600 hover:bg-blue-50 rounded-lg transition inline-flex items-center gap-1 font-bold text-[11px]"
                                title="Lihat PDF Kontrak"
                              >
                                <FileText className="w-4 h-4" />
                                <span className="hidden lg:inline">PDF</span>
                              </button>
                            ) : (
                              <span className="text-slate-500 text-[11px]">Tidak ada lampiran</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {canApproveSpk(spk) && (
                                <button
                                  onClick={() => handleOpenSpkApproval(spk, 'approved')}
                                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-xs cursor-pointer animate-pulse"
                                  title="Review & Setujui Kontrak SPK Ini"
                                >
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                  <span>Setujui</span>
                                </button>
                              )}
                              <button
                                onClick={() => setSelectedSpkDetail(spk)}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Detail</span>
                              </button>
                              {(!currentUser || ['superadmin', 'procurement'].includes(currentUser.role)) && (() => {
                                const ful = getSpkFulfillment(spk);
                                if (!isSpkApproved) {
                                  return (
                                    <button
                                      disabled
                                      className="px-2 py-1 bg-slate-100 text-slate-400 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-not-allowed border border-slate-200"
                                      title={`Kontrak SPK belum disetujui di Pusat Approval (${approverName ? 'Menunggu review ' + approverName : 'Review Pending'}). Truk belum dapat dimuat.`}
                                    >
                                      <Lock className="w-3.5 h-3.5 text-slate-400" />
                                      <span className="hidden sm:inline text-[11px]">Terkunci</span>
                                    </button>
                                  );
                                }
                                if (ful.isCompleted) {
                                  return (
                                    <span
                                      className="px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold inline-flex items-center gap-1"
                                      title="Seluruh kuota material SPK ini telah 100% dimuat/terkirim."
                                    >
                                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                      <span className="hidden sm:inline text-[11px]">Selesai</span>
                                    </span>
                                  );
                                }
                                if (canDispatchSpk(spk)) {
                                  return (
                                    <button
                                      onClick={() => {
                                        initializeDispatchForSpk(spk);
                                        handleSwitchView('dispatch_scan');
                                      }}
                                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-xs cursor-pointer"
                                      title="Mulai Muat Truk (Handheld 1: Khusus Pembuat SPK)"
                                    >
                                      <Truck className="w-3.5 h-3.5" />
                                      <span className="hidden sm:inline">Muat</span>
                                    </button>
                                  );
                                }
                                return (
                                  <button
                                    disabled
                                    className="px-2 py-1 bg-slate-100 text-slate-400 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-not-allowed border border-slate-200"
                                    title={`Hanya pembuat SPK (${spk.created_by?.name || spk.createdBy?.name || 'Originator'}) yang berwenang melakukan muat truk.`}
                                  >
                                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                                    <span className="hidden sm:inline text-[10px]">Bukan Pembuat</span>
                                  </button>
                                );
                              })()}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Footer Stats */}
            <div className="p-3 bg-slate-50/60 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center text-xs text-slate-500 gap-2">
              <span>Menampilkan <strong>{filteredSpks.length}</strong> dari total <strong>{spks.length}</strong> kontrak SPK</span>
              <span className="font-mono font-semibold">
                Total Akumulasi: <strong className="text-slate-800">Rp {filteredSpks.reduce((s, it) => s + Number(it.total_amount || 0), 0).toLocaleString('id-ID')}</strong>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Slide-over / Modal Detail SPK */}
      {selectedSpkDetail && (
        <Portal>
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[100] animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-5xl w-full space-y-5 shadow-2xl relative my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                  {selectedSpkDetail.principal?.name || 'Principal'}
                </span>
                <h3 className="font-black text-lg text-slate-900 mt-1">{selectedSpkDetail.spk_number}</h3>
                <p className="text-xs text-slate-600">{selectedSpkDetail.title}</p>
                {selectedSpkDetail.project && (
                  <p className="text-[11px] text-slate-400 mt-0.5">Proyek: {selectedSpkDetail.project.name}</p>
                )}
              </div>
              <button
                onClick={() => setSelectedSpkDetail(null)}
                className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Creator / Originator Info */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-xs space-y-1.5">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Informasi Pembuat Dokumen (Originator / Creator)</div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center">
                    <UserCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-sm">
                      {selectedSpkDetail.created_by?.name || selectedSpkDetail.approval_request?.requester_user?.name || selectedSpkDetail.procurement_user?.name || 'Siti Aminah'}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Role: <span className="font-semibold text-slate-700 capitalize">{selectedSpkDetail.created_by?.role || selectedSpkDetail.approval_request?.requester_user?.role || 'Procurement'}</span> • {selectedSpkDetail.created_by?.email || 'procurement@mosa.id'}
                    </div>
                  </div>
                </div>
                <div className="text-right text-[11px] text-slate-500">
                  <div>Dibuat pada:</div>
                  <div className="font-semibold text-slate-800">
                    {new Date(selectedSpkDetail.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                  </div>
                </div>
              </div>
              {selectedSpkDetail.notes && (
                <div className="pt-2 border-t border-slate-200 text-slate-600">
                  <span className="font-semibold text-slate-700">Catatan SPK: </span>
                  {selectedSpkDetail.notes}
                </div>
              )}
            </div>

            {/* Payment terms */}
            <div>
              <h4 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                Skema Termin Pembayaran ke Principal
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {selectedSpkDetail.payment_terms_json?.map((term, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                    <div className="flex justify-between items-center font-semibold">
                      <span>Termin {term.term} ({term.percentage}%)</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        term.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                      }`}>
                        {term.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="font-mono font-bold text-slate-800 mt-1 text-sm">
                      Rp {Number(term.amount).toLocaleString('id-ID')}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Items Quota Table */}
            <div>
              <h4 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                <PackagePlus className="w-4 h-4 text-emerald-600" />
                Rincian Barang & Pemenuhan Target:
              </h4>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-[11px]">
                    <tr>
                      <th className="p-2.5">Material</th>
                      <th className="p-2.5 text-right">Target SPK</th>
                      <th className="p-2.5 text-right">Diterima Gudang</th>
                      <th className="p-2.5 text-right">Sisa Target</th>
                      <th className="p-2.5 text-right">Harga Satuan</th>
                      <th className="p-2.5 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedSpkDetail.items?.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="p-2.5 font-semibold text-slate-800">{item.item?.name}</td>
                        <td className="p-2.5 text-right font-mono font-semibold">{item.target_qty} {item.item?.unit}</td>
                        <td className="p-2.5 text-right font-mono font-semibold text-emerald-600">{item.received_qty} {item.item?.unit}</td>
                        <td className="p-2.5 text-right font-mono font-semibold text-slate-600">{item.target_qty - item.received_qty} {item.item?.unit}</td>
                        <td className="p-2.5 text-right font-mono text-slate-600">Rp {Number(item.price_per_unit || 0).toLocaleString('id-ID')}</td>
                        <td className="p-2.5 text-right font-mono font-bold text-slate-800">
                          Rp {(Number(item.target_qty || 0) * Number(item.price_per_unit || 0)).toLocaleString('id-ID')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Approval Status Banner in Modal */}
            {selectedSpkDetail.approval_request && (
              <div className={`p-4 rounded-2xl border text-xs space-y-3 ${
                selectedSpkDetail.approval_request.status === 'approved'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : selectedSpkDetail.approval_request.status === 'pending'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <Shield className={`w-5 h-5 ${selectedSpkDetail.approval_request.status === 'approved' ? 'text-emerald-700' : 'text-amber-700'}`} />
                    <div>
                      <span className="font-bold block">
                        {selectedSpkDetail.approval_request.status === 'approved'
                          ? 'Status Approval: Disetujui (Approved)'
                          : selectedSpkDetail.approval_request.status === 'pending'
                          ? `Status Approval: Menunggu Review (Step ${selectedSpkDetail.approval_request.current_step_order}/${selectedSpkDetail.approval_request.total_steps})`
                          : `Status Approval: ${selectedSpkDetail.approval_request.status.toUpperCase()}`}
                      </span>
                      <span className="text-[11px] opacity-80">
                        {selectedSpkDetail.approval_request.status === 'approved'
                          ? `Disetujui final oleh ${selectedSpkDetail.approval_request.final_approved_by_user?.name || 'Direksi / PM'}`
                          : `Menunggu tindakan reviewer: ${selectedSpkDetail.approval_request.current_approver_user?.name || 'Approver'}`}
                      </span>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-[10px] px-2 py-0.5 rounded-full bg-white/80 border border-slate-200 self-start sm:self-auto">
                    {selectedSpkDetail.approval_request.request_number}
                  </span>
                </div>

                {/* Direct Approval Action inside Drawer */}
                {canApproveSpk(selectedSpkDetail) && (
                  <div className="pt-2 border-t border-amber-200/80 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-amber-800 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                      Giliran Anda meninjau dokumen kontrak ini:
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenSpkApproval(selectedSpkDetail, 'approved')}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1 shadow-xs cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Setujui (Approve)</span>
                      </button>
                      <button
                        onClick={() => handleOpenSpkApproval(selectedSpkDetail, 'revision_requested')}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs flex items-center gap-1 shadow-xs cursor-pointer"
                      >
                        <span>Minta Revisi</span>
                      </button>
                      <button
                        onClick={() => handleOpenSpkApproval(selectedSpkDetail, 'rejected')}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs flex items-center gap-1 shadow-xs cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Tolak</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Timeline & Log Aktivitas / Audit Trail */}
            <div className="space-y-2.5 pt-2 border-t border-slate-100">
              <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <History className="w-4 h-4 text-emerald-600" />
                Log Aktivitas, Riwayat Approval & Pengiriman (Timeline Audit):
              </h4>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {/* Event 1: Inisiasi SPK */}
                  <div className="relative">
                    <span className="absolute -left-6 top-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-white" />
                    <div className="text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-900">Kontrak SPK Dibuat (Draft Initial)</span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {new Date(selectedSpkDetail.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        Dibuat oleh <strong className="text-slate-800">{selectedSpkDetail.created_by?.name || selectedSpkDetail.approval_request?.requester_user?.name || 'Originator / Procurement'}</strong> dengan total nilai <strong>Rp {Number(selectedSpkDetail.total_amount).toLocaleString('id-ID')}</strong> ({selectedSpkDetail.items?.length || 0} jenis material).
                      </p>
                    </div>
                  </div>

                  {/* Event 2: Pengajuan Approval */}
                  {selectedSpkDetail.approval_request && (
                    <div className="relative">
                      <span className="absolute -left-6 top-0.5 w-3 h-3 rounded-full bg-blue-500 ring-4 ring-white" />
                      <div className="text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-900">Pengajuan Approval Multi-Tier ({selectedSpkDetail.approval_request.request_number})</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {new Date(selectedSpkDetail.approval_request.submitted_at || selectedSpkDetail.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          Diajukan oleh <strong className="text-slate-800">{selectedSpkDetail.approval_request.requester_user?.name || 'Requester'}</strong> untuk review {selectedSpkDetail.approval_request.total_steps} tahapan otorisasi.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Event 3: Approval Step Histories */}
                  {selectedSpkDetail.approval_request?.histories && selectedSpkDetail.approval_request.histories.length > 0 ? (
                    selectedSpkDetail.approval_request.histories.map((hist, hIdx) => {
                      const actionKey = hist.action || hist.status;
                      const isApproved = actionKey === 'approved';
                      const isRejected = actionKey === 'rejected';
                      const isRevision = actionKey === 'revision_requested';
                      return (
                        <div key={hIdx} className="relative">
                          <span className={`absolute -left-6 top-0.5 w-3 h-3 rounded-full ring-4 ring-white ${
                            isApproved ? 'bg-emerald-500' : isRejected ? 'bg-rose-500' : 'bg-amber-500'
                          }`} />
                          <div className="text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-slate-900">
                                Step {hist.step_order}: {isApproved ? 'Disetujui (Approved)' : isRejected ? 'Ditolak (Rejected)' : isRevision ? 'Dimintakan Revisi' : 'Review Dilakukan'}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {new Date(hist.action_at || hist.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600 mt-0.5">
                              Tindakan oleh <strong className="text-slate-800">{hist.action_by_user?.name || 'Reviewer'}</strong> ({hist.action_by_user?.role || 'Approver'})
                              {(hist.comments || hist.notes) && <span className="block text-slate-500 italic mt-0.5">Catatan: "{hist.comments || hist.notes}"</span>}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  ) : selectedSpkDetail.approval_request && (
                    <div className="relative">
                      <span className="absolute -left-6 top-0.5 w-3 h-3 rounded-full bg-amber-400 ring-4 ring-white" />
                      <div className="text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-amber-800">Menunggu Review: Step {selectedSpkDetail.approval_request.current_step_order}/{selectedSpkDetail.approval_request.total_steps}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Antrean review aktif pada: <strong className="text-slate-700">{selectedSpkDetail.approval_request.current_approver_user?.name || 'Approver'}</strong>
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Event 4: Pengiriman Truk & Log Handheld */}
                  {selectedSpkDetail.deliveries && selectedSpkDetail.deliveries.length > 0 ? (
                    selectedSpkDetail.deliveries.map((del, dIdx) => (
                      <div key={dIdx} className="relative">
                        <span className={`absolute -left-6 top-0.5 w-3 h-3 rounded-full ring-4 ring-white ${
                          del.status === 'approved' || del.reconciliation_status === 'matched' ? 'bg-emerald-600' : 'bg-indigo-500'
                        }`} />
                        <div className="text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-slate-900">
                              Pengiriman Truk: {del.delivery_number}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {new Date(del.dispatched_at || del.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 mt-0.5">
                            Dimuat oleh <strong className="text-slate-800">{del.dispatched_by?.name || del.dispatchedBy?.name || 'PIC Dispatch'}</strong>
                            {(del.received_at || del.verified_at) ? (
                              <span> • Diterima di <strong className="text-slate-800">{del.warehouse?.name || 'Gudang Transit'}</strong> oleh <strong>{del.received_by?.name || del.receivedBy?.name || 'Storeroom'}</strong> ({new Date(del.received_at || del.verified_at).toLocaleDateString('id-ID')})</span>
                            ) : (
                              <span className="text-blue-600 font-medium"> • Status: Dalam Perjalanan (In-Transit)</span>
                            )}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-[11px] text-slate-400 italic">
                      Belum ada armada truk yang dimuat untuk SPK ini.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-between items-center pt-2 border-t border-slate-100">
              {selectedSpkDetail.document_url ? (
                <button
                  onClick={() => setPreviewMedia({ url: selectedSpkDetail.document_url, type: 'document', title: `Dokumen Kontrak ${selectedSpkDetail.spk_number}` })}
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition"
                >
                  <FileText className="w-4 h-4" />
                  Lihat File Kontrak PDF
                </button>
              ) : <div />}

              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedSpkDetail(null)}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold"
                >
                  Tutup
                </button>
                {(!currentUser || ['superadmin', 'procurement'].includes(currentUser.role)) && (() => {
                  const ful = getSpkFulfillment(selectedSpkDetail);
                  if (selectedSpkDetail.approval_request && selectedSpkDetail.approval_request.status !== 'approved') {
                    return (
                      <button
                        disabled
                        className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 text-slate-400 border border-slate-200 rounded-xl text-xs font-bold cursor-not-allowed"
                        title="Kontrak SPK belum disetujui di Pusat Approval."
                      >
                        <Lock className="w-4 h-4" />
                        Muat Truk Terkunci (Menunggu Approval)
                      </button>
                    );
                  }
                  if (ful.isCompleted) {
                    return (
                      <div className="flex items-center gap-1.5 px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold">
                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                        <span>Selesai (100% Kuota Terkirim)</span>
                      </div>
                    );
                  }
                  if (canDispatchSpk(selectedSpkDetail)) {
                    return (
                      <button
                        onClick={() => {
                          const spk = selectedSpkDetail;
                          setSelectedSpkDetail(null);
                          initializeDispatchForSpk(spk);
                          handleSwitchView('dispatch_scan');
                        }}
                        className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow cursor-pointer"
                        title="Lanjut ke Handheld 1 Muat Truk"
                      >
                        <Truck className="w-4 h-4" />
                        Lanjut ke Muat Truk (H1)
                      </button>
                    );
                  }
                  return (
                    <button
                      disabled
                      className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 text-slate-400 border border-slate-200 rounded-xl text-xs font-bold cursor-not-allowed"
                      title={`Hanya pembuat SPK (${selectedSpkDetail.created_by?.name || selectedSpkDetail.createdBy?.name || 'Originator'}) yang berwenang memuat truk.`}
                    >
                      <Lock className="w-4 h-4" />
                      Muat Terkunci (Bukan Pembuat SPK)
                    </button>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {/* VIEW 2: Handheld 1 (Principal Dispatch Scan - Responsive 2-Column) */}
      {activeView === 'dispatch_scan' && (() => {
        const isSpkCompleted = selectedSpk ? getSpkFulfillment(selectedSpk).isCompleted : false;
        return (
          <form onSubmit={handleDispatchSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column: Manifest & Delivery Info (7 Cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                    <Radio className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-800">1. Data Pengiriman & Manifest Truk</h2>
                    <p className="text-[11px] text-slate-500">Pilih SPK Kontrak dan Gudang Transit Penerima.</p>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-bold px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                  HANDHELD 1 • DISPATCH
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Pilih SPK Kontrak *</label>
                  <select
                    value={dispatchForm.spk_id}
                    onChange={(e) => {
                      const spkId = e.target.value;
                      const spk = spks.find((s) => s.id === parseInt(spkId, 10));
                      if (spk) {
                        initializeDispatchForSpk(spk);
                      }
                    }}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold cursor-pointer"
                  >
                    {spks.map((s) => {
                      const isApproved = !s.approval_request || s.approval_request.status === 'approved';
                      const isOriginator = canDispatchSpk(s);
                      const ful = getSpkFulfillment(s);
                      const creatorName = s.created_by?.name || s.createdBy?.name || s.approval_request?.requester_user?.name || 'Originator';
                      return (
                        <option key={s.id} value={s.id} disabled={!isApproved || !isOriginator || ful.isCompleted}>
                          {s.spk_number}: {s.principal?.name} {ful.isCompleted ? `(✓ 100% Kuota Selesai Terkirim)` : !isApproved ? `(⏳ Menunggu Review)` : !isOriginator ? `(🔒 Khusus Pembuat: ${creatorName})` : `(✓ Approved • PIC: ${creatorName})`}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Gudang Transit Tujuan *</label>
                  <select
                    value={dispatchForm.warehouse_id}
                    onChange={(e) => setDispatchForm({ ...dispatchForm, warehouse_id: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold cursor-pointer"
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.name} ({w.gate_mode})</option>
                    ))}
                  </select>
                </div>

                <div className="col-span-full">
                  <label className="font-bold text-slate-700 block mb-1">Reader Handheld Presentasi</label>
                  <select value={selectedReaderId} onChange={(e) => setSelectedReaderId(e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold">
                    <option value="">Pilih reader meja/hybrid</option>
                    {readerDevices.map((device) => <option key={device.id} value={device.id}>{device.device_name} ({device.device_code})</option>)}
                  </select>
                  <p className={`mt-1 text-[11px] ${wsConnected ? 'text-emerald-700' : readerError ? 'text-rose-600' : 'text-slate-500'}`}>{wsConnected ? 'Reader terhubung dalam mode ENROLLMENT.' : readerError || 'Input manual tetap tersedia bila reader tidak dipilih.'}</p>
                </div>

                {/* Warning if selected SPK is already fulfilled */}
                {selectedSpk && getSpkFulfillment(selectedSpk).isCompleted && (
                  <div className="col-span-full p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center gap-2.5">
                    <CheckCircle className="w-5 h-5 text-emerald-700 shrink-0" />
                    <div>
                      <strong className="block font-bold">Seluruh Kuota Material SPK Ini Telah Selesai Dimuat/Dikirim</strong>
                      <span className="text-[11px]">Akumulasi muat ({getSpkFulfillment(selectedSpk).effectiveProgress} dari {getSpkFulfillment(selectedSpk).totalTarget} unit) telah mencapai 100%. Tidak dapat menambah pengiriman baru untuk kontrak ini.</span>
                    </div>
                  </div>
                )}

                {/* Warning if selected SPK is not approved */}
                {selectedSpk && selectedSpk.approval_request && selectedSpk.approval_request.status !== 'approved' && (
                  <div className="col-span-full p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center gap-2.5">
                    <Lock className="w-5 h-5 text-amber-700 shrink-0" />
                    <div>
                      <strong className="block font-bold">Kontrak SPK Ini Belum Disetujui di Pusat Approval</strong>
                      <span className="text-[11px]">Status saat ini: Step {selectedSpk.approval_request.current_step_order}/{selectedSpk.approval_request.total_steps} (Menunggu review: {selectedSpk.approval_request.current_approver_user?.name || 'Approver'}). Truk tidak dapat dimuat sampai proses approval selesai disetujui.</span>
                    </div>
                  </div>
                )}

                <div className="col-span-full">
                  <label className="font-bold text-slate-700 block mb-1">Nomor Surat Jalan (SJ) Fisik *</label>
                  <input
                    type="text"
                    required
                    value={dispatchForm.delivery_number}
                    onChange={(e) => setDispatchForm({ ...dispatchForm, delivery_number: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-mono font-bold text-xs"
                    placeholder="Contoh: SJ-MYREP-001"
                  />
                </div>
              </div>

              {/* Multi-Item Material Allocation Table */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <label className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-emerald-600" />
                    Rincian Material yang Dimuat di Truk Ini *
                  </label>
                  <span className="text-[11px] text-indigo-600 font-semibold bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                    Bisa muat 1 atau lebih barang sekaligus
                  </span>
                </div>

                <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 bg-white shadow-2xs">
                  {selectedSpk?.items?.map((it) => {
                    const alloc = dispatchItemAllocations[it.item_id] || {
                      selected: false,
                      qty: 0,
                      remaining_quota: 0,
                      item_name: it.item?.name,
                    };
                    const alreadyDispatched = (selectedSpk?.deliveries || [])
                      .flatMap((d) => d.items || [])
                      .filter((di) => di.item_id === it.item_id)
                      .reduce((sum, di) => sum + Number(di.delivered_qty || 0), 0);
                    const remainingQuota = Math.max(0, Number(it.target_qty || 0) - alreadyDispatched);
                    const isSelected = !!alloc.selected;

                    return (
                      <div
                        key={it.item_id}
                        className={`p-3.5 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          isSelected ? 'bg-emerald-50/20' : 'bg-slate-50/40 opacity-70'
                        }`}
                      >
                        {/* Checkbox & Details */}
                        <div className="flex items-start gap-2.5 flex-1">
                          <input
                            type="checkbox"
                            id={`item-check-${it.item_id}`}
                            checked={isSelected}
                            disabled={remainingQuota <= 0}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setDispatchItemAllocations((prev) => ({
                                ...prev,
                                [it.item_id]: {
                                  ...prev[it.item_id],
                                  selected: checked,
                                  qty: checked ? (prev[it.item_id]?.qty || remainingQuota || 1) : 0,
                                },
                              }));
                              if (checked && (!activeScanItemId || !dispatchItemAllocations[activeScanItemId]?.selected)) {
                                setActiveScanItemId(it.item_id);
                              }
                            }}
                            className="mt-0.5 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                          />
                          <label htmlFor={`item-check-${it.item_id}`} className="cursor-pointer select-none">
                            <div className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                              <span>{it.item?.name}</span>
                              {it.item?.item_code && (
                                <span className="font-mono text-[10px] text-slate-400">({it.item?.item_code})</span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              Target SPK: <strong>{it.target_qty}</strong> unit • Telah Dimuat: <strong>{alreadyDispatched}</strong> • Sisa Kuota:{' '}
                              <strong className={remainingQuota > 0 ? 'text-emerald-700' : 'text-slate-400'}>
                                {remainingQuota} unit
                              </strong>
                            </div>
                          </label>
                        </div>

                        {/* Qty Input */}
                        <div className="flex items-center gap-2 self-end sm:self-center">
                          <span className="text-[11px] font-semibold text-slate-500">Muat:</span>
                          <div className="relative w-24">
                            <input
                              type="number"
                              min="1"
                              max={remainingQuota}
                              disabled={!isSelected || remainingQuota <= 0}
                              value={alloc.qty || ''}
                              onChange={(e) => {
                                const val = Math.max(0, Math.min(remainingQuota, parseInt(e.target.value, 10) || 0));
                                setDispatchItemAllocations((prev) => ({
                                  ...prev,
                                  [it.item_id]: {
                                    ...prev[it.item_id],
                                    qty: val,
                                  },
                                }));
                              }}
                              className={`w-full p-2 text-xs font-bold font-mono text-right rounded-xl border ${
                                isSelected
                                  ? 'border-emerald-300 bg-white text-emerald-900 focus:ring-2 focus:ring-emerald-500'
                                  : 'border-slate-200 bg-slate-100 text-slate-400'
                              }`}
                            />
                          </div>
                          <span className="text-[11px] text-slate-600 font-medium">unit</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Summary calculation */}
                <div className="p-3 bg-slate-100 rounded-xl flex items-center justify-between text-xs font-semibold">
                  <span className="text-slate-600">
                    Total Material Dimuat:{' '}
                    <strong className="text-slate-800">
                      {Object.values(dispatchItemAllocations).filter((a) => a.selected && Number(a.qty) > 0).length} Jenis Barang
                    </strong>
                  </span>
                  <span className="font-mono font-bold text-emerald-800 text-sm">
                    {Object.values(dispatchItemAllocations)
                      .filter((a) => a.selected)
                      .reduce((sum, a) => sum + Number(a.qty || 0), 0)}{' '}
                    Unit
                  </span>
                </div>
              </div>

              {/* Upload Foto & Dokumen Keberangkatan */}
              <div className="border border-slate-200 bg-slate-50/80 rounded-2xl p-3.5 space-y-3">
                <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-emerald-600" />
                  Lampiran Bukti Fisik Keberangkatan (Anti-Fraud)
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="bg-white p-3 rounded-xl border border-slate-200">
                    <label className="font-semibold text-slate-700 block mb-1.5">
                      Foto Muatan Truk / Tiang:
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      disabled={isSpkCompleted}
                      onChange={(e) => handleFileUpload(e.target.files[0], 'delivery_proofs', (url) => setDispatchForm((prev) => ({ ...prev, proof_photo_url: url })))}
                      className="text-xs file:mr-2 file:py-1.5 file:px-2.5 file:rounded-lg file:border-0 file:bg-emerald-600 file:text-white file:font-bold file:text-[11px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    {dispatchForm.proof_photo_url && (
                      <button type="button" onClick={() => setPreviewMedia({ url: dispatchForm.proof_photo_url, type: 'image', title: 'Bukti Fisik Keberangkatan' })} className="mt-2 text-[11px] text-emerald-700 font-bold flex items-center gap-1 hover:underline">
                        <ExternalLink className="w-3.5 h-3.5" /> Lihat gambar
                      </button>
                    )}
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-200">
                    <label className="font-semibold text-slate-700 block mb-1.5">
                      Foto/PDF Surat Jalan Asli:
                    </label>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      disabled={isSpkCompleted}
                      onChange={(e) => handleFileUpload(e.target.files[0], 'delivery_proofs', (url) => setDispatchForm((prev) => ({ ...prev, document_url: url })))}
                      className="text-xs file:mr-2 file:py-1.5 file:px-2.5 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white file:font-bold file:text-[11px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    {dispatchForm.document_url && (
                      <button type="button" onClick={() => setPreviewMedia({ url: dispatchForm.document_url, type: 'document', title: 'Surat Jalan Keberangkatan' })} className="mt-2 text-[11px] text-blue-700 font-bold flex items-center gap-1 hover:underline">
                        <ExternalLink className="w-3.5 h-3.5" /> Lihat attachment
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: RFID Scanner Console (5 Cols) */}
          <div className="lg:col-span-5 space-y-4">
            {(() => {
              const selectedItems = Object.entries(dispatchItemAllocations).filter(
                ([id, a]) => a.selected && Number(a.qty) > 0
              );
              const selectedItemIds = selectedItems.map(([id]) => Number(id));
              const totalPlanQty = selectedItems.reduce((sum, [, a]) => sum + Number(a.qty || 0), 0);
              const totalEpcsScanned = selectedItems.reduce(
                (sum, [, a]) => sum + (a.epc_text || '').split('\n').map((s) => s.trim()).filter(Boolean).length,
                0
              );
              const activeItemId = (activeScanItemId && selectedItemIds.includes(Number(activeScanItemId)))
                ? Number(activeScanItemId)
                : (selectedItemIds[0] ?? null);
              const activeItemAlloc = activeItemId ? dispatchItemAllocations[activeItemId] : null;
              const activeItemEpcs = activeItemAlloc
                ? (activeItemAlloc.epc_text || '').split('\n').map((s) => s.trim()).filter(Boolean)
                : [];
              const isScanningDisabled = isSpkCompleted || !activeItemId;
              const isAllMatched =
                !isSpkCompleted &&
                selectedItems.length > 0 &&
                totalEpcsScanned === totalPlanQty &&
                selectedItems.every(
                  ([, a]) => (a.epc_text || '').split('\n').map((s) => s.trim()).filter(Boolean).length === Number(a.qty)
                );

              return (
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold ${
                        isSpkCompleted ? 'bg-slate-200 text-slate-500' : 'bg-slate-900 text-emerald-400'
                      }`}>
                        {isSpkCompleted ? <Lock className="w-4 h-4 text-slate-500" /> : <Scan className="w-4 h-4" />}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-800">2. Scanner EPC Handheld</h3>
                        <p className="text-[11px] text-slate-500">
                          {isSpkCompleted
                            ? 'Scanning dinonaktifkan karena kuota SPK sudah 100%.'
                            : 'Tembakkan gun RFID ke tumpukan material.'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isSpkCompleted ? (
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border flex items-center gap-1 bg-rose-50 text-rose-700 border-rose-200">
                          <Lock className="w-3 h-3 text-rose-600" />
                          <span>Terkunci (100%)</span>
                        </span>
                      ) : (
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border flex items-center gap-1 ${
                            wsConnected
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          <Radio className={`w-3 h-3 ${wsConnected ? 'animate-pulse text-emerald-600' : 'text-slate-400'}`} />
                          {wsConnected ? '🟢 Live' : '⚪ Manual'}
                        </span>
                      )}
                      <span className={`text-xs px-2.5 py-1 rounded-full font-bold font-mono ${
                        isSpkCompleted
                          ? 'bg-slate-100 text-slate-500'
                          : totalEpcsScanned === totalPlanQty && totalPlanQty > 0
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-indigo-100 text-indigo-800'
                      }`}>
                        {isSpkCompleted ? '0/0 EPC' : `${totalEpcsScanned}/${totalPlanQty} EPC`}
                      </span>
                    </div>
                  </div>

                  {/* Warning banner when SPK quota is 100% completed */}
                  {isSpkCompleted && (
                    <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-rose-900 text-xs flex items-start gap-2.5 shadow-2xs">
                      <Lock className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <strong className="block font-bold text-rose-800">Scanning Handheld Dinonaktifkan</strong>
                        <span className="text-[11px] text-rose-700 leading-relaxed block mt-0.5">
                          Seluruh kuota material SPK ({selectedSpk ? getSpkFulfillment(selectedSpk).effectiveProgress : 0} dari {selectedSpk ? getSpkFulfillment(selectedSpk).totalTarget : 0} unit) telah 100% selesai dimuat & dikirim. Form pemindaian tag dikunci.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Multi-Item Scan Tabs (If > 1 Item Selected and NOT completed) */}
                  {!isSpkCompleted && selectedItems.length > 1 && (
                    <div className="space-y-2 bg-slate-50 border border-slate-200 p-3 rounded-2xl">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5 text-emerald-600" />
                          Pilih Target Barang untuk Di-scan ({selectedItems.length} Material):
                        </label>
                        <span className="text-[10px] text-slate-400 font-medium">
                          Pilih barang sebelum scan
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {selectedItems.map(([id, alloc]) => {
                          const count = (alloc.epc_text || '').split('\n').map((s) => s.trim()).filter(Boolean).length;
                          const target = Number(alloc.qty);
                          const isDone = count === target && target > 0;
                          const isActive = Number(activeItemId) === Number(id);

                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => setActiveScanItemId(Number(id))}
                              className={`p-2.5 rounded-xl text-xs transition flex items-center justify-between gap-2 cursor-pointer text-left border-2 ${
                                isActive
                                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-300 font-extrabold'
                                  : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300 hover:bg-slate-50 font-bold'
                              }`}
                            >
                              <div className="truncate flex-1">
                                <div className="truncate leading-tight">{alloc.item_name}</div>
                                <div className={`text-[10px] font-mono font-normal mt-0.5 ${isActive ? 'text-emerald-100' : 'text-slate-400'}`}>
                                  {alloc.item_code || `Item #${id}`}
                                </div>
                              </div>
                              <span
                                className={`text-[10px] font-mono px-2 py-0.5 rounded-lg shrink-0 font-bold ${
                                  isActive
                                    ? 'bg-white/20 text-white'
                                    : isDone
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : count > target
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {count}/{target} {isDone ? '✓' : ''}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Action Bar for Active Item */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-500 font-semibold">Target Aktif:</span>
                      <span className="font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 font-mono text-xs">
                        {isSpkCompleted ? 'Tidak Ada (SPK Selesai)' : (activeItemAlloc?.item_name || 'Belum Ada Material Terpilih')}
                      </span>
                      {!isSpkCompleted && (
                        <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded ${
                          activeItemEpcs.length === Number(activeItemAlloc?.qty || 0) && Number(activeItemAlloc?.qty || 0) > 0
                            ? 'bg-emerald-100 text-emerald-800'
                            : activeItemEpcs.length > Number(activeItemAlloc?.qty || 0)
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {activeItemEpcs.length}/{activeItemAlloc?.qty || 0} Tag
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {activeItemId && !isSpkCompleted && (
                        <button
                          type="button"
                          onClick={() => {
                            setDispatchItemAllocations((prev) => ({
                              ...prev,
                              [activeItemId]: {
                                ...prev[activeItemId],
                                epc_text: '',
                              },
                            }));
                          }}
                          className="px-2 py-1 text-slate-400 hover:text-rose-600 text-[11px] font-semibold transition cursor-pointer"
                        >
                          Bersihkan
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Monospace Textarea */}
                  <div className="relative">
                    <textarea
                      rows={7}
                      required={selectedItems.length > 0 && !isSpkCompleted}
                      disabled={isScanningDisabled}
                      value={isSpkCompleted ? '' : (activeItemAlloc?.epc_text || '')}
                      onChange={(e) => {
                        if (isSpkCompleted) return;
                        const val = e.target.value;
                        if (activeItemId) {
                          setDispatchItemAllocations((prev) => ({
                            ...prev,
                            [activeItemId]: {
                              ...prev[activeItemId],
                              epc_text: val,
                            },
                          }));
                        }
                      }}
                      placeholder={
                        isSpkCompleted
                          ? '⛔ Scanning dinonaktifkan: Seluruh kuota material SPK telah 100% selesai dimuat/terkirim.'
                          : activeItemAlloc
                          ? `Scan tag RFID tiang/kabel untuk ${activeItemAlloc.item_name}...\nE28011606000020410000001\nE28011606000020410000002\n...`
                          : 'Pilih minimal 1 jenis material di sebelah kiri...'
                      }
                      className={`w-full p-3 font-mono text-xs border rounded-xl leading-relaxed transition ${
                        isSpkCompleted
                          ? 'border-slate-700 bg-slate-800 text-slate-500 cursor-not-allowed select-none opacity-60'
                          : 'border-slate-300 bg-slate-900 text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500'
                      }`}
                    />
                  </div>

                  {/* Real-time Status Alert */}
                  {!isSpkCompleted && selectedItems.length > 0 && (
                    <div>
                      {isAllMatched ? (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs font-bold flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>
                            ✓ Muatan Lengkap! Seluruh {totalPlanQty} tag EPC siap dikirim untuk {selectedItems.length} jenis material.
                          </span>
                        </div>
                      ) : (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>
                            {totalEpcsScanned < totalPlanQty
                              ? `Masih kurang ${totalPlanQty - totalEpcsScanned} tag EPC untuk melengkapi rencana muat (${totalEpcsScanned}/${totalPlanQty} tag).`
                              : `Kelebihan ${totalEpcsScanned - totalPlanQty} tag EPC melebihi rencana muat (${totalPlanQty} unit).`}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Submit Button */}
                  {selectedSpk && selectedSpk.approval_request && selectedSpk.approval_request.status !== 'approved' ? (
                    <button
                      type="button"
                      disabled
                      className="w-full py-3 bg-slate-100 border border-slate-200 text-slate-400 rounded-xl font-bold shadow-xs text-xs flex items-center justify-center gap-2 cursor-not-allowed"
                    >
                      <Lock className="w-4 h-4 text-slate-400" />
                      <span>SPK Belum Disetujui di Approval Center (Terkunci)</span>
                    </button>
                  ) : selectedSpk && getSpkFulfillment(selectedSpk).isCompleted ? (
                    <button
                      type="button"
                      disabled
                      className="w-full py-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl font-bold shadow-xs text-xs flex items-center justify-center gap-2 cursor-not-allowed"
                    >
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                      <span>Kuota SPK Ini Telah Selesai (100% Terkirim)</span>
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={uploading || selectedItems.length === 0}
                      className={`w-full py-3 text-white rounded-xl font-bold shadow-md transition text-xs flex items-center justify-center gap-2 cursor-pointer active:scale-98 ${
                        isAllMatched
                          ? 'bg-emerald-600 hover:bg-emerald-700'
                          : 'bg-emerald-700 hover:bg-emerald-800'
                      }`}
                    >
                      <Radio className="w-4 h-4" />
                      <span>
                        {uploading
                          ? 'Sedang Mengunggah...'
                          : `Kunci Manifest Keberangkatan (${selectedItems.length} Material • ${totalEpcsScanned} Tag)`}
                      </span>
                    </button>
                  )}
                </div>
              );
            })()}
          </div>
        </form>
      );
    })()}

      {/* VIEW 3: Handheld 2 (Warehouse Receiving Reconciler - Responsive 2-Column) */}
      {activeView === 'receiving_scan' && (
        <form onSubmit={handleReceivingSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column: Shipment Selection & Proofs (7 Cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                    <Scan className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-800">1. Truk yang Tiba & Verifikasi Dokumen</h2>
                    <p className="text-[11px] text-slate-500">Pilih nomor surat jalan truk yang sedang bersandar di bay bongkar.</p>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-bold px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
                  HANDHELD 2 • RECEIVING
                </span>
              </div>

              <div className="text-xs space-y-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Pilih Surat Jalan Truk yang Tiba *</label>
                  <select
                    value={selectedDeliveryId}
                    onChange={(e) => setSelectedDeliveryId(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-mono font-bold text-xs bg-slate-50"
                  >
                    {deliveries.map((d) => {
                      const isCompleted = d.status === 'approved' || d.reconciliation_status === 'matched';
                      return (
                        <option key={d.id} value={d.id}>
                          {d.delivery_number}: {d.spk?.spk_number} ({d.dispatch_epcs_json?.length || 0} Tag Berangkat) {isCompleted ? `(✓ Selesai / Restocked)` : `[${d.status.toUpperCase()}]`}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Reader Handheld Presentasi</label>
                  <select value={selectedReaderId} onChange={(e) => setSelectedReaderId(e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-xl bg-slate-50 font-semibold">
                    <option value="">Pilih reader meja/hybrid</option>
                    {readerDevices.map((device) => <option key={device.id} value={device.id}>{device.device_name} ({device.device_code})</option>)}
                  </select>
                  <p className={`mt-1 text-[11px] ${wsConnected ? 'text-emerald-700' : readerError ? 'text-rose-600' : 'text-slate-500'}`}>{wsConnected ? 'Reader terhubung dalam mode ENROLLMENT.' : readerError || 'Reader mengikuti gudang surat jalan terpilih.'}</p>
                </div>

                {/* Info Surat Jalan Terpilih */}
                {selectedDeliveryId && (() => {
                  const del = deliveries.find(d => d.id === parseInt(selectedDeliveryId, 10));
                  if (!del) return null;
                  return (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-700">Kontrak: {del.spk?.spk_number}</span>
                        <span className="text-[10px] font-mono font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                          {del.dispatch_epcs_json?.length || 0} Tag Dikirim dari Yard
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Gudang Penerima: <strong>{del.warehouse?.name}</strong> · Vendor: <strong>{del.spk?.principal?.name}</strong>
                      </div>

                      {/* Rincian Material yang Dimuat di Truk Ini (Interactive Real-time Breakdown & Guidance) */}
                      {receivingMaterialsBreakdown.length > 0 && (() => {
                        const totalManifestQty = receivingMaterialsBreakdown.reduce((sum, it) => sum + it.manifestQty, 0);
                        const totalScannedQty = receivingMaterialsBreakdown.reduce((sum, it) => sum + it.scannedCount, 0);
                        const shortageItems = receivingMaterialsBreakdown.filter((m) => m.missingCount > 0);
                        const completedItems = receivingMaterialsBreakdown.filter((m) => m.isCompleted);

                        const filteredBreakdown = receivingMaterialsBreakdown.filter((m) => {
                          if (receivingMaterialFilter === 'SHORTAGE') return m.missingCount > 0;
                          if (receivingMaterialFilter === 'COMPLETED') return m.isCompleted;
                          return true;
                        });

                        return (
                          <div className="pt-3 border-t border-slate-200 space-y-2.5">
                            {/* Header Panel */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <Package className="w-4 h-4 text-blue-600" />
                                  <h4 className="text-xs font-black text-slate-800 tracking-tight">
                                    Rincian Material yang Dimuat di Truk Ini
                                  </h4>
                                </div>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                  {receivingMaterialsBreakdown.length} Jenis Material • Total Manifest: <strong className="text-slate-700">{totalManifestQty} Unit</strong> • Terpindai: <strong className="text-blue-700">{totalScannedQty} Unit</strong>
                                </p>
                              </div>

                              {/* Filter Tabs */}
                              <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-xl text-[10px] font-bold self-start sm:self-auto">
                                <button
                                  type="button"
                                  onClick={() => setReceivingMaterialFilter('ALL')}
                                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                                    receivingMaterialFilter === 'ALL'
                                      ? 'bg-white text-slate-800 shadow-2xs font-black'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  Semua ({receivingMaterialsBreakdown.length})
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setReceivingMaterialFilter('SHORTAGE')}
                                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                                    receivingMaterialFilter === 'SHORTAGE'
                                      ? 'bg-rose-600 text-white shadow-2xs font-black'
                                      : shortageItems.length > 0
                                      ? 'text-rose-700 hover:text-rose-900 font-black'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  {shortageItems.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />}
                                  <span>Kurang ({shortageItems.length})</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setReceivingMaterialFilter('COMPLETED')}
                                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                                    receivingMaterialFilter === 'COMPLETED'
                                      ? 'bg-emerald-600 text-white shadow-2xs font-black'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  Lengkap ({completedItems.length})
                                </button>
                              </div>
                            </div>

                            {/* Alert Callout: Deteksi Barang Kurang & Tombol Langsung Arahkan */}
                            {shortageItems.length > 0 && (
                              <div className="bg-gradient-to-r from-amber-50 via-rose-50 to-amber-50 border border-amber-300 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 animate-fade-in shadow-2xs">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-lg bg-amber-100 border border-amber-300 text-amber-800 flex items-center justify-center shrink-0">
                                    <AlertTriangle className="w-4 h-4 text-amber-700" />
                                  </div>
                                  <div className="text-[11px] leading-tight">
                                    <span className="font-bold text-amber-950 block">
                                      Terdeteksi {shortageItems.length} Jenis Material Belum Lengkap:
                                    </span>
                                    <span className="text-amber-800">
                                      {shortageItems.map((m) => `${m.itemName} (kurang ${m.missingCount} ${m.unit})`).join(' · ')}
                                    </span>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleFocusShortageItem(shortageItems[0].itemId)}
                                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-[11px] flex items-center justify-center gap-1.5 shadow-xs transition active:scale-95 whitespace-nowrap cursor-pointer"
                                >
                                  <Target className="w-3.5 h-3.5" />
                                  <span>Arahkan ke Barang Kurang</span>
                                </button>
                              </div>
                            )}

                            {/* List Card Tiap Jenis Material */}
                            <div className="space-y-2 max-h-[380px] overflow-y-auto pr-0.5">
                              {filteredBreakdown.length === 0 ? (
                                <div className="text-center py-6 text-slate-400 text-xs bg-white rounded-xl border border-slate-200">
                                  Tidak ada jenis material yang sesuai dengan filter.
                                </div>
                              ) : (
                                filteredBreakdown.map((m) => {
                                  const isExpanded = !!expandedReceivingItemIds[m.itemId];
                                  const isHighlighted = highlightedItemId === m.itemId;

                                  return (
                                    <div
                                      key={m.itemId}
                                      id={`receiving-item-card-${m.itemId}`}
                                      className={`rounded-xl border transition-all duration-200 overflow-hidden ${
                                        isHighlighted
                                          ? 'border-blue-500 ring-2 ring-blue-400/50 bg-blue-50/30 shadow-sm'
                                          : m.isCompleted
                                          ? 'border-emerald-200 bg-white hover:border-emerald-300'
                                          : m.missingCount > 0
                                          ? 'border-amber-300 bg-white hover:border-rose-400'
                                          : 'border-slate-200 bg-white'
                                      }`}
                                    >
                                      {/* Header Card */}
                                      <div className="p-3">
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="truncate flex-1">
                                            <div className="flex items-center gap-1.5">
                                              <span className="font-bold text-slate-800 text-xs truncate">
                                                {m.itemName}
                                              </span>
                                              {isHighlighted && (
                                                <span className="px-1.5 py-0.2 bg-blue-600 text-white text-[9px] font-bold rounded">
                                                  Fokus
                                                </span>
                                              )}
                                            </div>
                                            <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                                              Kode: {m.itemCode}
                                            </div>
                                          </div>

                                          {/* Status Badge */}
                                          <div className="text-right shrink-0">
                                            {m.isCompleted ? (
                                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full font-bold text-[10px] font-mono">
                                                <CheckCircle className="w-3 h-3 text-emerald-600" />
                                                Lengkap ({m.scannedCount}/{m.manifestQty} {m.unit})
                                              </span>
                                            ) : (
                                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-rose-100 text-rose-800 border border-rose-300 rounded-full font-bold text-[10px] font-mono">
                                                <AlertTriangle className="w-3 h-3 text-rose-600" />
                                                Kurang {m.missingCount} {m.unit} ({m.scannedCount}/{m.manifestQty})
                                              </span>
                                            )}
                                          </div>
                                        </div>

                                        {/* Progress Bar */}
                                        <div className="mt-2.5 space-y-1">
                                          <div className="flex justify-between text-[10px] font-mono text-slate-500 font-semibold">
                                            <span>Progress Fisik Tiba: {m.scannedCount} dari {m.manifestQty} {m.unit}</span>
                                            <span className={m.isCompleted ? 'text-emerald-700 font-bold' : 'text-amber-700 font-bold'}>
                                              {m.percent}%
                                            </span>
                                          </div>
                                          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/80">
                                            <div
                                              className={`h-full transition-all duration-300 rounded-full ${
                                                m.isCompleted
                                                  ? 'bg-emerald-500'
                                                  : m.percent > 0
                                                  ? 'bg-amber-500'
                                                  : 'bg-rose-400'
                                              }`}
                                              style={{ width: `${Math.min(100, Math.max(m.percent, 3))}%` }}
                                            />
                                          </div>
                                        </div>

                                        {/* Toggle Rincian EPC */}
                                        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setExpandedReceivingItemIds((prev) => ({
                                                ...prev,
                                                [m.itemId]: !prev[m.itemId],
                                              }))
                                            }
                                            className="text-[11px] text-blue-600 hover:text-blue-800 font-bold inline-flex items-center gap-1 transition cursor-pointer"
                                          >
                                            {isExpanded ? (
                                              <>
                                                <ChevronUp className="w-3.5 h-3.5" /> Sembunyikan Rincian EPC
                                              </>
                                            ) : (
                                              <>
                                                <ChevronDown className="w-3.5 h-3.5" /> Lihat Rincian EPC ({m.missingCount > 0 ? `${m.missingCount} Kurang` : 'Lengkap'})
                                              </>
                                            )}
                                          </button>

                                          {m.missingCount > 0 && (
                                            <button
                                              type="button"
                                              onClick={() => handleCopyMissingEpcs(m)}
                                              className="text-[10px] text-slate-500 hover:text-slate-800 font-bold inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded border border-slate-200 transition cursor-pointer"
                                              title="Salin daftar nomor seri/EPC yang belum terbaca"
                                            >
                                              <Copy className="w-3 h-3" /> Salin EPC Kurang
                                            </button>
                                          )}
                                        </div>
                                      </div>

                                      {/* Expanded EPC List */}
                                      {isExpanded && (
                                        <div className="bg-slate-50/90 border-t border-slate-200 p-3 space-y-2.5 text-xs animate-fade-in">
                                          {/* Tag yang Kurang */}
                                          {m.missingEpcs.length > 0 && (
                                            <div className="space-y-1.5">
                                              <div className="flex items-center justify-between text-[11px] text-rose-800 font-bold">
                                                <span className="flex items-center gap-1">
                                                  <AlertTriangle className="w-3 h-3 text-rose-600" />
                                                  Tag Belum Terbaca / Belum Tiba ({m.missingEpcs.length} EPC):
                                                </span>
                                                <span className="text-[10px] text-slate-400 font-normal">Cari fisik tag ini di truk</span>
                                              </div>
                                              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-1 bg-rose-50/50 border border-rose-200 rounded-lg">
                                                {m.missingEpcs.map((epc, i) => (
                                                  <span
                                                    key={i}
                                                    className="font-mono text-[10px] font-bold px-1.5 py-0.5 bg-white text-rose-700 border border-rose-300 rounded shadow-2xs"
                                                  >
                                                    ❌ {epc}
                                                  </span>
                                                ))}
                                              </div>
                                            </div>
                                          )}

                                          {/* Tag yang Sudah Terbaca */}
                                          <div className="space-y-1.5">
                                            <div className="flex items-center justify-between text-[11px] text-emerald-800 font-bold">
                                              <span className="flex items-center gap-1">
                                                <CheckCircle className="w-3 h-3 text-emerald-600" />
                                                Tag Berhasil Terbaca ({m.scannedEpcs.length} EPC):
                                              </span>
                                            </div>
                                            {m.scannedEpcs.length === 0 ? (
                                              <div className="text-[10px] text-slate-400 italic p-1">
                                                Belum ada tag untuk material ini yang terbaca di scanner bongkar.
                                              </div>
                                            ) : (
                                              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-1 bg-emerald-50/50 border border-emerald-200 rounded-lg">
                                                {m.scannedEpcs.map((epc, i) => (
                                                  <span
                                                    key={i}
                                                    className="font-mono text-[10px] font-bold px-1.5 py-0.5 bg-white text-emerald-700 border border-emerald-300 rounded shadow-2xs"
                                                  >
                                                    ✓ {epc}
                                                  </span>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {del.proof_photo_url ? (
                        <div className="pt-2 border-t border-slate-200 flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-slate-600">Foto Muatan Saat Berangkat:</span>
                          <button
                            type="button"
                            onClick={() => setPreviewMedia({ url: del.proof_photo_url, type: 'image', title: `Foto Keberangkatan ${del.delivery_number}` })}
                            className="text-[11px] text-blue-600 hover:underline font-bold inline-flex items-center gap-1"
                          >
                            <ImageIcon className="w-3.5 h-3.5" /> Buka Foto Asal
                          </button>
                        </div>
                      ) : (
                        <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-500">Tidak ada lampiran</div>
                      )}
                    </div>
                  );
                })()}

                {/* Upload only before the first persisted receiving submission. */}
                <div className="border border-slate-200 bg-slate-50/80 rounded-2xl p-3.5 space-y-3">
                  <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-blue-600" />
                    Bukti Fisik Pembongkaran Gudang Transit
                  </div>

                  {selectedDelivery?.received_by_user_id ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      {selectedDelivery.receiving_proof_photo_url ? (
                        <button type="button" onClick={() => setPreviewMedia({ url: selectedDelivery.receiving_proof_photo_url, type: 'image', title: 'Bukti Fisik Pembongkaran' })} className="text-emerald-700 font-bold hover:underline">Lihat foto receiving</button>
                      ) : <span className="text-slate-500">Tidak ada lampiran</span>}
                      {selectedDelivery.receiving_document_url ? (
                        <button type="button" onClick={() => setPreviewMedia({ url: selectedDelivery.receiving_document_url, type: 'document', title: 'Surat Jalan / BAST Penerimaan' })} className="text-blue-700 font-bold hover:underline">Lihat dokumen receiving</button>
                      ) : <span className="text-slate-500">Tidak ada lampiran</span>}
                    </div>
                  ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="bg-white p-3 rounded-xl border border-slate-200">
                      <label className="font-semibold text-slate-700 block mb-1.5">
                        Foto Fisik Saat Bongkar:
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => handleFileUpload(e.target.files[0], 'delivery_proofs', (url) => setReceivingPhotoUrl(url))}
                        className="text-xs file:mr-2 file:py-1.5 file:px-2.5 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white file:font-bold file:text-[11px] cursor-pointer"
                      />
                      {receivingPhotoUrl && (
                        <button type="button" onClick={() => setPreviewMedia({ url: receivingPhotoUrl, type: 'image', title: 'Bukti Fisik Pembongkaran' })} className="mt-2 text-[11px] text-emerald-700 font-bold flex items-center gap-1 hover:underline">
                          <ExternalLink className="w-3.5 h-3.5" /> Lihat gambar
                        </button>
                      )}
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-slate-200">
                      <label className="font-semibold text-slate-700 block mb-1.5">
                        Surat Jalan / BAST Bertanda Tangan:
                      </label>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={(e) => handleFileUpload(e.target.files[0], 'delivery_proofs', (url) => setReceivingDocUrl(url))}
                        className="text-xs file:mr-2 file:py-1.5 file:px-2.5 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white file:font-bold file:text-[11px] cursor-pointer"
                      />
                      {receivingDocUrl && (
                        <button type="button" onClick={() => setPreviewMedia({ url: receivingDocUrl, type: 'document', title: 'Surat Jalan / BAST Penerimaan' })} className="mt-2 text-[11px] text-blue-700 font-bold flex items-center gap-1 hover:underline">
                          <ExternalLink className="w-3.5 h-3.5" /> Lihat attachment
                        </button>
                      )}
                    </div>
                  </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Receiving Scan Console & Live Reconciler (5 Cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-slate-900 text-blue-400 flex items-center justify-center font-bold">
                    <Scan className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">2. Scan Tag Bongkar</h3>
                    <p className="text-[11px] text-slate-500">Pindai tiang/kabel saat diturunkan dari truk.</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border flex items-center gap-1 ${
                    wsConnected ? 'bg-blue-50 text-blue-700 border-blue-300' : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}>
                    <Radio className={`w-3 h-3 ${wsConnected ? 'animate-pulse text-blue-600' : 'text-slate-400'}`} />
                    {wsConnected ? '🟢 Live Reader' : '⚪ Manual / USB'}
                  </span>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 font-bold font-mono">
                    {receivingEpcsText.split('\n').filter(s => s.trim().length > 0).length} EPC
                  </span>
                </div>
              </div>

              {/* Action Bar */}
              <div className="flex justify-between items-center text-xs">
                <span className="text-[11px] text-slate-500 italic">
                  Dekatkan tag ke sensor atau tembakkan handheld reader.
                </span>
                <button
                  type="button"
                  onClick={() => setReceivingEpcsText('')}
                  className="text-slate-400 hover:text-rose-600 text-[11px] font-semibold transition cursor-pointer"
                >
                  Bersihkan
                </button>
              </div>
              {/* Quick Status Chips per Material */}
              {receivingMaterialsBreakdown.length > 0 && (
                <div className="space-y-1.5 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-slate-700 flex items-center gap-1">
                      <Package className="w-3.5 h-3.5 text-blue-600" />
                      Status Real-time per Material:
                    </span>
                    {receivingMaterialsBreakdown.some((m) => m.missingCount > 0) && (
                      <button
                        type="button"
                        onClick={() => {
                          const firstShortage = receivingMaterialsBreakdown.find((m) => m.missingCount > 0);
                          if (firstShortage) handleFocusShortageItem(firstShortage.itemId);
                        }}
                        className="text-[10px] text-rose-600 hover:text-rose-700 font-bold flex items-center gap-0.5 transition cursor-pointer underline"
                      >
                        <Target className="w-3 h-3" /> Arahkan ke yang Kurang
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {receivingMaterialsBreakdown.map((m) => {
                      const isHighlighted = highlightedItemId === m.itemId;
                      return (
                        <button
                          key={m.itemId}
                          type="button"
                          onClick={() => handleFocusShortageItem(m.itemId)}
                          className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold flex items-center gap-1.5 transition border cursor-pointer ${
                            m.isCompleted
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                              : m.missingCount > 0
                              ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-rose-50'
                              : 'bg-white text-slate-700 border-slate-200'
                          } ${isHighlighted ? 'ring-2 ring-blue-500 shadow-xs' : ''}`}
                          title={`Klik untuk menyorot detail ${m.itemName}`}
                        >
                          <span className="truncate max-w-[120px]">{m.itemName}:</span>
                          <span className={m.isCompleted ? 'text-emerald-700' : 'text-rose-700 font-bold'}>
                            {m.scannedCount}/{m.manifestQty} {m.isCompleted ? '✓' : `(Kurang ${m.missingCount})`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <textarea
                rows={7}
                required
                value={receivingEpcsText}
                onChange={(e) => setReceivingEpcsText(e.target.value)}
                placeholder="Scan tag EPC bongkar di sini...&#10;E28011606000020410000001&#10;E28011606000020410000002&#10;..."
                className="w-full p-3 font-mono text-xs border border-slate-300 rounded-xl bg-slate-900 text-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
              />

              {(() => {
                const currentDel = deliveries.find(d => d.id === parseInt(selectedDeliveryId, 10));
                const isCompleted = currentDel && (currentDel.status === 'approved' || currentDel.reconciliation_status === 'matched');
                if (isCompleted) {
                  return (
                    <button
                      type="button"
                      disabled
                      className="w-full py-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl font-bold shadow-xs text-xs flex items-center justify-center gap-2 cursor-not-allowed"
                    >
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                      <span>Pengiriman Selesai (Telah Masuk Stok Gudang)</span>
                    </button>
                  );
                }
                return (
                  <button
                    type="submit"
                    disabled={uploading}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md transition text-xs flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                  >
                    <ArrowRightLeft className="w-4 h-4" />
                    <span>{uploading ? 'Sedang Mengunggah...' : 'Jalankan Rekonsiliasi Susut In-Transit'}</span>
                  </button>
                );
              })()}

              {/* Live Reconciliation Result */}
              {reconciliationResult && (
                <div className={`p-4 rounded-2xl border space-y-3 animate-fade-in ${
                  reconciliationResult.status === 'matched' ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-300'
                }`}>
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-xs">
                      {reconciliationResult.status === 'matched' ? '✅ 100% MATCH: Fisik Lengkap' : '⚠️ MISMATCH: Terjadi Susut In-Transit!'}
                    </span>
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                      reconciliationResult.status === 'matched' ? 'bg-emerald-200 text-emerald-900' : 'bg-rose-200 text-rose-900'
                    }`}>
                      {reconciliationResult.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-white p-2 rounded-xl border border-slate-200">
                      <div className="text-slate-400 text-[10px]">H1 Berangkat</div>
                      <div className="font-bold text-sm text-slate-800">{reconciliationResult.total_dispatched} Tag</div>
                    </div>
                    <div className="bg-white p-2 rounded-xl border border-slate-200">
                      <div className="text-slate-400 text-[10px]">H2 Diterima</div>
                      <div className="font-bold text-sm text-slate-800">{reconciliationResult.total_received} Tag</div>
                    </div>
                    <div className="bg-white p-2 rounded-xl border border-slate-200">
                      <div className="text-slate-400 text-[10px]">Selisih Susut</div>
                      <div className={`font-bold text-sm ${reconciliationResult.missing_in_transit_count > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {reconciliationResult.missing_in_transit_count} Tag
                      </div>
                    </div>
                  </div>

                  {reconciliationResult.missing_epcs?.length > 0 && (
                    <div className="text-xs text-rose-800 font-mono bg-white p-2.5 rounded-xl border border-rose-200 space-y-1">
                      <strong className="block text-[11px] text-rose-900">Tag EPC Hilang di Jalan:</strong>
                      {reconciliationResult.missing_epcs.map((epc, i) => (
                        <div key={i} className="text-[11px] text-rose-700">❌ {epc}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </form>
      )}

      {/* VIEW 4: Deliveries History Table (Full-Width High-Density) */}
      {activeView === 'deliveries' && (
        <div className="space-y-3.5">
          {/* Filter Bar */}
          <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-center gap-3">
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-72">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Cari No. Surat Jalan, SPK, Vendor..."
                  value={deliverySearch}
                  onChange={(e) => setDeliverySearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium placeholder:text-slate-400"
                />
              </div>

              <select
                value={deliveryStatusFilter}
                onChange={(e) => setDeliveryStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="ALL">Semua Status Rekonsiliasi</option>
                <option value="in_transit">In-Transit (Di Perjalanan)</option>
                <option value="approved">Approved (100% Match)</option>
                <option value="mismatch_flagged">Mismatch (Ada Susut)</option>
              </select>
            </div>

            <div className="text-xs font-semibold text-slate-500">
              Total: <strong className="text-slate-800">{filteredDeliveries.length}</strong> Pengiriman Truk
            </div>
          </div>

          {/* High-Density Data Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-3.5">No. Surat Jalan</th>
                    <th className="py-3 px-3.5">Kontrak SPK</th>
                    <th className="py-3 px-3.5">Gudang Penerima</th>
                    <th className="py-3 px-3.5 text-center">Tag Berangkat vs Tiba</th>
                    <th className="py-3 px-3.5 text-center">Bukti Dokumen & Foto</th>
                    <th className="py-3 px-3.5 text-center">Status Rekonsiliasi</th>
                    <th className="py-3 px-3.5">Waktu Tiba</th>
                    <th className="py-3 px-3.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDeliveries.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        Tidak ada pengiriman truk yang sesuai dengan filter pencarian.
                      </td>
                    </tr>
                  ) : (
                    filteredDeliveries.map((del) => {
                      const dispatchPic = del.dispatched_by?.name || del.dispatchedBy?.name || '-';
                      const receivePic = del.received_by?.name || del.receivedBy?.name || '-';
                      return (
                        <tr key={del.id} className="hover:bg-slate-50/80 transition">
                          <td className="py-2.5 px-3.5 font-mono">
                            <div className="font-bold text-slate-900">{del.delivery_number}</div>
                            <div className="text-[10px] text-slate-500 font-sans mt-0.5 space-y-0.5">
                              <div>Muat: <strong className="text-slate-700">{dispatchPic}</strong></div>
                              {del.received_by_user_id && (
                                <div>Bongkar: <strong className="text-slate-700">{receivePic}</strong></div>
                              )}
                            </div>
                          </td>
                        <td className="py-2.5 px-3.5 text-slate-600">
                          <span className="font-semibold block text-slate-800">{del.spk?.spk_number}</span>
                          <span className="text-[10px] text-slate-400">{del.spk?.principal?.name}</span>
                        </td>
                        <td className="py-2.5 px-3.5 text-slate-700 font-medium">{del.warehouse?.name}</td>
                        <td className="py-2.5 px-3.5 text-center font-mono">
                          <span className="text-emerald-700 font-bold">{del.dispatch_epcs_json?.length || del.items?.reduce((a,b)=>a+b.delivered_qty, 0)}</span>
                          <span className="text-slate-400"> / </span>
                          <span className={del.received_epcs_json?.length ? 'font-bold text-blue-700' : 'text-slate-400'}>
                            {del.received_epcs_json?.length || '-'}
                          </span>
                          <span className="text-[10px] text-slate-400 ml-1">Tag</span>
                        </td>
                        <td className="py-2.5 px-3.5 text-center">
                          <div className="inline-flex items-center gap-1.5">
                            {del.proof_photo_url && (
                              <button
                                onClick={() => setPreviewMedia({ url: del.proof_photo_url, type: 'image', title: `Foto Muatan: ${del.delivery_number}` })}
                                className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1 text-[11px] font-medium cursor-pointer"
                                title="Lihat Foto Bukti"
                              >
                                <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Foto</span>
                              </button>
                            )}
                            {del.document_url && (
                              <button
                                onClick={() => setPreviewMedia({ url: del.document_url, type: 'document', title: `Surat Jalan: ${del.delivery_number}` })}
                                className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1 text-[11px] font-medium cursor-pointer"
                                title="Lihat Dokumen Surat Jalan"
                              >
                                <FileText className="w-3.5 h-3.5 text-blue-600" />
                                <span>SJ PDF</span>
                              </button>
                            )}
                            {!del.proof_photo_url && !del.document_url && !del.receiving_proof_photo_url && !del.receiving_document_url && (
                              <span className="text-slate-500 text-[11px]">Tidak ada lampiran</span>
                            )}
                            {del.receiving_proof_photo_url && (
                              <button onClick={() => setPreviewMedia({ url: del.receiving_proof_photo_url, type: 'image', title: `Foto Receiving: ${del.delivery_number}` })} className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-[11px] font-medium">Foto Receiving</button>
                            )}
                            {del.receiving_document_url && (
                              <button onClick={() => setPreviewMedia({ url: del.receiving_document_url, type: 'document', title: `Dokumen Receiving: ${del.delivery_number}` })} className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-[11px] font-medium">Dokumen Receiving</button>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3.5 text-center">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                            del.status === 'approved'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : del.reconciliation_status === 'in_transit'
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : 'bg-rose-100 text-rose-800 border border-rose-200'
                          }`}>
                            {del.reconciliation_status === 'in_transit' ? 'IN-TRANSIT (DI JALAN)' : del.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-2.5 px-3.5 text-slate-500 text-[11px]">
                          {new Date(del.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-2.5 px-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setSelectedDeliveryDetail(del)}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                              title="Lihat Detail & Log Pengiriman"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Detail</span>
                            </button>
                            {del.reconciliation_status === 'in_transit' && (
                              (!currentUser || ['superadmin', 'storeroom'].includes(currentUser.role)) ? (
                                <button
                                  onClick={() => {
                                    setSelectedDeliveryId(del.id);
                                    handleSwitchView('receiving_scan');
                                  }}
                                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-xs cursor-pointer"
                                  title="Bongkar muatan truk di gudang transit (Handheld 2: Staf Gudang)"
                                >
                                  <Scan className="w-3.5 h-3.5" />
                                  <span>Bongkar</span>
                                </button>
                              ) : (
                                <span className="text-[11px] font-medium text-slate-400 italic px-1.5 py-0.5 bg-slate-50 border border-slate-200 rounded-md">
                                  Menunggu Gudang
                                </span>
                              )
                            )}
                            {del.status === 'mismatch_flagged' && (!currentUser || ['superadmin', 'pm', 'management'].includes(currentUser.role)) && (
                              <button
                                onClick={() => handleApproveDelivery(del.id)}
                                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
                                title="Investigasi & Setujui Selisih Muatan (PM / Direksi)"
                              >
                                Approve PM
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
        </div>
      )}

      {/* Modal Detail Pengiriman Truk (Delivery Audit Log) */}
      {selectedDeliveryDetail && (
        <Portal>
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[100] animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-5xl w-full space-y-5 shadow-2xl relative my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  SURAT JALAN & LOGISTIK
                </span>
                <h3 className="font-black text-lg text-slate-900 mt-1">{selectedDeliveryDetail.delivery_number}</h3>
                <p className="text-xs text-slate-600">
                  Kontrak SPK: <strong>{selectedDeliveryDetail.spk?.spk_number}</strong> ({selectedDeliveryDetail.spk?.principal?.name})
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Gudang Tujuan: <strong>{selectedDeliveryDetail.warehouse?.name}</strong>
                </p>
              </div>
              <button
                onClick={() => setSelectedDeliveryDetail(null)}
                className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Status Summary Banner */}
            <div className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between ${
              selectedDeliveryDetail.status === 'approved' || selectedDeliveryDetail.reconciliation_status === 'matched'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : selectedDeliveryDetail.reconciliation_status === 'in_transit'
                ? 'bg-blue-50 border-blue-200 text-blue-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}>
              <div className="flex items-center gap-2.5">
                <Shield className="w-5 h-5 shrink-0" />
                <div>
                  <span className="font-bold block">
                    {selectedDeliveryDetail.reconciliation_status === 'in_transit'
                      ? 'Status Pengiriman: In-Transit (Sedang di Jalan)'
                      : selectedDeliveryDetail.status === 'approved'
                      ? 'Status Rekonsiliasi: Sesuai 100% (Matched & Approved)'
                      : 'Status Rekonsiliasi: Mismatch / Selisih Fisik Flagged'}
                  </span>
                  <span className="text-[11px] opacity-80">
                    Total Tag Muat: {selectedDeliveryDetail.dispatch_epcs_json?.length || 0} EPC • Tag Diterima: {selectedDeliveryDetail.received_epcs_json?.length || 0} EPC
                  </span>
                </div>
              </div>
              <span className="font-mono font-bold text-[10px] px-2.5 py-1 rounded-full bg-white/90 border border-slate-200">
                {selectedDeliveryDetail.reconciliation_status?.toUpperCase()}
              </span>
            </div>

            {/* Dispatch & Receiving Info Box */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-xs">
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">1. Origin Dispatch (Yard Principal):</span>
                <div className="font-bold text-slate-800">
                  PIC Muat: {selectedDeliveryDetail.dispatched_by?.name || selectedDeliveryDetail.dispatchedBy?.name || 'PIC Dispatch'}
                </div>
                <div className="text-[11px] text-slate-500">
                  Waktu Muat: {new Date(selectedDeliveryDetail.dispatched_at || selectedDeliveryDetail.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                </div>
                <div className="text-[11px] text-emerald-700 font-semibold font-mono">
                  {selectedDeliveryDetail.dispatch_epcs_json?.length || 0} Tag RFID Terpasang
                </div>
              </div>

              <div className="space-y-1 sm:border-l sm:border-slate-200 sm:pl-3">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">2. Receiving (Gudang Transit):</span>
                <div className="font-bold text-slate-800">
                  PIC Bongkar: {selectedDeliveryDetail.received_by?.name || selectedDeliveryDetail.receivedBy?.name || ((selectedDeliveryDetail.received_at || selectedDeliveryDetail.verified_at) ? 'Storeroom Staff' : 'Menunggu Truk Tiba')}
                </div>
                <div className="text-[11px] text-slate-500">
                  Waktu Terima: {(selectedDeliveryDetail.received_at || selectedDeliveryDetail.verified_at) ? new Date(selectedDeliveryDetail.received_at || selectedDeliveryDetail.verified_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : 'Belum Dibongkar'}
                </div>
                <div className="text-[11px] text-blue-700 font-semibold font-mono">
                  {selectedDeliveryDetail.received_epcs_json?.length || 0} Tag RFID Terpindai
                </div>
              </div>
            </div>

            {/* Rincian Material Muatan Manifest */}
            {selectedDeliveryDetail.items && selectedDeliveryDetail.items.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                  <span className="flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-blue-600" />
                    Manifest Material Muatan Truk ({selectedDeliveryDetail.items.length} Jenis Barang):
                  </span>
                  <span className="text-[11px] font-mono text-slate-500 font-semibold">
                    Total Muat: {selectedDeliveryDetail.items.reduce((s, it) => s + (Number(it.delivered_qty) || 0), 0)} Unit
                  </span>
                </div>
                <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden text-xs">
                  {selectedDeliveryDetail.items.map((it, idx) => (
                    <div key={idx} className="p-2.5 flex items-center justify-between bg-slate-50/50 hover:bg-slate-50 transition">
                      <div>
                        <div className="font-bold text-slate-800">{it.item?.name || `Item #${it.item_id}`}</div>
                        <div className="text-[10px] text-slate-400 font-mono">Kode: {it.item?.item_code || '-'}</div>
                      </div>
                      <div className="text-right">
                        <span className="font-bold font-mono text-xs px-2.5 py-1 bg-blue-50 text-blue-800 border border-blue-200 rounded-lg">
                          {it.delivered_qty} {it.item?.unit || 'Unit'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Timeline & Audit Log */}
            <div className="space-y-2 pt-1 border-t border-slate-100">
              <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <History className="w-4 h-4 text-emerald-600" />
                Timeline Riwayat Pengiriman & Audit CoC:
              </h4>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  <div className="relative">
                    <span className="absolute -left-6 top-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-white" />
                    <div className="text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-900">Muat Truk di Yard Principal (Handheld 1)</span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {new Date(selectedDeliveryDetail.dispatched_at || selectedDeliveryDetail.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        Dimuat oleh <strong>{selectedDeliveryDetail.dispatched_by?.name || selectedDeliveryDetail.dispatchedBy?.name || 'PIC'}</strong> dengan {selectedDeliveryDetail.dispatch_epcs_json?.length || 0} tag RFID anti-metal.
                      </p>
                    </div>
                  </div>

                  {(selectedDeliveryDetail.received_at || selectedDeliveryDetail.verified_at) ? (
                    <div className="relative">
                      <span className="absolute -left-6 top-0.5 w-3 h-3 rounded-full bg-blue-500 ring-4 ring-white" />
                      <div className="text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-900">Bongkar & Receiving Scan (Handheld 2)</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {new Date(selectedDeliveryDetail.received_at || selectedDeliveryDetail.verified_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          Diterima di <strong>{selectedDeliveryDetail.warehouse?.name}</strong> oleh <strong>{selectedDeliveryDetail.received_by?.name || selectedDeliveryDetail.receivedBy?.name || 'Storeroom'}</strong>.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      <span className="absolute -left-6 top-0.5 w-3 h-3 rounded-full bg-amber-400 ring-4 ring-white" />
                      <div className="text-xs">
                        <span className="font-bold text-amber-800">Dalam Perjalanan Menuju {selectedDeliveryDetail.warehouse?.name}</span>
                        <p className="text-[11px] text-slate-500 mt-0.5">Menunggu proses bongkar muatan dan verifikasi Handheld 2 di gudang.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-between items-center pt-2 border-t border-slate-100">
              <div className="flex items-center gap-2">
                {selectedDeliveryDetail.proof_photo_url && (
                  <button
                    onClick={() => setPreviewMedia({ url: selectedDeliveryDetail.proof_photo_url, type: 'image', title: `Foto Muatan: ${selectedDeliveryDetail.delivery_number}` })}
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    <ImageIcon className="w-4 h-4" />
                    Lihat Foto Muatan
                  </button>
                )}
                {selectedDeliveryDetail.document_url && (
                  <button
                    onClick={() => setPreviewMedia({ url: selectedDeliveryDetail.document_url, type: 'document', title: `Surat Jalan: ${selectedDeliveryDetail.delivery_number}` })}
                    className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    <FileText className="w-4 h-4" />
                    Lihat Surat Jalan PDF
                  </button>
                )}
                {selectedDeliveryDetail.receiving_proof_photo_url && (
                  <button onClick={() => setPreviewMedia({ url: selectedDeliveryDetail.receiving_proof_photo_url, type: 'image', title: `Foto Receiving: ${selectedDeliveryDetail.delivery_number}` })} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold">Lihat Foto Receiving</button>
                )}
                {selectedDeliveryDetail.receiving_document_url && (
                  <button onClick={() => setPreviewMedia({ url: selectedDeliveryDetail.receiving_document_url, type: 'document', title: `Dokumen Receiving: ${selectedDeliveryDetail.delivery_number}` })} className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold">Lihat Dokumen Receiving</button>
                )}
                {!selectedDeliveryDetail.proof_photo_url && !selectedDeliveryDetail.document_url && !selectedDeliveryDetail.receiving_proof_photo_url && !selectedDeliveryDetail.receiving_document_url && (
                  <span className="text-xs text-slate-500">Tidak ada lampiran</span>
                )}
              </div>

              <button
                onClick={() => setSelectedDeliveryDetail(null)}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {/* Modal Dialog: Buat Kontrak SPK Baru */}
      {showCreateSpkModal && (
        <Portal>
          <div className="fixed inset-0 z-[100] bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 md:p-8 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl my-auto flex flex-col max-h-[94vh] overflow-hidden border border-slate-100">
            {/* Modal Header */}
            <div className="px-6 py-4 sm:px-8 sm:py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 via-white to-emerald-50/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20 shrink-0">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-lg sm:text-xl text-slate-800 tracking-tight">Buat Kontrak SPK Baru</h3>
                    <span className="hidden sm:inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                      Procurement
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Pendaftaran pengadaan material vendor, alokasi proyek & skema termin pembayaran
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateSpkModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition duration-150 focus:outline-hidden cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateSpkSubmit} className="flex flex-col flex-1 overflow-hidden">
              {/* Scrollable Form Body */}
              <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-6">
                {/* Manual Draft Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-amber-50/70 border border-amber-200/80 rounded-2xl gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                    <Clock className="w-4 h-4 text-amber-600" />
                    <span>{spkDraftSavedAt ? `Draf tersimpan: ${spkDraftSavedAt}` : 'Draf Form: Belum tersimpan'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSaveSpkDraft}
                      className="px-3 py-1.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition active:scale-95 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5 text-amber-700" />
                      <span>Simpan Draf Form</span>
                    </button>
                    {spkDraftSavedAt && (
                      <>
                        <button
                          type="button"
                          onClick={handleLoadSpkDraft}
                          className="px-3 py-1.5 bg-white hover:bg-blue-50 text-blue-700 border border-blue-300 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition active:scale-95 cursor-pointer"
                        >
                          <FolderDown className="w-3.5 h-3.5" />
                          <span>Muat Draf</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleClearSpkDraft}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          title="Hapus Draf"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* SECTION 1: Informasi Kontrak & Principal */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                    <FileText className="w-4 h-4 text-emerald-600" />
                    <span>Informasi Kontrak & Principal</span>
                    <span className="text-rose-500 font-bold text-xs">*</span>
                  </div>

                  <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-4 sm:p-5 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {/* Principal Vendor */}
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">
                          Principal Vendor / Client <span className="text-rose-500">*</span>
                        </label>
                        <select
                          value={createSpkForm.principal_id}
                          onChange={(e) => {
                            const prinId = e.target.value;
                            const prin = principals.find((p) => p.id === parseInt(prinId, 10));
                            const matchingProjects = prinId ? projects.filter((p) => p.principal_id === parseInt(prinId, 10)) : [];
                            const isCurrentProjectValid = matchingProjects.some((p) => p.id === parseInt(createSpkForm.project_id, 10));

                            setCreateSpkForm((prev) => ({
                              ...prev,
                              principal_id: prinId,
                              project_id: isCurrentProjectValid ? prev.project_id : (matchingProjects.length === 1 ? matchingProjects[0].id : ''),
                              spk_number: prinId ? `SPK/${prin?.code || 'PRIN'}-OPS/${new Date().getFullYear()}/${Math.floor(100 + Math.random() * 900)}` : '',
                            }));
                          }}
                          required
                          className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 shadow-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition cursor-pointer"
                        >
                          <option value="">-- Pilih Principal Vendor --</option>
                          {principals.map((p) => (
                            <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                          ))}
                        </select>
                      </div>

                      {/* Nomor Kontrak SPK */}
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">
                          Nomor Kontrak SPK <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={createSpkForm.spk_number}
                          onChange={(e) => setCreateSpkForm({ ...createSpkForm, spk_number: e.target.value })}
                          placeholder="SPK/PRIN-OPS/2026/001"
                          className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-800 shadow-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                        />
                      </div>

                      {/* Proyek Asosiasi (Dinamis Berdasarkan Principal) */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs font-bold text-slate-700">
                            Proyek Terkait <span className="text-slate-400 font-normal">(Opsional)</span>
                          </label>
                          {createSpkForm.principal_id ? (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              availableProjectsForSpk.length > 0
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}>
                              {availableProjectsForSpk.length} Proyek {principals.find((p) => p.id === parseInt(createSpkForm.principal_id, 10))?.code || ''}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">Pilih Principal dulu</span>
                          )}
                        </div>
                        <select
                          value={createSpkForm.project_id}
                          onChange={(e) => setCreateSpkForm({ ...createSpkForm, project_id: e.target.value })}
                          disabled={!createSpkForm.principal_id}
                          className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-medium shadow-xs transition ${
                            !createSpkForm.principal_id
                              ? 'bg-slate-100/80 border border-slate-200 text-slate-400 cursor-not-allowed'
                              : 'bg-white border border-slate-300 text-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer'
                          }`}
                        >
                          {!createSpkForm.principal_id ? (
                            <option value="">-- Pilih Principal Vendor Terlebih Dahulu --</option>
                          ) : availableProjectsForSpk.length === 0 ? (
                            <option value="">-- Tidak ada proyek khusus (Pengadaan Umum) --</option>
                          ) : (
                            <>
                              <option value="">-- Umum / Tanpa Proyek Spesifik --</option>
                              {availableProjectsForSpk.map((pr) => (
                                <option key={pr.id} value={pr.id}>
                                  {pr.code}: {pr.name} {pr.location ? `(${pr.location})` : ''}
                                </option>
                              ))}
                            </>
                          )}
                        </select>
                        <p className="text-[11px] text-slate-500 mt-1">
                          {!createSpkForm.principal_id
                            ? 'Pilih principal vendor untuk memuat daftar proyek yang sesuai.'
                            : availableProjectsForSpk.length > 0
                            ? `Hanya menampilkan proyek milik ${principals.find((p) => p.id === parseInt(createSpkForm.principal_id, 10))?.name}.`
                            : 'Principal ini belum memiliki proyek khusus. SPK akan dicatat sebagai alokasi umum.'}
                        </p>
                      </div>

                      {/* Judul Kontrak */}
                      <div className="md:col-span-2 lg:col-span-3">
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">
                          Nama / Judul Pengadaan SPK <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={createSpkForm.title}
                          onChange={(e) => setCreateSpkForm({ ...createSpkForm, title: e.target.value })}
                          placeholder="Contoh: Pengadaan Tiang Besi 7M & Kabel Fiber Optik Drop Core"
                          className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 shadow-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* SECTION 2: Finansial, Legalitas & Catatan */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                    <span>Status Finansial, Dokumen Legalitas & Catatan</span>
                  </div>

                  <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-4 sm:p-5 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Status Pembayaran */}
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">
                          Status Pembayaran Awal
                        </label>
                        <select
                          value={createSpkForm.payment_status}
                          onChange={(e) => setCreateSpkForm({ ...createSpkForm, payment_status: e.target.value })}
                          className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 shadow-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition cursor-pointer"
                        >
                          <option value="unpaid">UNPAID (Belum Bayar DP / Pembayaran Pending)</option>
                          <option value="partial">PARTIAL (Sudah Bayar DP / Termin Berjalan)</option>
                          <option value="paid">PAID (Lunas Penuh)</option>
                        </select>
                      </div>

                      {/* Dokumen Kontrak PDF */}
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">
                          Dokumen Kontrak SPK (PDF / DOC)
                        </label>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                          <label className="flex items-center justify-center gap-2 px-3.5 py-2.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 cursor-pointer shadow-xs transition active:scale-95">
                            <FileUp className="w-4 h-4 text-emerald-600" />
                            <span>{uploading ? 'Mengunggah...' : 'Pilih Berkas Dokumen'}</span>
                            <input
                              type="file"
                              accept=".pdf,.doc,.docx"
                              disabled={uploading}
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  handleFileUpload(file, 'spk_documents', (url) => {
                                    setCreateSpkForm((prev) => ({ ...prev, document_url: url }));
                                  });
                                }
                              }}
                            />
                          </label>

                          {createSpkForm.document_url ? (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-[11px] font-bold">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span className="truncate max-w-[140px]">Dokumen Terunggah</span>
                              <button
                                type="button"
                                onClick={() => setPreviewMedia({ url: createSpkForm.document_url, type: 'document', title: 'Dokumen Kontrak SPK' })}
                                className="text-emerald-700 hover:text-emerald-900 underline ml-1 cursor-pointer"
                              >
                                Lihat
                              </button>
                              <button
                                type="button"
                                onClick={() => setCreateSpkForm((prev) => ({ ...prev, document_url: '' }))}
                                className="text-slate-400 hover:text-rose-600 ml-1 p-0.5 cursor-pointer"
                                title="Hapus berkas"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">Belum ada dokumen diunggah</span>
                          )}
                        </div>
                      </div>

                      {/* Catatan / Notes */}
                      <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">
                          Catatan Tambahan / Klausul Pengadaan <span className="text-slate-400 font-normal">(Opsional)</span>
                        </label>
                        <textarea
                          rows={2}
                          value={createSpkForm.notes || ''}
                          onChange={(e) => setCreateSpkForm({ ...createSpkForm, notes: e.target.value })}
                          placeholder="Klausul termin pengiriman, PIC vendor lapangan, garansi barang, atau nomor PO pendukung..."
                          className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 shadow-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition resize-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* SECTION 3: Daftar Rincian Material Pesanan */}
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 text-slate-800 font-bold text-sm">
                        <Package className="w-4 h-4 text-emerald-600" />
                        <span>Daftar Material Pesanan</span>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-200 text-slate-700">
                        {createSpkForm.items.length} Item
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleAddItemRow}
                      className="flex items-center justify-center gap-1.5 px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold shadow-xs transition active:scale-95 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Tambah Baris Material</span>
                    </button>
                  </div>

                  {/* Desktop Item Table View */}
                  <div className="hidden md:block bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                    <div className="grid grid-cols-12 gap-3 px-4 py-3 bg-slate-100/80 border-b border-slate-200 text-[11px] font-black text-slate-600 uppercase tracking-wider">
                      <div className="col-span-5">Pilihan Material / Barang *</div>
                      <div className="col-span-2 text-center">Target Qty *</div>
                      <div className="col-span-2 text-right">Harga Satuan (Rp) *</div>
                      <div className="col-span-2 text-right">Subtotal Nilai</div>
                      <div className="col-span-1 text-center">Aksi</div>
                    </div>

                    <div className="divide-y divide-slate-100">
                      {createSpkForm.items.map((row, idx) => {
                        const itemObj = availableItems.find((it) => it.id === parseInt(row.item_id, 10));
                        const subtotal = Number(row.target_qty || 0) * Number(row.price_per_unit || 0);
                        return (
                          <div key={idx} className="grid grid-cols-12 gap-3 px-4 py-3 items-center hover:bg-slate-50/70 transition">
                            {/* Material Select */}
                            <div className="col-span-5">
                              <select
                                value={row.item_id}
                                onChange={(e) => handleUpdateItemRow(idx, 'item_id', e.target.value)}
                                className="w-full px-3 py-2 bg-slate-50/80 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition cursor-pointer"
                                required
                              >
                                <option value="">-- Pilih Material --</option>
                                {availableItems.map((it) => (
                                  <option key={it.id} value={it.id}>
                                    {it.code}: {it.name} ({it.unit})
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Target Qty */}
                            <div className="col-span-2">
                              <div className="relative flex items-center">
                                <input
                                  type="number"
                                  min="1"
                                  value={row.target_qty}
                                  onChange={(e) => handleUpdateItemRow(idx, 'target_qty', e.target.value)}
                                  className="w-full px-3 py-2 pr-12 bg-slate-50/80 border border-slate-300 rounded-xl text-center text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                                  required
                                />
                                <span className="absolute right-2 text-[10px] font-bold text-slate-400 pointer-events-none uppercase">
                                  {itemObj?.unit || 'Unit'}
                                </span>
                              </div>
                            </div>

                            {/* Harga Satuan */}
                            <div className="col-span-2">
                              <input
                                type="number"
                                min="0"
                                step="500"
                                value={row.price_per_unit}
                                onChange={(e) => handleUpdateItemRow(idx, 'price_per_unit', e.target.value)}
                                className="w-full px-3 py-2 bg-slate-50/80 border border-slate-300 rounded-xl text-right text-xs font-mono font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                                placeholder="0"
                                required
                              />
                            </div>

                            {/* Subtotal */}
                            <div className="col-span-2 text-right">
                              <span className="font-mono font-black text-slate-800 text-xs">
                                Rp {subtotal.toLocaleString('id-ID')}
                              </span>
                            </div>

                            {/* Delete Action */}
                            <div className="col-span-1 flex justify-center">
                              {createSpkForm.items.length > 1 ? (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItemRow(idx)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                                  title="Hapus baris material"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              ) : (
                                <span className="text-slate-300 text-xs">-</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Mobile Item Card View */}
                  <div className="block md:hidden space-y-3">
                    {createSpkForm.items.map((row, idx) => {
                      const itemObj = availableItems.find((it) => it.id === parseInt(row.item_id, 10));
                      const subtotal = Number(row.target_qty || 0) * Number(row.price_per_unit || 0);
                      return (
                        <div key={idx} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-xs">
                          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                            <span className="text-xs font-black text-slate-700">Material #{idx + 1}</span>
                            {createSpkForm.items.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveItemRow(idx)}
                                className="flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:bg-rose-50 px-2 py-1 rounded-lg transition cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Hapus</span>
                              </button>
                            )}
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1">Pilih Material *</label>
                            <select
                              value={row.item_id}
                              onChange={(e) => handleUpdateItemRow(idx, 'item_id', e.target.value)}
                              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 cursor-pointer"
                              required
                            >
                              <option value="">-- Pilih Material --</option>
                              {availableItems.map((it) => (
                                <option key={it.id} value={it.id}>
                                  {it.code}: {it.name} ({it.unit})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-600 mb-1">Target Qty ({itemObj?.unit || 'Unit'}) *</label>
                              <input
                                type="number"
                                min="1"
                                value={row.target_qty}
                                onChange={(e) => handleUpdateItemRow(idx, 'target_qty', e.target.value)}
                                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-center text-xs font-bold text-slate-800"
                                required
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-600 mb-1">Harga Satuan (Rp) *</label>
                              <input
                                type="number"
                                min="0"
                                step="500"
                                value={row.price_per_unit}
                                onChange={(e) => handleUpdateItemRow(idx, 'price_per_unit', e.target.value)}
                                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-right text-xs font-mono font-bold text-slate-800"
                                required
                              />
                            </div>
                          </div>

                          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-bold">
                            <span className="text-slate-500">Subtotal:</span>
                            <span className="text-emerald-700 font-mono font-black">
                              Rp {subtotal.toLocaleString('id-ID')}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* SECTION 4: Ringkasan Finansial & Kalkulasi Kontrak */}
                {(() => {
                  const grandTotal = createSpkForm.items.reduce(
                    (s, it) => s + (Number(it.target_qty || 0) * Number(it.price_per_unit || 0)),
                    0
                  );
                  const totalUnits = createSpkForm.items.reduce(
                    (s, it) => s + Number(it.target_qty || 0),
                    0
                  );
                  return (
                    <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white rounded-3xl p-5 sm:p-6 shadow-xl border border-slate-700/50 space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-700/60">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                            <Calculator className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="font-bold text-sm text-slate-100">Kalkulasi Ringkasan Kontrak</h4>
                            <p className="text-[11px] text-slate-400">Otomatisasi nilai pagu dan rincian termin invoice</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-[11px] uppercase tracking-wider font-bold text-slate-400 block">Total Nilai SPK</span>
                          <span className="text-xl sm:text-2xl font-black font-mono text-emerald-400">
                            Rp {grandTotal.toLocaleString('id-ID')}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-white/5 rounded-2xl p-3 border border-white/5">
                          <span className="text-[10px] text-slate-400 font-bold block">TOTAL SKU</span>
                          <span className="text-sm font-black text-white">{createSpkForm.items.length} Macam</span>
                        </div>
                        <div className="bg-white/5 rounded-2xl p-3 border border-white/5">
                          <span className="text-[10px] text-slate-400 font-bold block">TOTAL KUANTITAS</span>
                          <span className="text-sm font-black text-white">{totalUnits.toLocaleString('id-ID')} Unit/Batang</span>
                        </div>
                        <div className="bg-white/5 rounded-2xl p-3 border border-white/5">
                          <span className="text-[10px] text-slate-400 font-bold block">DP 30%</span>
                          <span className="text-xs font-mono font-bold text-emerald-300">
                            Rp {Math.round(grandTotal * 0.3).toLocaleString('id-ID')}
                          </span>
                        </div>
                        <div className="bg-white/5 rounded-2xl p-3 border border-white/5">
                          <span className="text-[10px] text-slate-400 font-bold block">PELUNASAN 70%</span>
                          <span className="text-xs font-mono font-bold text-emerald-300">
                            Rp {Math.round(grandTotal * 0.7).toLocaleString('id-ID')}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Modal Sticky Footer */}
              <div className="px-6 py-4 sm:px-8 sm:py-5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                <div className="text-xs text-slate-500 text-center sm:text-left">
                  Pastikan seluruh data pengadaan dan kuantitas material telah terisi dengan benar.
                </div>

                <div className="flex items-center gap-2.5 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setShowCreateSpkModal(false)}
                    className="flex-1 sm:flex-none px-5 py-2.5 border border-slate-300 hover:bg-slate-200/60 bg-white rounded-xl font-bold text-xs text-slate-700 transition active:scale-95 cursor-pointer shadow-xs"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveSpkDraft}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl font-bold text-xs shadow-xs transition active:scale-95 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5 text-amber-700" />
                    <span>Simpan Draf</span>
                  </button>
                  <button
                    type="submit"
                    disabled={loading || uploading}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-lg shadow-emerald-600/30 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Menyimpan...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Simpan Kontrak SPK</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
        </Portal>
      )}

      {/* Modal Preview Photo / Document */}
      {previewMedia && (
        <Portal>
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[100] animate-fade-in overflow-y-auto">
            <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-3xl w-full space-y-4 shadow-2xl relative my-8 max-h-[92vh] overflow-y-auto">
              <div className="flex justify-between items-center border-b pb-2">
                <h3 className="font-bold text-sm text-slate-800">{previewMedia.title}</h3>
                <button
                  onClick={() => setPreviewMedia(null)}
                  className="p-1.5 hover:bg-slate-100 rounded-full text-slate-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex flex-col items-center justify-center p-2 bg-slate-50 rounded-xl min-h-[220px]">
                {previewMedia.type === 'image' ? (
                  <img
                    src={previewMedia.url}
                    alt={previewMedia.title}
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = 'https://placehold.co/600x400?text=Foto+Bukti+Surat+Jalan';
                    }}
                    className="max-h-[500px] w-auto rounded-lg object-contain border"
                  />
                ) : (
                  <div className="text-center p-6 space-y-3">
                    <FileText className="w-16 h-16 text-blue-500 mx-auto" />
                    <div className="text-xs font-bold text-slate-700">Attachment Terlampir</div>
                    <a
                      href={previewMedia.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Buka / Unduh Attachment
                    </a>
                  </div>
                )}
              </div>

              <div className="text-right">
                <button
                  onClick={() => setPreviewMedia(null)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded-xl text-xs font-bold text-slate-700"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* Modal Dialog: Eksekusi Approval Kontrak SPK Langsung */}
      {approvalModalOpen && selectedSpkForApproval && (
        <Portal>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[100] animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-5 shadow-2xl border border-slate-100 my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-indigo-700 font-bold text-base">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
                <span>Persetujuan Kontrak SPK</span>
              </div>
              <button
                onClick={() => setApprovalModalOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Target SPK Info Card */}
            <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-1.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="font-mono font-bold text-slate-800 text-sm">{selectedSpkForApproval.spk_number}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Step {selectedSpkForApproval.approval_request?.current_step_order || 1}/{selectedSpkForApproval.approval_request?.total_steps || 1}
                </span>
              </div>
              <div className="font-semibold text-slate-700">{selectedSpkForApproval.title}</div>
              <div className="text-[11px] text-slate-500 flex justify-between pt-1 border-t border-slate-200">
                <span>Principal: <strong>{selectedSpkForApproval.principal?.name}</strong></span>
                <span className="font-mono font-bold text-emerald-700">Rp {Number(selectedSpkForApproval.total_amount || 0).toLocaleString('id-ID')}</span>
              </div>
            </div>

            {/* Action Type Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">Keputusan Approval *</label>
              <div className="grid grid-cols-3 gap-2 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setApprovalActionType('approved')}
                  className={`py-2.5 px-3 rounded-xl border flex items-center justify-center gap-1.5 transition ${
                    approvalActionType === 'approved'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Setujui</span>
                </button>
                <button
                  type="button"
                  onClick={() => setApprovalActionType('revision_requested')}
                  className={`py-2.5 px-3 rounded-xl border flex items-center justify-center gap-1.5 transition ${
                    approvalActionType === 'revision_requested'
                      ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  <span>Revisi</span>
                </button>
                <button
                  type="button"
                  onClick={() => setApprovalActionType('rejected')}
                  className={`py-2.5 px-3 rounded-xl border flex items-center justify-center gap-1.5 transition ${
                    approvalActionType === 'rejected'
                      ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <X className="w-4 h-4" />
                  <span>Tolak</span>
                </button>
              </div>
            </div>

            {/* Comments textarea */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex justify-between">
                <span>Catatan / Justifikasi {approvalActionType !== 'approved' && <span className="text-rose-500">*</span>}</span>
                <span className="text-[10px] text-slate-400 font-normal">Tercatat di Audit Trail</span>
              </label>
              <textarea
                rows={3}
                required={approvalActionType !== 'approved'}
                placeholder={
                  approvalActionType === 'approved'
                    ? 'Contoh: SPK pengadaan tiang disetujui sesuai kuota proyek.'
                    : 'Wajib sebutkan rincian koreksi atau alasan penolakan...'
                }
                value={approvalComments}
                onChange={(e) => setApprovalComments(e.target.value)}
                className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setApprovalModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={processingApproval}
                onClick={handleSubmitSpkApproval}
                className={`px-5 py-2 text-white rounded-xl text-xs font-bold shadow transition flex items-center gap-1.5 cursor-pointer ${
                  approvalActionType === 'approved'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : approvalActionType === 'revision_requested'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                } ${processingApproval ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {processingApproval ? (
                  <span>Memproses...</span>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Konfirmasi {approvalActionType === 'approved' ? 'Persetujuan' : approvalActionType === 'revision_requested' ? 'Permintaan Revisi' : 'Penolakan'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}
      {/* MODAL PRE-CHECK: Pratinjau Rekonsiliasi Muatan Truk (Full Match & Mismatch) */}
      {discrepancyModalOpen && discrepancyData && (
        <Portal>
          <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className={`bg-white rounded-3xl max-w-5xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border p-6 sm:p-8 space-y-5 animate-in fade-in zoom-in-95 duration-150 ${
            discrepancyData.isFullMatch ? 'border-emerald-200' : 'border-amber-200'
          }`}>
            {/* Header Modal */}
            <div className={`flex items-start justify-between border-b pb-4 ${
              discrepancyData.isFullMatch ? 'border-emerald-100' : 'border-amber-100'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-2xl border flex items-center justify-center font-bold shadow-xs ${
                  discrepancyData.isFullMatch
                    ? 'bg-emerald-100 border-emerald-300 text-emerald-700'
                    : 'bg-amber-100 border-amber-300 text-amber-700'
                }`}>
                  {discrepancyData.isFullMatch ? (
                    <CheckCircle className="w-6 h-6 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="w-6 h-6 text-amber-600" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                      discrepancyData.isFullMatch
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-amber-100 text-amber-800 border-amber-300'
                    }`}>
                      {discrepancyData.isFullMatch ? 'PRE-RECONCILIATION: 100% MATCH' : 'PRE-RECONCILIATION: MISMATCH'}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">
                      No. SJ: {discrepancyData.delivery.delivery_number}
                    </span>
                  </div>
                  <h2 className="text-base font-black text-slate-900 mt-0.5">
                    {discrepancyData.isFullMatch
                      ? 'Pratinjau Rekonsiliasi: Muatan Truk 100% Lengkap & Sesuai Manifest'
                      : 'Peringatan: Terdeteksi Selisih Muatan Truk (Mismatch Shortage)'}
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCancelAndRescan}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                title="Tutup & Periksa Ulang"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Banner Ringkasan Selisih */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 text-center">
                <div className="text-[10px] text-slate-500 font-bold uppercase">Berangkat (Yard)</div>
                <div className="text-lg font-black text-slate-900 mt-0.5 font-mono">
                  {discrepancyData.dispatched.length}
                </div>
                <div className="text-[10px] text-slate-400">Tag Manifest Pabrik</div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 text-center">
                <div className="text-[10px] text-blue-700 font-bold uppercase">Terbaca (Gudang)</div>
                <div className="text-lg font-black text-blue-800 mt-0.5 font-mono">
                  {discrepancyData.received.length}
                </div>
                <div className="text-[10px] text-blue-600">Tag Hasil Scan Bongkar</div>
              </div>
              <div className={`border rounded-2xl p-3 text-center ${
                discrepancyData.missingInTransit.length === 0
                  ? 'bg-emerald-50 border-emerald-200'
                  : 'bg-rose-50 border-rose-200'
              }`}>
                <div className={`text-[10px] font-bold uppercase ${
                  discrepancyData.missingInTransit.length === 0 ? 'text-emerald-700' : 'text-rose-700'
                }`}>Kurang / Hilang</div>
                <div className={`text-lg font-black mt-0.5 font-mono ${
                  discrepancyData.missingInTransit.length === 0 ? 'text-emerald-700' : 'text-rose-700'
                }`}>
                  {discrepancyData.missingInTransit.length}
                </div>
                <div className={`text-[10px] ${
                  discrepancyData.missingInTransit.length === 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}>
                  {discrepancyData.missingInTransit.length === 0 ? 'Lengkap Sempurna' : 'In-Transit Shrinkage'}
                </div>
              </div>
              <div className={`border rounded-2xl p-3 text-center ${
                discrepancyData.unexpected.length === 0
                  ? 'bg-emerald-50 border-emerald-200'
                  : 'bg-amber-50 border-amber-200'
              }`}>
                <div className={`text-[10px] font-bold uppercase ${
                  discrepancyData.unexpected.length === 0 ? 'text-emerald-700' : 'text-amber-700'
                }`}>Tidak Dikenal</div>
                <div className={`text-lg font-black mt-0.5 font-mono ${
                  discrepancyData.unexpected.length === 0 ? 'text-emerald-700' : 'text-amber-700'
                }`}>
                  {discrepancyData.unexpected.length}
                </div>
                <div className={`text-[10px] ${
                  discrepancyData.unexpected.length === 0 ? 'text-emerald-600' : 'text-amber-600'
                }`}>
                  {discrepancyData.unexpected.length === 0 ? 'Nol Tag Asing' : 'Bukan Milik Manifest'}
                </div>
              </div>
            </div>

            {/* Rincian Manifest Muatan Truk */}
            {discrepancyData.delivery.items && discrepancyData.delivery.items.length > 0 && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2 text-xs">
                <div className="flex items-center justify-between font-bold text-slate-700">
                  <span className="flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-blue-600" />
                    Rincian Material Muatan Truk ({discrepancyData.delivery.items.length} Jenis Material):
                  </span>
                  <span className="text-[11px] font-mono text-slate-500 font-normal">
                    Total Berangkat: {discrepancyData.delivery.items.reduce((s, it) => s + (Number(it.delivered_qty) || 0), 0)} Unit
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {discrepancyData.delivery.items.map((di, idx) => {
                    const itemBreakdown = receivingMaterialsBreakdown.find((m) => m.itemId === di.item_id);
                    const isShortage = itemBreakdown && itemBreakdown.missingCount > 0;
                    return (
                      <div
                        key={idx}
                        className={`border rounded-xl p-2.5 flex items-center justify-between transition ${
                          isShortage ? 'bg-rose-50/60 border-rose-300' : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="truncate pr-2">
                          <span className="font-bold text-slate-800 block truncate text-xs">
                            {di.item?.name || `Item #${di.item_id}`}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            {di.item?.item_code || '-'}
                          </span>
                        </div>
                        <div className="text-right shrink-0 font-mono text-xs">
                          {itemBreakdown ? (
                            <span
                              className={`px-2 py-0.5 rounded-lg font-bold border text-[11px] ${
                                itemBreakdown.isCompleted
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-rose-100 text-rose-800 border-rose-300'
                              }`}
                            >
                              {itemBreakdown.scannedCount}/{itemBreakdown.manifestQty} {itemBreakdown.isCompleted ? '✓ Lengkap' : `(Kurang ${itemBreakdown.missingCount})`}
                            </span>
                          ) : (
                            <span className="font-bold font-mono text-xs px-2 py-0.5 bg-blue-50 text-blue-800 border border-blue-100 rounded-lg whitespace-nowrap">
                              {di.delivered_qty} {di.item?.unit || 'Unit'}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* DETAIL SKENARIO 1: FULL MATCH PREVIEW */}
            {discrepancyData.isFullMatch && (
              <div className="space-y-4">
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 text-xs space-y-2">
                  <div className="flex items-center gap-2 text-emerald-900 font-bold">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span>Seluruh {discrepancyData.matched.length} Tag RFID Terverifikasi Valid (1-ke-1 Cocok dengan Manifest)</span>
                  </div>
                  <p className="text-emerald-700 text-[11px] leading-relaxed">
                    Tidak ditemukan susut in-transit maupun tag asing yang tidak terdaftar. Konfirmasi aksi di bawah ini akan langsung mencatatkan penerimaan ke buku inventaris aktif gudang transit.
                  </p>
                  <div className="max-h-28 overflow-y-auto flex flex-wrap gap-1.5 pt-1">
                    {discrepancyData.matched.map((epc, idx) => (
                      <span
                        key={idx}
                        className="font-mono text-[11px] font-bold bg-white text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-lg shadow-2xs flex items-center gap-1"
                      >
                        <span className="text-emerald-500">✓</span> {epc}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Aksi Full Match */}
                <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handleCancelAndRescan}
                    className="px-4 py-2.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs"
                  >
                    ↺ Kembali & Scan Ulang
                  </button>
                  <button
                    type="button"
                    disabled={isSubmittingEscalation}
                    onClick={handleConfirmFullMatchRestock}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center gap-2 cursor-pointer"
                  >
                    {isSubmittingEscalation ? (
                      <span>Memproses Restock...</span>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        <span>Konfirmasi & Masukkan ke Stok Gudang</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* DETAIL SKENARIO 2: MISMATCH PREVIEW & ACTIONS */}
            {!discrepancyData.isFullMatch && (
              <div className="space-y-4">
                {/* Rincian Tag yang Hilang */}
                {discrepancyData.missingInTransit.length > 0 && (
                  <div className="bg-rose-50/60 border border-rose-200 rounded-2xl p-3.5 text-xs space-y-2">
                    <div className="flex items-center justify-between text-rose-900 font-bold">
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-rose-600" />
                        Rincian Tag RFID yang Belum Ditemukan ({discrepancyData.missingInTransit.length} EPC):
                      </span>
                      <span className="text-[10px] text-rose-700 font-normal">Periksa kembali fisik barang di truk</span>
                    </div>
                    <div className="max-h-24 overflow-y-auto flex flex-wrap gap-1.5 p-1">
                      {discrepancyData.missingInTransit.map((epc, idx) => (
                        <span
                          key={idx}
                          className="font-mono text-[11px] font-bold bg-white text-rose-800 border border-rose-300 px-2 py-0.5 rounded-lg shadow-2xs"
                        >
                          {epc}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Rincian Tag Asing jika ada */}
                {discrepancyData.unexpected.length > 0 && (
                  <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-3.5 text-xs space-y-2">
                    <div className="flex items-center justify-between text-amber-900 font-bold">
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        Tag Asing / Tidak Terdaftar di Manifest ({discrepancyData.unexpected.length} EPC):
                      </span>
                    </div>
                    <div className="max-h-24 overflow-y-auto flex flex-wrap gap-1.5 p-1">
                      {discrepancyData.unexpected.map((epc, idx) => (
                        <span
                          key={idx}
                          className="font-mono text-[11px] font-bold bg-white text-amber-800 border border-amber-300 px-2 py-0.5 rounded-lg shadow-2xs"
                        >
                          {epc}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pilihan Tindakan Mismatch */}
                <div className="space-y-4 pt-1">
                  <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Pilih Tindakan Penyelesaian:
                  </div>

                  {/* OPSI 1: Scan Ulang */}
                  <div className="border border-slate-200 bg-slate-50/80 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="space-y-0.5 flex-1">
                      <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[10px] font-bold">1</span>
                        Periksa Fisik Truk & Lakukan Scan Ulang
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        Gunakan opsi ini jika dicurigai masih ada barang terselip di sudut bak truk. <strong>Data belum akan disimpan ke database</strong> dan tidak mengganggu antrean PM.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCancelAndRescan}
                      className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 rounded-xl text-xs font-bold transition whitespace-nowrap shadow-2xs cursor-pointer"
                    >
                      ↺ Kembali & Scan Ulang
                    </button>
                  </div>

                  {/* OPSI 2: Eskalasi Berita Acara ke PM */}
                  <div className="border-2 border-amber-300 bg-amber-50/40 rounded-2xl p-4 space-y-3.5">
                    <div className="space-y-1">
                      <div className="font-bold text-amber-950 text-xs flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-[10px] font-bold">2</span>
                        Buat Berita Acara & Eskalasi ke Project Manager
                      </div>
                      <p className="text-[11px] text-amber-900 leading-relaxed">
                        Gunakan opsi ini jika muatan truk <strong>sudah dibongkar total dan dipastikan memang ada barang yang hilang di perjalanan</strong>. Pengiriman akan berstatus <strong>MISMATCH FLAGGED</strong> dan <strong>DIKUNCI</strong> untuk investigasi PM.
                      </p>
                    </div>

                    {/* Form Input Bukti & Catatan Eskalasi */}
                    <div className="space-y-3 pt-2 border-t border-amber-200 text-xs">
                      {/* Catatan / Alasan (Wajib) */}
                      <div className="space-y-1">
                        <label className="font-bold text-slate-800 flex items-center justify-between">
                          <span>Kronologi & Berita Acara Lapangan <span className="text-rose-600 font-bold">*Wajib</span></span>
                          <span className="text-[10px] text-slate-400 font-normal">Tercatat di Audit Trail PM</span>
                        </label>
                        <textarea
                          rows={2}
                          value={escalationNotes}
                          onChange={(e) => setEscalationNotes(e.target.value)}
                          placeholder="Contoh: Pembongkaran selesai bersama sopir (Ahmad / B 9123 XYZ). Fisik tiang 7m memang kurang 2 batang dari manifest pabrik."
                          className="w-full p-2.5 bg-white border border-amber-300 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 font-medium"
                        />
                      </div>

                      {/* Upload Foto Bak Truk Kosong (Wajib) & BAST (Opsional) */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="bg-white p-3 rounded-xl border border-amber-200">
                          <label className="font-bold text-slate-800 block mb-1">
                            Foto Bukti Fisik Bak Truk Kosong: <span className="text-rose-600">*Wajib</span>
                          </label>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={(e) => handleFileUpload(e.target.files[0], 'delivery_proofs', (url) => setEscalationPhotoUrl(url))}
                            className="text-xs file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:bg-amber-600 file:text-white file:font-bold file:text-[11px] cursor-pointer"
                          />
                          {escalationPhotoUrl ? (
                            <button type="button" onClick={() => setPreviewMedia({ url: escalationPhotoUrl, type: 'image', title: 'Bukti Fisik Bak Truk Kosong' })} className="mt-1.5 text-[11px] text-emerald-700 font-bold flex items-center gap-1 hover:underline">
                              <ExternalLink className="w-3.5 h-3.5" /> Lihat gambar
                            </button>
                          ) : (
                            <p className="mt-1 text-[10px] text-slate-400">Bukti muatan truk sudah diturunkan habis</p>
                          )}
                        </div>

                        <div className="bg-white p-3 rounded-xl border border-amber-200">
                          <label className="font-bold text-slate-800 block mb-1">
                            Foto BAST / Surat Jalan Berparaf Sopir:
                          </label>
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            onChange={(e) => handleFileUpload(e.target.files[0], 'delivery_proofs', (url) => setEscalationDocUrl(url))}
                            className="text-xs file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:bg-slate-700 file:text-white file:font-bold file:text-[11px] cursor-pointer"
                          />
                          {escalationDocUrl ? (
                            <button type="button" onClick={() => setPreviewMedia({ url: escalationDocUrl, type: 'document', title: 'BAST / Surat Jalan Eskalasi' })} className="mt-1.5 text-[11px] text-blue-700 font-bold flex items-center gap-1 hover:underline">
                              <ExternalLink className="w-3.5 h-3.5" /> Lihat attachment
                            </button>
                          ) : (
                            <p className="mt-1 text-[10px] text-slate-400">Bukti pengakuan kekurangan oleh ekspedisi</p>
                          )}
                        </div>
                      </div>

                      {/* Tombol Eksekusi Eskalasi */}
                      <div className="flex items-center justify-end gap-2.5 pt-2">
                        <button
                          type="button"
                          disabled={isSubmittingEscalation || !escalationNotes.trim() || !escalationPhotoUrl.trim()}
                          onClick={handleConfirmEscalationToPm}
                          className={`px-5 py-2.5 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center gap-2 cursor-pointer ${
                            isSubmittingEscalation || !escalationNotes.trim() || !escalationPhotoUrl.trim()
                              ? 'bg-amber-400 opacity-60 cursor-not-allowed'
                              : 'bg-amber-600 hover:bg-amber-700'
                          }`}
                        >
                          {isSubmittingEscalation ? (
                            <span>Mengirim Berita Acara...</span>
                          ) : (
                            <>
                              <AlertTriangle className="w-4 h-4" />
                              <span>Kirim Berita Acara Selisih ke PM</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        </Portal>
      )}
    </div>
  );
}
