import React, { useState, useEffect } from 'react';
import { approvalApi, userApi, masterApi } from '../services/api';
import { showToast } from '../components/Toast';
import { showConfirm } from '../components/ConfirmDialog';
import Portal from '../components/Portal';
import {
  Shield,
  Layers,
  Plus,
  Trash2,
  Edit2,
  Clock,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  Building2,
  FolderKanban,
  FileCheck,
  Info,
  HelpCircle,
  X,
  RefreshCw,
  Sliders,
  DollarSign
} from 'lucide-react';

export default function ApprovalSettings({ currentUser = null }) {
  const [activeTab, setActiveTab] = useState('templates'); // 'templates' | 'configs' | 'rules'
  const [templates, setTemplates] = useState([]);
  const [configs, setConfigs] = useState([]);
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(false);

  // Template Form Modal
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [submittingTemplate, setSubmittingTemplate] = useState(false);
  const [templateForm, setTemplateForm] = useState({
    name: '',
    code: '',
    module: 'SPK',
    description: '',
    is_default: true,
    min_amount: '',
    max_amount: '',
    steps: [
      { step_name: 'Review & Persetujuan PM', approver_user_id: '', sla_hours: 24 },
    ],
  });

  // Config Form Modal
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [submittingConfig, setSubmittingConfig] = useState(false);
  const [configForm, setConfigForm] = useState({
    scope_type: 'project', // project | warehouse
    project_id: '',
    warehouse_id: '',
    module: 'WORK_ORDER',
    use_template: true,
    approval_template_id: '',
    description: '',
    is_active: true,
  });

  const loadData = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const [tplRes, cfgRes, usrRes, prjRes, whRes] = await Promise.all([
        approvalApi.getTemplates(),
        approvalApi.getConfigs(),
        userApi.getUsers(),
        masterApi.getProjects(),
        masterApi.getWarehouses(),
      ]);
      setTemplates(tplRes.data || []);
      setConfigs(cfgRes.data || []);
      setUsers(usrRes.data || []);
      setProjects(prjRes.data || []);
      setWarehouses(whRes.data || []);
    } catch (err) {
      console.error('Error loading approval settings:', err);
      showToast('Gagal memuat pengaturan approval', 'error');
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showTemplateModal) setShowTemplateModal(false);
        else if (showConfigModal) setShowConfigModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showTemplateModal, showConfigModal]);

  // Template Form Actions
  const handleOpenCreateTemplate = () => {
    setEditingTemplate(null);
    const defaultApprover = users.find((u) => u.role === 'pm')?.id || users[0]?.id || '';
    setTemplateForm({
      name: '',
      code: '',
      module: 'SPK',
      description: '',
      is_default: true,
      min_amount: '',
      max_amount: '',
      steps: [
        { step_name: 'Review Teknis PM', approver_user_id: defaultApprover, sla_hours: 24 },
      ],
    });
    setShowTemplateModal(true);
  };

  const handleOpenEditTemplate = (tpl) => {
    setEditingTemplate(tpl);
    setTemplateForm({
      name: tpl.name,
      code: tpl.code,
      module: tpl.module,
      description: tpl.description || '',
      is_default: !!tpl.is_default,
      min_amount: tpl.min_amount || '',
      max_amount: tpl.max_amount || '',
      steps: tpl.steps?.map((s) => ({
        step_name: s.step_name,
        approver_user_id: s.approver_user_id,
        sla_hours: s.sla_hours || 24,
      })) || [{ step_name: 'Approval Tier 1', approver_user_id: '', sla_hours: 24 }],
    });
    setShowTemplateModal(true);
  };

  const handleAddStep = () => {
    const defaultApprover = users.find((u) => u.role === 'superadmin')?.id || users[0]?.id || '';
    setTemplateForm({
      ...templateForm,
      steps: [
        ...templateForm.steps,
        {
          step_name: `Approval Tier ${templateForm.steps.length + 1}`,
          approver_user_id: defaultApprover,
          sla_hours: 24,
        },
      ],
    });
  };

  const handleRemoveStep = (index) => {
    if (templateForm.steps.length <= 1) {
      showToast('Minimal harus ada 1 step persetujuan!', 'error');
      return;
    }
    const updated = templateForm.steps.filter((_, idx) => idx !== index);
    setTemplateForm({ ...templateForm, steps: updated });
  };

  const handleStepChange = (index, field, value) => {
    const updated = [...templateForm.steps];
    updated[index][field] = value;
    setTemplateForm({ ...templateForm, steps: updated });
  };

  const handleSubmitTemplate = async (e) => {
    e.preventDefault();
    if (templateForm.steps.some((s) => !s.approver_user_id)) {
      showToast('Setiap tahapan harus ditentukan approver personalnya!', 'error');
      return;
    }

    setSubmittingTemplate(true);
    try {
      const payload = {
        ...templateForm,
        min_amount: templateForm.min_amount ? Number(templateForm.min_amount) : null,
        max_amount: templateForm.max_amount ? Number(templateForm.max_amount) : null,
      };

      if (editingTemplate) {
        const res = await approvalApi.updateTemplate(editingTemplate.id, payload);
        const updated = res.data || { ...editingTemplate, ...payload };
        setTemplates((prev) =>
          prev.map((t) => (t.id === editingTemplate.id ? { ...t, ...updated } : t))
        );
        showToast('Template approval berhasil diperbarui', 'success');
      } else {
        const res = await approvalApi.createTemplate(payload);
        if (res.data) {
          setTemplates((prev) => [res.data, ...prev.filter((t) => t.id !== res.data.id)]);
        }
        showToast('Template approval baru berhasil dibuat', 'success');
      }
      setShowTemplateModal(false);
      loadData(false);
    } catch (err) {
      showToast('Gagal menyimpan template: ' + (err.response?.data?.message || err.message), 'error');
    } finally {
      setSubmittingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (tpl) => {
    const confirmed = await showConfirm({
      title: 'Hapus Template Approval',
      message: `Hapus template approval "${tpl.name}"?`,
      confirmText: 'Hapus Template',
      type: 'danger',
    });
    if (!confirmed) return;
    try {
      await approvalApi.deleteTemplate(tpl.id);
      setTemplates((prev) => prev.filter((t) => t.id !== tpl.id));
      showToast('Template approval berhasil dihapus', 'success');
      loadData(false);
    } catch (err) {
      showToast('Gagal menghapus: ' + (err.response?.data?.message || err.message), 'error');
    }
  };

  // Config Form Actions
  const handleOpenCreateConfig = () => {
    setConfigForm({
      scope_type: 'project',
      project_id: projects[0]?.id || '',
      warehouse_id: warehouses[0]?.id || '',
      module: 'WORK_ORDER',
      use_template: true,
      approval_template_id: templates[0]?.id || '',
      description: '',
      is_active: true,
    });
    setShowConfigModal(true);
  };

  const handleSubmitConfig = async (e) => {
    e.preventDefault();
    setSubmittingConfig(true);
    try {
      const payload = {
        scope_type: configForm.scope_type,
        project_id: configForm.scope_type === 'project' ? configForm.project_id : null,
        warehouse_id: configForm.scope_type === 'warehouse' ? configForm.warehouse_id : null,
        module: configForm.module,
        use_template: configForm.use_template,
        approval_template_id: configForm.approval_template_id,
        description: configForm.description,
        is_active: configForm.is_active,
      };
      const res = await approvalApi.saveConfig(payload);
      showToast('Konfigurasi override approval berhasil disimpan', 'success');
      setShowConfigModal(false);
      if (res.data) {
        setConfigs((prev) => [res.data, ...prev.filter((c) => c.id !== res.data.id)]);
      }
      loadData(false);
    } catch (err) {
      showToast('Gagal menyimpan konfigurasi: ' + (err.response?.data?.message || err.message), 'error');
    } finally {
      setSubmittingConfig(false);
    }
  };

  const handleDeleteConfig = async (cfg) => {
    const confirmed = await showConfirm({
      title: 'Hapus Override Approval',
      message: 'Hapus konfigurasi override approval ini?',
      confirmText: 'Hapus Override',
      type: 'danger',
    });
    if (!confirmed) return;
    try {
      await approvalApi.deleteConfig(cfg.id);
      setConfigs((prev) => prev.filter((c) => c.id !== cfg.id));
      showToast('Konfigurasi berhasil dihapus', 'success');
      loadData(false);
    } catch (err) {
      showToast('Gagal menghapus: ' + (err.response?.data?.message || err.message), 'error');
    }
  };

  const getModuleBadge = (mod) => {
    switch (mod) {
      case 'SPK':
        return <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 rounded font-mono text-[10px] font-bold">SPK & Kontrak</span>;
      case 'WORK_ORDER':
        return <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 rounded font-mono text-[10px] font-bold">Work Order BOQ</span>;
      case 'DELIVERY':
        return <span className="px-2.5 py-0.5 bg-purple-100 text-purple-800 rounded font-mono text-[10px] font-bold">Penerimaan Truk</span>;
      case 'RETURN_SCRAP':
        return <span className="px-2.5 py-0.5 bg-rose-100 text-rose-800 rounded font-mono text-[10px] font-bold">Retur Sisa Proyek</span>;
      case 'GATE_ACCESS':
        return <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded font-mono text-[10px] font-bold">Izin Perlintasan RFID</span>;
      default:
        return <span className="px-2.5 py-0.5 bg-slate-100 text-slate-800 rounded font-mono text-[10px] font-bold">{mod}</span>;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl shadow-xs border border-slate-200/80">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-amber-50 text-amber-700 rounded-xl">
              <Sliders className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Master Setting Approval</h1>
              <p className="text-xs text-slate-500">
                Konfigurasi template bertingkat (*multi-tier sign off*), batas nilai otorisasi (threshold), SLA, dan override per gudang/proyek.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="p-2.5 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
            title="Refresh Data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {activeTab === 'templates' && (
            <button
              onClick={handleOpenCreateTemplate}
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs transition active:scale-95"
            >
              <Plus className="w-4 h-4" />
              Buat Template Alur Baru
            </button>
          )}
          {activeTab === 'configs' && (
            <button
              onClick={handleOpenCreateConfig}
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs transition active:scale-95"
            >
              <Plus className="w-4 h-4" />
              Tambah Override Scope
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-6 text-sm font-semibold text-slate-600">
        <button
          onClick={() => setActiveTab('templates')}
          className={`pb-3 flex items-center gap-2 transition ${
            activeTab === 'templates'
              ? 'border-b-2 border-amber-600 text-amber-700 font-bold'
              : 'hover:text-slate-900'
          }`}
        >
          <Layers className="w-4 h-4" />
          Template Alur Persetujuan ({templates.length})
        </button>
        <button
          onClick={() => setActiveTab('configs')}
          className={`pb-3 flex items-center gap-2 transition ${
            activeTab === 'configs'
              ? 'border-b-2 border-amber-600 text-amber-700 font-bold'
              : 'hover:text-slate-900'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Override Proyek & Gudang ({configs.length})
        </button>
        <button
          onClick={() => setActiveTab('rules')}
          className={`pb-3 flex items-center gap-2 transition ${
            activeTab === 'rules'
              ? 'border-b-2 border-amber-600 text-amber-700 font-bold'
              : 'hover:text-slate-900'
          }`}
        >
          <Shield className="w-4 h-4" />
          Kebijakan & Invarian Otorisasi SoD
        </button>
      </div>

      {/* TAB 1: TEMPLATES */}
      {activeTab === 'templates' && (
        <div className="space-y-4">
          {loading ? (
            <div className="p-12 text-center text-slate-400 text-xs bg-white rounded-2xl border">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
              Memuat template approval...
            </div>
          ) : templates.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs bg-white rounded-2xl border">
              Belum ada template approval yang dibuat. Klik tombol di atas untuk membuat template pertama.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {templates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          {getModuleBadge(tpl.module)}
                          {tpl.is_default && (
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[10px] font-bold font-mono">
                              DEFAULT
                            </span>
                          )}
                        </div>
                        <h3 className="font-bold text-slate-900 text-sm">{tpl.name}</h3>
                        <p className="text-[11px] font-mono text-slate-400 mt-0.5">Kode: {tpl.code}</p>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenEditTemplate(tpl)}
                          className="p-1.5 border rounded-lg hover:bg-amber-50 text-amber-600 transition"
                          title="Edit Template"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteTemplate(tpl)}
                          className="p-1.5 border rounded-lg hover:bg-rose-50 text-rose-600 transition"
                          title="Hapus Template"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {tpl.description && (
                      <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        {tpl.description}
                      </p>
                    )}

                    {/* Tier Thresholds */}
                    {(tpl.min_amount !== null || tpl.max_amount !== null) && (
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 bg-amber-50/60 p-2 rounded-xl border border-amber-100">
                        <DollarSign className="w-4 h-4 text-amber-600" />
                        <span>
                          Ambang Batas Nilai: {tpl.min_amount ? `Rp ${Number(tpl.min_amount).toLocaleString('id-ID')}` : 'Rp 0'}
                          {' s/d '}
                          {tpl.max_amount ? `Rp ${Number(tpl.max_amount).toLocaleString('id-ID')}` : 'Tanpa Batas Atas'}
                        </span>
                      </div>
                    )}

                    {/* Sequential Steps */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        Tahapan Otorisasi Berjenjang ({tpl.steps?.length || 0} Tier):
                      </div>
                      <div className="space-y-1.5">
                        {tpl.steps?.map((step, idx) => (
                          <div
                            key={step.id || idx}
                            className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl text-xs border border-slate-100"
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="w-5 h-5 rounded-full bg-slate-900 text-white font-mono text-[10px] font-bold flex items-center justify-center">
                                {step.step_order}
                              </span>
                              <div>
                                <div className="font-bold text-slate-800">{step.step_name}</div>
                                <div className="text-[11px] text-slate-500 flex items-center gap-1">
                                  <UserCheck className="w-3 h-3 text-emerald-600" />
                                  <span>{step.approver_user?.name || `User ID #${step.approver_user_id}`}</span>
                                  {step.approver_user?.role && (
                                    <span className="text-[10px] px-1 bg-slate-200 text-slate-700 rounded font-mono">
                                      {step.approver_user.role}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 text-slate-400 font-mono text-[11px]">
                              <Clock className="w-3.5 h-3.5" />
                              <span>SLA {step.sla_hours}j</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: CONFIGS OVERRIDE */}
      {activeTab === 'configs' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Override Alur Khusus Proyek & Gudang</h3>
                <p className="text-xs text-slate-500">
                  Tentukan apakah proyek atau gudang tertentu menggunakan alur approval khusus yang berbeda dari template default sistem.
                </p>
              </div>
            </div>

            {configs.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs border border-dashed rounded-xl">
                Belum ada override konfigurasi. Semua transaksi saat ini mengacu pada template default modul terkait.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b">
                    <tr>
                      <th className="p-3">Lingkup (Scope)</th>
                      <th className="p-3">Target Entitas</th>
                      <th className="p-3">Modul</th>
                      <th className="p-3">Template Terkait</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {configs.map((cfg) => (
                      <tr key={cfg.id} className="hover:bg-slate-50/70">
                        <td className="p-3 font-mono font-bold uppercase text-[11px] text-slate-800">
                          {cfg.scope_type}
                        </td>
                        <td className="p-3 font-bold text-slate-900">
                          {cfg.scope_type === 'project'
                            ? cfg.project?.name || `Proyek #${cfg.project_id}`
                            : cfg.warehouse?.name || `Gudang #${cfg.warehouse_id}`}
                        </td>
                        <td className="p-3">{getModuleBadge(cfg.module)}</td>
                        <td className="p-3 font-medium text-slate-700">
                          {cfg.template?.name || (cfg.use_template ? 'Template Terpilih' : 'Langkah Mandiri (Custom)')}
                        </td>
                        <td className="p-3">
                          {cfg.is_active ? (
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-semibold text-[10px]">Aktif</span>
                          ) : (
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded font-semibold text-[10px]">Nonaktif</span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleDeleteConfig(cfg)}
                            className="p-1 text-rose-600 hover:bg-rose-50 rounded"
                            title="Hapus Override"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: RULES & SOD GOVERNANCE */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-5">
            <div>
              <h2 className="text-base font-bold text-slate-900">Prinsip Segregation of Duties (SoD) & Invarian Anti-Theft</h2>
              <p className="text-xs text-slate-500">
                Aturan tata kelola persetujuan tanpa kompromi untuk mencegah penyusutan kabel dan manipulasi kuota material.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-xl border border-amber-200/80 bg-amber-50/40 space-y-2">
                <div className="flex items-center gap-2 text-amber-900 font-bold">
                  <Shield className="w-4 h-4 text-amber-600" />
                  <span>1. Storeroom Read-Only Kuota BOQ</span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Petugas gudang (Storeroom) <strong>dilarang keras</strong> mengubah kuota BOQ pada Work Order. Mereka hanya dapat menginput material yang disiapkan (<code>prepared_qty</code>). Penambahan atau penguncian kuota mutlak memerlukan approval PM.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-emerald-200/80 bg-emerald-50/40 space-y-2">
                <div className="flex items-center gap-2 text-emerald-900 font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>2. Rekonsiliasi 2-Handheld In-Transit</span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Penerimaan pengiriman tiang/kabel di gudang wajib membandingkan hasil scan Handheld 1 di yard principal dengan Handheld 2 di titik penerimaan gudang. Jika terdeteksi selisih (shrinkage), sistem otomatis menolak approval otomatis dan mewajibkan eskalasi investigasi ke PM.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-blue-200/80 bg-blue-50/40 space-y-2">
                <div className="flex items-center gap-2 text-blue-900 font-bold">
                  <Clock className="w-4 h-4 text-blue-600" />
                  <span>3. SLA Approval & Eskalasi Otomatis</span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Setiap tahapan memiliki batas waktu respon (SLA). Apabila approver tidak mengambil tindakan dalam jendela waktu SLA (default 24 jam), sistem akan memberi peringatan anomali pada dashboard PM.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-purple-200/80 bg-purple-50/40 space-y-2">
                <div className="flex items-center gap-2 text-purple-900 font-bold">
                  <Layers className="w-4 h-4 text-purple-600" />
                  <span>4. Ledger Digital Abadi (Immutable Trail)</span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Setiap aksi <em>Approve</em>, <em>Reject</em>, atau <em>Request Revision</em> dicatat permanen ke dalam tabel riwayat approval dengan ID personal approver dan catatan resmi. Tidak ada transaksi yang dapat dihapus dari jejak audit.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL FORM TEMPLATE */}
      {showTemplateModal && (
        <Portal>
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-[100] animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl border border-slate-100 space-y-5 my-8 max-h-[92vh] flex flex-col overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">
                    {editingTemplate ? 'Edit Template Approval' : 'Buat Template Alur Approval'}
                  </h3>
                  <p className="text-xs text-slate-500">Konfigurasi tahapan otorisasi multi-tier</p>
                </div>
              </div>
              <button
                onClick={() => setShowTemplateModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitTemplate} className="space-y-4 text-xs overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Nama Template *</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: SPK Standar Multi-Tier"
                    value={templateForm.name}
                    onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Kode Unik *</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: TPL-SPK-STANDARD"
                    value={templateForm.code}
                    onChange={(e) => setTemplateForm({ ...templateForm, code: e.target.value.toUpperCase() })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Modul Terkait *</label>
                  <select
                    value={templateForm.module}
                    onChange={(e) => setTemplateForm({ ...templateForm, module: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  >
                    <option value="SPK">SPK & Kontrak Pengadaan</option>
                    <option value="WORK_ORDER">Work Order & Kuota BOQ</option>
                    <option value="DELIVERY">Penerimaan Muatan Truk</option>
                    <option value="RETURN_SCRAP">Retur Material Sisa</option>
                    <option value="GATE_ACCESS">Izin Perlintasan RFID</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    id="is_default_tpl"
                    checked={templateForm.is_default}
                    onChange={(e) => setTemplateForm({ ...templateForm, is_default: e.target.checked })}
                    className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
                  />
                  <label htmlFor="is_default_tpl" className="text-xs font-semibold text-slate-700 cursor-pointer">
                    Jadikan template default modul ini
                  </label>
                </div>
              </div>

              {/* Threshold Range */}
              <div className="grid grid-cols-2 gap-3 p-3 bg-amber-50/50 rounded-xl border border-amber-100">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Batas Minimal (Rp)</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={templateForm.min_amount}
                    onChange={(e) => setTemplateForm({ ...templateForm, min_amount: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Batas Maksimal (Rp)</label>
                  <input
                    type="number"
                    placeholder="Kosongkan jika unlimited"
                    value={templateForm.max_amount}
                    onChange={(e) => setTemplateForm({ ...templateForm, max_amount: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Deskripsi Kebijakan</label>
                <textarea
                  rows={2}
                  placeholder="Keterangan alur dan tujuan otorisasi..."
                  value={templateForm.description}
                  onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              {/* Sequential Steps Builder */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 text-xs">Urutan Tahapan Otorisasi (Tiers)</span>
                  <button
                    type="button"
                    onClick={handleAddStep}
                    className="flex items-center gap-1 text-amber-700 hover:text-amber-800 font-bold text-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Tambah Tahap
                  </button>
                </div>

                <div className="space-y-2">
                  {templateForm.steps.map((step, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-700 font-mono text-[11px]">Tier #{idx + 1}</span>
                        {templateForm.steps.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveStep(idx)}
                            className="text-rose-500 hover:text-rose-700 p-1"
                            title="Hapus Step"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] text-slate-500 block mb-0.5">Nama Tahap</label>
                          <input
                            type="text"
                            required
                            placeholder="Review PM / Sign Off"
                            value={step.step_name}
                            onChange={(e) => handleStepChange(idx, 'step_name', e.target.value)}
                            className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-slate-500 block mb-0.5">Approver Personal *</label>
                          <select
                            required
                            value={step.approver_user_id}
                            onChange={(e) => handleStepChange(idx, 'approver_user_id', e.target.value)}
                            className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500"
                          >
                            <option value="">Pilih Approver...</option>
                            {users.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name} ({u.role.toUpperCase()})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <label className="text-[11px] text-slate-500">Target SLA Respon:</label>
                        <input
                          type="number"
                          min={1}
                          value={step.sla_hours}
                          onChange={(e) => handleStepChange(idx, 'sla_hours', Number(e.target.value))}
                          className="w-16 p-1 border border-slate-200 rounded text-xs bg-white text-center font-mono"
                        />
                        <span className="text-[11px] text-slate-500">Jam</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowTemplateModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingTemplate}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold shadow-xs transition disabled:opacity-50"
                >
                  {submittingTemplate ? 'Menyimpan...' : editingTemplate ? 'Simpan Perubahan Template' : 'Simpan Template Approval'}
                </button>
              </div>
            </form>
          </div>
        </div>
        </Portal>
      )}

      {/* MODAL FORM CONFIG OVERRIDE */}
      {showConfigModal && (
        <Portal>
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-[100] animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-100 space-y-5 my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-amber-600" />
                <h3 className="font-bold text-slate-800 text-sm">Tambah Override Scope</h3>
              </div>
              <button
                onClick={() => setShowConfigModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitConfig} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Tipe Lingkup *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setConfigForm({ ...configForm, scope_type: 'project' })}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition ${
                      configForm.scope_type === 'project'
                        ? 'bg-amber-50 text-amber-800 border-amber-300'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    Khusus Proyek
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfigForm({ ...configForm, scope_type: 'warehouse' })}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition ${
                      configForm.scope_type === 'warehouse'
                        ? 'bg-amber-50 text-amber-800 border-amber-300'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    Khusus Gudang
                  </button>
                </div>
              </div>

              {configForm.scope_type === 'project' ? (
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Pilih Proyek FO *</label>
                  <select
                    value={configForm.project_id}
                    onChange={(e) => setConfigForm({ ...configForm, project_id: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.code})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Pilih Gudang *</label>
                  <select
                    value={configForm.warehouse_id}
                    onChange={(e) => setConfigForm({ ...configForm, warehouse_id: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Modul Transaksi *</label>
                <select
                  value={configForm.module}
                  onChange={(e) => setConfigForm({ ...configForm, module: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="WORK_ORDER">Work Order BOQ</option>
                  <option value="SPK">SPK & PO Vendor</option>
                  <option value="DELIVERY">Penerimaan Truk</option>
                  <option value="RETURN_SCRAP">Retur Material Sisa</option>
                  <option value="GATE_ACCESS">Izin Perlintasan RFID</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Template Approval Yang Digunakan *</label>
                <select
                  value={configForm.approval_template_id}
                  onChange={(e) => setConfigForm({ ...configForm, approval_template_id: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  {templates
                    .filter((t) => t.module === configForm.module)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.code})
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingConfig}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold shadow-xs transition disabled:opacity-50"
                >
                  {submittingConfig ? 'Menyimpan...' : 'Simpan Override Approval'}
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
