import React, { useState, useEffect } from 'react';
import { approvalApi } from '../services/api';
import { showToast } from '../components/Toast';
import Portal from '../components/Portal';
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  FileCheck,
  ShieldCheck,
  ChevronRight,
  Filter,
  Search,
  UserCheck,
  Building2,
  Calendar,
  Layers,
  ArrowRight,
  RotateCcw,
  Plus,
  Trash2,
  Eye,
  X,
  Truck,
  Camera,
  FileText,
  AlertTriangle,
  ExternalLink
} from 'lucide-react';

export default function ApprovalCenter({ currentUser = null }) {
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'all' | 'templates'
  const [requests, setRequests] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [selectedRequestForAction, setSelectedRequestForAction] = useState(null);
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [actionType, setActionType] = useState('approved'); // 'approved' | 'rejected' | 'revision_requested'
  const [actionComment, setActionComment] = useState('');
  const [processingAction, setProcessingAction] = useState(false);

  // Filters
  const [moduleFilter, setModuleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [onlyMyPending, setOnlyMyPending] = useState(false);

  // Template Form Modal
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    code: '',
    module: 'WORK_ORDER',
    description: '',
    is_default: false,
    steps: [
      { step_name: 'Review & Persetujuan PM', approver_user_id: 2, sla_hours: 24 },
      { step_name: 'Verifikasi Superadmin', approver_user_id: 1, sla_hours: 48 },
    ],
  });

  const canActOnRequest = (req) => {
    if (!req) return false;
    if (req.status !== 'pending' && req.status !== 'revision_requested') return false;
    if (!currentUser) return false;
    if (currentUser.role === 'superadmin') return true;
    if (req.current_approver_user_id && req.current_approver_user_id === currentUser.id) return true;
    if (currentUser.role === 'pm' && (req.current_step_order === 1 || !req.current_approver_user_id)) return true;
    if (currentUser.role === 'management' && req.current_step_order >= 2) return true;
    return false;
  };

  const loadRequests = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const params = {};
      if (moduleFilter !== 'ALL') params.module = moduleFilter;
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (onlyMyPending && currentUser) {
        params.user_id = currentUser.id;
        params.filter_type = 'my_pending';
      }
      const res = await approvalApi.getRequests(params);
      setRequests(res.data.data || res.data || []);
    } catch (err) {
      console.error('Error loading approval requests:', err);
      showToast('Gagal memuat data approval', 'error');
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const res = await approvalApi.getTemplates();
      setTemplates(res.data || []);
    } catch (err) {
      console.error('Error loading approval templates:', err);
    }
  };

  useEffect(() => {
    if (activeTab === 'templates') {
      loadTemplates();
    } else {
      loadRequests();
    }
  }, [activeTab, moduleFilter, statusFilter, onlyMyPending]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (actionModalOpen) setActionModalOpen(false);
        else if (showTemplateModal) setShowTemplateModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [actionModalOpen, showTemplateModal]);

  const handleOpenAction = (req, type = 'approved') => {
    setSelectedRequestForAction(req);
    setActionType(type);
    setActionComment('');
    setActionModalOpen(true);
  };

  const submitAction = async () => {
    if (!selectedRequestForAction || !currentUser) return;
    if ((actionType === 'rejected' || actionType === 'revision_requested') && !actionComment.trim()) {
      showToast('Wajib mengisi catatan/alasan penolakan atau revisi', 'warning');
      return;
    }

    setProcessingAction(true);
    try {
      await approvalApi.processAction(selectedRequestForAction.id, {
        action: actionType,
        user_id: currentUser.id,
        comments: actionComment,
      });

      const actionLabels = {
        approved: 'disetujui',
        rejected: 'ditolak',
        revision_requested: 'dimintakan revisi',
      };
      showToast(`Permohonan ${selectedRequestForAction.request_number} berhasil ${actionLabels[actionType]}!`, 'success');
      const targetReqId = selectedRequestForAction.id;
      setRequests((prev) =>
        prev.map((r) =>
          r.id === targetReqId
            ? {
                ...r,
                status: actionType,
              }
            : r
        )
      );
      setActionModalOpen(false);
      setSelectedRequestForAction(null);
      setSelectedRequest(null);
      loadRequests(false);
    } catch (err) {
      const msg = err.response?.data?.message || 'Gagal memproses permohonan approval';
      showToast(msg, 'error');
    } finally {
      setProcessingAction(false);
    }
  };

  const handleCreateTemplate = async (e) => {
    e.preventDefault();
    if (!newTemplate.name || !newTemplate.code) {
      showToast('Nama dan Kode Template wajib diisi', 'warning');
      return;
    }

    try {
      const res = await approvalApi.createTemplate(newTemplate);
      showToast('Template approval berhasil disimpan', 'success');
      setShowTemplateModal(false);
      if (res.data) {
        setTemplates((prev) => [res.data, ...prev.filter((t) => t.id !== res.data.id)]);
      }
      loadTemplates();
    } catch (err) {
      showToast(err.response?.data?.message || 'Gagal membuat template', 'error');
    }
  };

  const filteredRequests = requests.filter((r) => {
    if (activeTab === 'pending' && r.status !== 'pending' && r.status !== 'revision_requested') {
      return false;
    }
    if (searchKeyword) {
      const kw = searchKeyword.toLowerCase();
      const matchNumber = r.request_number?.toLowerCase().includes(kw);
      const matchTitle = r.title?.toLowerCase().includes(kw);
      const matchRef = r.reference_code?.toLowerCase().includes(kw);
      return matchNumber || matchTitle || matchRef;
    }
    return true;
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'approved':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200"><CheckCircle2 className="w-3.5 h-3.5" /> Disetujui</span>;
      case 'rejected':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200"><XCircle className="w-3.5 h-3.5" /> Ditolak</span>;
      case 'revision_requested':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200"><RotateCcw className="w-3.5 h-3.5" /> Perlu Revisi</span>;
      default:
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200"><Clock className="w-3.5 h-3.5" /> Menunggu Review</span>;
    }
  };

  const getModuleBadge = (module) => {
    const colors = {
      WORK_ORDER: 'bg-purple-100 text-purple-700 border-purple-200',
      DELIVERY: 'bg-sky-100 text-sky-700 border-sky-200',
      SPK: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      GATE_ACCESS: 'bg-amber-100 text-amber-700 border-amber-200',
      RETURN_SCRAP: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    };
    return (
      <span className={`text-[11px] font-mono uppercase px-2 py-0.5 rounded border ${colors[module] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
        {module}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 font-semibold text-sm mb-1">
            <ShieldCheck className="w-5 h-5" />
            <span>Multi-Tier Digital Governance</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Pusat Approval & Transaksi</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Kelola rantai persetujuan bertingkat untuk Work Order, Kuota BOQ, Rekonsiliasi Pengiriman, dan Izin Pergerakan.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-slate-100 p-1 rounded-xl self-start md:self-auto border border-slate-200">
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'pending'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Inbox Menunggu
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'all'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Semua Permohonan
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'templates'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileCheck className="w-3.5 h-3.5" />
            Template & Aturan
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab !== 'templates' ? (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
              <div className="relative flex-1 max-w-xs">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari no permohonan, WO, judul..."
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <select
                value={moduleFilter}
                onChange={(e) => setModuleFilter(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="ALL">Semua Modul</option>
                <option value="WORK_ORDER">Work Order & BOQ</option>
                <option value="DELIVERY">Delivery & Shrinkage</option>
                <option value="SPK">SPK & PO Vendor</option>
                <option value="GATE_ACCESS">Gate Access</option>
                <option value="RETURN_SCRAP">Return / Scrap</option>
              </select>

              {activeTab === 'all' && (
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="ALL">Semua Status</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="revision_requested">Revision Requested</option>
                </select>
              )}
            </div>

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer select-none bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100">
                <input
                  type="checkbox"
                  checked={onlyMyPending}
                  onChange={(e) => setOnlyMyPending(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                />
                <span>Hanya Ditujukan ke Saya</span>
              </label>

              <button
                onClick={loadRequests}
                className="p-1.5 text-slate-500 hover:text-slate-700 bg-slate-50 border border-slate-200 rounded-lg"
                title="Refresh"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Request List */}
          {loading ? (
            <div className="bg-white rounded-xl p-12 text-center text-slate-400 border border-slate-200">
              <div className="animate-spin w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full mx-auto mb-3" />
              Memuat data permohonan...
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="bg-white rounded-xl p-12 text-center text-slate-500 border border-slate-200 space-y-3">
              <FileCheck className="w-12 h-12 text-slate-300 mx-auto" />
              <div>
                <p className="font-bold text-slate-800">Tidak ada permohonan approval yang ditemukan</p>
                <p className="text-xs text-slate-500 mt-1">Semua dokumen dalam kondisi tervalidasi atau tidak sesuai filter pencarian.</p>
              </div>
              {(searchKeyword || moduleFilter !== 'ALL' || statusFilter !== 'ALL' || onlyMyPending) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchKeyword('');
                    setModuleFilter('ALL');
                    setStatusFilter('ALL');
                    setOnlyMyPending(false);
                  }}
                  className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Pencarian & Filter</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filteredRequests.map((req) => {
                const canAct = canActOnRequest(req);

                return (
                  <div
                    key={req.id}
                    className="bg-white rounded-xl p-5 shadow-sm border border-slate-200/80 hover:border-indigo-200 transition-all"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      {/* Left: Basic Info */}
                      <div className="space-y-1.5 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {getModuleBadge(req.module)}
                          <span className="font-mono text-xs font-bold text-slate-800">{req.request_number}</span>
                          {getStatusBadge(req.status)}
                          <span className="text-[11px] text-slate-500 font-mono">Ref: {req.reference_code}</span>
                        </div>
                        <h3 className="text-base font-bold text-slate-900 leading-snug">{req.title}</h3>
                        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 pt-1">
                          {req.project && (
                            <span className="flex items-center gap-1">
                              <Building2 className="w-3.5 h-3.5 text-slate-500" />
                              {req.project.name}
                            </span>
                          )}
                          {req.requester_user && (
                            <span className="flex items-center gap-1">
                              <UserCheck className="w-3.5 h-3.5 text-slate-500" />
                              Pemohon: <strong className="text-slate-800">{req.requester_user.name}</strong>
                            </span>
                          )}
                          {req.created_at && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-slate-500" />
                              {new Date(req.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Middle: Step Progress */}
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 lg:w-72">
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="font-semibold text-slate-700">
                            Langkah {req.current_step_order} dari {req.total_steps}
                          </span>
                          <span className="text-[11px] text-indigo-600 font-medium">
                            {Math.round((req.current_step_order / req.total_steps) * 100)}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mb-2">
                          <div
                            className="bg-indigo-600 h-full rounded-full transition-all"
                            style={{ width: `${(req.current_step_order / req.total_steps) * 100}%` }}
                          />
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          Reviewer Aktif:{' '}
                          <strong className="text-slate-800">
                            {req.current_approver_user?.name || (req.status === 'approved' ? 'Selesai' : '-')}
                          </strong>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex flex-wrap items-center gap-2 self-end lg:self-center">
                        <button
                          onClick={() => setSelectedRequest(req)}
                          className="px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Detail Alur
                        </button>

                        {canAct && (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleOpenAction(req, 'approved')}
                              className="px-3 py-2 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                              title="Setujui Permohonan"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Setujui
                            </button>
                            <button
                              onClick={() => handleOpenAction(req, 'revision_requested')}
                              className="px-3 py-2 rounded-lg text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-all flex items-center gap-1.5 cursor-pointer"
                              title="Minta Revisi Dokumen"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              Revisi
                            </button>
                            <button
                              onClick={() => handleOpenAction(req, 'rejected')}
                              className="px-3 py-2 rounded-lg text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition-all flex items-center gap-1.5 cursor-pointer"
                              title="Tolak Permohonan"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Tolak
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Templates Tab */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Daftar Template Alur Persetujuan Bertingkat</h2>
            <button
              onClick={() => setShowTemplateModal(true)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Buat Template Baru
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="bg-white rounded-xl p-5 shadow-sm border border-slate-200/80 space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    {getModuleBadge(tpl.module)}
                    {tpl.is_default && (
                      <span className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded font-semibold">
                        Default Template
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-bold text-slate-900">{tpl.name}</h3>
                  <p className="text-xs text-slate-500">{tpl.description || 'Tidak ada keterangan tambahan.'}</p>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <span className="text-xs font-semibold text-slate-700">Urutan Rantai Persetujuan:</span>
                  <div className="space-y-1.5">
                    {tpl.steps?.map((step) => (
                      <div
                        key={step.id || step.step_order}
                        className="flex items-center justify-between text-xs bg-slate-50 p-2 rounded-lg border border-slate-100"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold text-[10px] flex items-center justify-center">
                            {step.step_order}
                          </span>
                          <span className="font-medium text-slate-800">{step.step_name}</span>
                        </div>
                        <span className="text-[11px] text-slate-500">
                          {step.approver_user?.name || `User #${step.approver_user_id}`} ({step.sla_hours}j SLA)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detail / Timeline Modal */}
      {selectedRequest && !actionModalOpen && (
        <Portal>
          <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-5xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-200 p-6 sm:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-150 my-8">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  {getModuleBadge(selectedRequest.module)}
                  <span className="font-mono text-xs font-bold text-slate-700">{selectedRequest.request_number}</span>
                  {getStatusBadge(selectedRequest.status)}
                </div>
                <h2 className="text-lg font-bold text-slate-900">{selectedRequest.title}</h2>
              </div>
              <button
                onClick={() => setSelectedRequest(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Originator / Requester Box */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs space-y-2">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Informasi Pemohon / Pembuat Data (Originator)</div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center">
                    <UserCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-sm">{selectedRequest.requester_user?.name || 'Originator'}</div>
                    <div className="text-[11px] text-slate-500">
                      Role: <span className="font-semibold text-slate-700 capitalize">{selectedRequest.requester_user?.role || 'User'}</span> • {selectedRequest.requester_user?.email || '-'}
                    </div>
                  </div>
                </div>
                <div className="text-right text-[11px] text-slate-500">
                  <div>Waktu Pengajuan:</div>
                  <div className="font-semibold text-slate-800">
                    {new Date(selectedRequest.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                  </div>
                </div>
              </div>
              {selectedRequest.notes && (
                <div className="pt-2 border-t border-slate-200 text-slate-600">
                  <span className="font-semibold text-slate-700">Catatan Pemohon: </span>
                  {selectedRequest.notes}
                </div>
              )}
            </div>

            {/* Dossier Berita Acara Selisih Pengiriman (Jika Module DELIVERY) */}
            {selectedRequest.module === 'DELIVERY' && selectedRequest.meta_data_json && (
              <div className="bg-amber-50/70 border border-amber-300 rounded-2xl p-4 text-xs space-y-3.5">
                <div className="flex items-center justify-between border-b border-amber-200 pb-2.5">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span className="font-bold text-amber-950 uppercase tracking-wider text-[11px]">
                      Laporan Berita Acara Selisih Muatan (In-Transit Shrinkage)
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-amber-200/70 text-amber-900 rounded-full">
                    HANDHELD 2 AUDIT
                  </span>
                </div>

                {/* Ringkasan Angka */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <div className="bg-white p-2.5 rounded-xl border border-amber-200">
                    <div className="text-[10px] text-slate-500 font-bold uppercase">Berangkat (Yard)</div>
                    <div className="text-base font-black text-slate-900 mt-0.5 font-mono">
                      {selectedRequest.meta_data_json.dispatched_count ?? '-'}
                    </div>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-amber-200">
                    <div className="text-[10px] text-blue-700 font-bold uppercase">Terbaca (Gudang)</div>
                    <div className="text-base font-black text-blue-800 mt-0.5 font-mono">
                      {selectedRequest.meta_data_json.received_count ?? '-'}
                    </div>
                  </div>
                  <div className="bg-rose-50 p-2.5 rounded-xl border border-rose-200">
                    <div className="text-[10px] text-rose-700 font-bold uppercase">Kurang / Hilang</div>
                    <div className="text-base font-black text-rose-700 mt-0.5 font-mono">
                      {selectedRequest.meta_data_json.missing_in_transit_count ?? (selectedRequest.meta_data_json.missing_epcs?.length || 0)}
                    </div>
                  </div>
                  <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                    <div className="text-[10px] text-amber-700 font-bold uppercase">Tidak Dikenal</div>
                    <div className="text-base font-black text-amber-800 mt-0.5 font-mono">
                      {selectedRequest.meta_data_json.unexpected_epcs?.length || 0}
                    </div>
                  </div>
                </div>

                {/* Rincian Muatan Barang */}
                {selectedRequest.meta_data_json.items_breakdown && selectedRequest.meta_data_json.items_breakdown.length > 0 && (
                  <div className="bg-white p-3 rounded-xl border border-amber-200 space-y-2">
                    <span className="font-bold text-slate-800 block text-[11px]">
                      📦 Rincian Muatan Truk ({selectedRequest.meta_data_json.items_breakdown.length} Jenis Barang):
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {selectedRequest.meta_data_json.items_breakdown.map((item, idx) => (
                        <div key={idx} className="bg-slate-50 border border-slate-200 rounded-lg p-2 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold text-slate-800 block">{item.item_name}</span>
                            <span className="text-[10px] font-mono text-slate-400">Kode: {item.item_code}</span>
                          </div>
                          <span className="font-bold font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                            {item.delivered_qty} Unit
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Catatan / Berita Acara Staf Gudang */}
                {selectedRequest.meta_data_json.notes && (
                  <div className="bg-white p-3 rounded-xl border border-amber-200 space-y-1">
                    <span className="font-bold text-slate-800 block text-[11px]">
                      📝 Berita Acara Kronologi Fisik Lapangan:
                    </span>
                    <p className="text-slate-700 text-xs italic leading-relaxed">
                      "{selectedRequest.meta_data_json.notes}"
                    </p>
                  </div>
                )}

                {/* Tag EPC Hilang */}
                {selectedRequest.meta_data_json.missing_epcs?.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="font-bold text-rose-900 block text-[11px]">
                      Daftar Tag RFID Hilang di Jalan ({selectedRequest.meta_data_json.missing_epcs.length} EPC):
                    </span>
                    <div className="max-h-24 overflow-y-auto flex flex-wrap gap-1.5 p-1.5 bg-white rounded-xl border border-amber-200">
                      {selectedRequest.meta_data_json.missing_epcs.map((epc, idx) => (
                        <span key={idx} className="font-mono text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200 px-2 py-0.5 rounded">
                          {epc}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Bukti Foto & Dokumen */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  {selectedRequest.meta_data_json.proof_photo_url && (
                    <div className="bg-white p-2.5 rounded-xl border border-amber-200 space-y-1.5">
                      <span className="font-bold text-slate-700 block text-[11px] flex items-center gap-1">
                        <Camera className="w-3.5 h-3.5 text-amber-600" />
                        Bukti Fisik Bak Truk Kosong:
                      </span>
                      <a
                        href={selectedRequest.meta_data_json.proof_photo_url}
                        target="_blank"
                        rel="noreferrer"
                        className="block group overflow-hidden rounded-lg border border-slate-200 relative aspect-video bg-slate-100"
                      >
                        <img
                          src={selectedRequest.meta_data_json.proof_photo_url}
                          alt="Bukti Bak Truk"
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                        />
                        <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-[11px] font-bold gap-1">
                          <Eye className="w-4 h-4" /> Buka Foto
                        </div>
                      </a>
                    </div>
                  )}

                  {selectedRequest.meta_data_json.document_url && (
                    <div className="bg-white p-2.5 rounded-xl border border-amber-200 space-y-1.5">
                      <span className="font-bold text-slate-700 block text-[11px] flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5 text-blue-600" />
                        Surat Jalan / BAST Berparaf:
                      </span>
                      <a
                        href={selectedRequest.meta_data_json.document_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:bg-slate-50 transition text-xs font-semibold text-blue-700"
                      >
                        <span className="truncate">Lihat Dokumen BAST Sopir</span>
                        <ExternalLink className="w-4 h-4 text-slate-400 shrink-0" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Timeline Steps */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Alur Rantai Persetujuan (Workflow Timeline)</h3>
              <div className="space-y-2">
                {selectedRequest.steps_snapshot_json?.map((st, idx) => {
                  const isCurrent = selectedRequest.current_step_order === st.step_order && selectedRequest.status === 'pending';
                  const isDone = selectedRequest.current_step_order > st.step_order || selectedRequest.status === 'approved';

                  return (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                        isDone
                          ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
                          : isCurrent
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-950'
                          : 'bg-slate-50 border-slate-200 text-slate-500'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                            isDone
                              ? 'bg-emerald-600 text-white'
                              : isCurrent
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {isDone ? '✓' : st.step_order}
                        </div>
                        <div>
                          <p className="font-bold text-slate-800">{st.step_name}</p>
                          <p className="text-[11px] text-slate-500">SLA: {st.sla_hours} Jam</p>
                        </div>
                      </div>

                      <div>
                        {isDone ? (
                          <span className="font-semibold text-emerald-700">Selesai</span>
                        ) : isCurrent ? (
                          <span className="font-semibold text-indigo-700 animate-pulse">Menunggu Tindakan</span>
                        ) : (
                          <span className="text-slate-400">Antrian</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Histories */}
            {selectedRequest.histories && selectedRequest.histories.length > 0 && (
              <div className="space-y-3 border-t border-slate-100 pt-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Log Riwayat Aksi</h3>
                <div className="space-y-2">
                  {selectedRequest.histories.map((h) => (
                    <div key={h.id} className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800">{h.action_by_user?.name || 'User'}</span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {new Date(h.action_at).toLocaleString('id-ID')}
                        </span>
                      </div>
                      <p className="text-slate-600">
                        Aksi: <strong className="uppercase">{h.action}</strong>
                      </p>
                      {h.comments && <p className="text-slate-500 italic bg-white p-2 rounded border border-slate-100">"{h.comments}"</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
              <button
                onClick={() => setSelectedRequest(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition cursor-pointer"
              >
                Tutup
              </button>

              {canActOnRequest(selectedRequest) && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleOpenAction(selectedRequest, 'approved')}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Setujui
                  </button>
                  <button
                    onClick={() => handleOpenAction(selectedRequest, 'revision_requested')}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Minta Revisi
                  </button>
                  <button
                    onClick={() => handleOpenAction(selectedRequest, 'rejected')}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Tolak
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        </Portal>
      )}

      {/* Action Modal (Approve / Reject / Revision) */}
      {actionModalOpen && selectedRequestForAction && (
        <Portal>
          <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-5 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-150 my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-indigo-700 font-bold text-base">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
                <span>Persetujuan & Keputusan Approval</span>
              </div>
              <button
                onClick={() => {
                  setActionModalOpen(false);
                  setSelectedRequestForAction(null);
                }}
                className="p-1 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Target Request Info Card */}
            <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-1.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="font-mono font-bold text-slate-800 text-sm">{selectedRequestForAction.request_number}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Langkah {selectedRequestForAction.current_step_order || 1}/{selectedRequestForAction.total_steps || 1}
                </span>
              </div>
              <div className="font-semibold text-slate-800">{selectedRequestForAction.title}</div>
              <div className="text-[11px] text-slate-500 flex flex-wrap justify-between items-center pt-1 border-t border-slate-200 gap-2">
                <span>Modul: <strong className="font-mono">{selectedRequestForAction.module}</strong></span>
                <span>Pemohon: <strong>{selectedRequestForAction.requester_user?.name || '-'}</strong></span>
                {selectedRequestForAction.reference_code && (
                  <span className="font-mono text-slate-600">Ref: {selectedRequestForAction.reference_code}</span>
                )}
              </div>
            </div>

            {/* Action Type Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">Keputusan Approval *</label>
              <div className="grid grid-cols-3 gap-2 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setActionType('approved')}
                  className={`py-2.5 px-3 rounded-xl border flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    actionType === 'approved'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Setujui</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActionType('revision_requested')}
                  className={`py-2.5 px-3 rounded-xl border flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    actionType === 'revision_requested'
                      ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  <span>Revisi</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActionType('rejected')}
                  className={`py-2.5 px-3 rounded-xl border flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    actionType === 'rejected'
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
                <span>Catatan / Justifikasi {actionType !== 'approved' && <span className="text-rose-500">*</span>}</span>
                <span className="text-[10px] text-slate-400 font-normal">Tercatat di Audit Trail</span>
              </label>
              <textarea
                rows={3}
                required={actionType !== 'approved'}
                value={actionComment}
                onChange={(e) => setActionComment(e.target.value)}
                placeholder={
                  actionType === 'approved'
                    ? 'Contoh: Dokumen disetujui sesuai kuota dan prosedur operasional.'
                    : actionType === 'revision_requested'
                    ? 'Wajib sebutkan rincian bagian yang harus diperbaiki atau direvisi pemohon...'
                    : 'Wajib sebutkan alasan penolakan dokumen...'
                }
                className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setActionModalOpen(false);
                  setSelectedRequestForAction(null);
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={processingAction}
                onClick={submitAction}
                className={`px-5 py-2 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer ${
                  actionType === 'approved'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : actionType === 'revision_requested'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                } ${processingAction ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {processingAction ? (
                  <span>Memproses...</span>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>
                      Konfirmasi{' '}
                      {actionType === 'approved'
                        ? 'Persetujuan'
                        : actionType === 'revision_requested'
                        ? 'Permintaan Revisi'
                        : 'Penolakan'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}
    </div>
  );
}
