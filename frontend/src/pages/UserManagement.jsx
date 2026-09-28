import React, { useState, useEffect } from 'react';
import { masterApi, userApi } from '../services/api';
import { showToast } from '../components/Toast';
import { showConfirm } from '../components/ConfirmDialog';
import Portal from '../components/Portal';
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Search,
  KeyRound,
  Phone,
  Mail,
  Edit2,
  Trash2,
  Power,
  RefreshCw,
  Lock,
  Unlock,
  Building2,
  Info,
  Check,
  X,
  Plus,
  Sliders,
  Palette,
  Sparkles
} from 'lucide-react';

export default function UserManagement({ currentUser = null }) {
  const [activeTab, setActiveTab] = useState('users'); // 'users' | 'roles'
  const [users, setUsers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [rbacData, setRbacData] = useState({ roles: [], modules: [] });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // User Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // User Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'storeroom',
    phone: '',
    is_active: true,
    warehouse_ids: [],
  });

  // Role Modal State
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [submittingRole, setSubmittingRole] = useState(false);
  const [roleForm, setRoleForm] = useState({
    name: '',
    code: '',
    badge: '',
    color: 'indigo',
    description: '',
    permissions: {},
  });

  const loadUsers = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const res = await userApi.getUsers({ role: roleFilter, search });
      setUsers(res.data || []);
    } catch (err) {
      console.error('Error fetching users:', err);
      showToast('Gagal memuat daftar pengguna', 'error');
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  const loadRbac = async () => {
    try {
      const res = await userApi.getRolesAndPermissions();
      setRbacData(res.data || { roles: [], modules: [] });
    } catch (err) {
      console.error('Error fetching RBAC matrix:', err);
    }
  };

  const loadWarehouses = async () => {
    try {
      const res = await masterApi.getWarehouses();
      setWarehouses(res.data || []);
    } catch (err) {
      showToast('Gagal memuat daftar warehouse: ' + (err.response?.data?.message || err.message), 'error');
    }
  };

  useEffect(() => {
    loadUsers();
    loadRbac();
    loadWarehouses();
  }, [roleFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadUsers();
  };

  // User Handlers
  const handleOpenCreate = () => {
    setEditingUser(null);
    const defaultRole = rbacData.roles[0]?.code || 'storeroom';
    setFormData({
      name: '',
      email: '',
      password: '',
      role: defaultRole,
      phone: '',
      is_active: true,
      warehouse_ids: [],
    });
    setShowModal(true);
  };

  const handleOpenEdit = (user) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
      phone: user.phone || '',
      is_active: !!user.is_active,
      warehouse_ids: user.assigned_warehouses?.map((warehouse) => warehouse.id) || [],
    });
    setShowModal(true);
  };

  const handleSubmitUser = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingUser) {
        const payload = { ...formData };
        if (!payload.password) delete payload.password;
        const res = await userApi.updateUser(editingUser.id, payload);
        const updated = res.data || { ...editingUser, ...payload };
        setUsers((prev) =>
          prev.map((u) => (u.id === editingUser.id ? { ...u, ...updated } : u))
        );
        showToast(`Data pengguna ${formData.name} berhasil diperbarui`, 'success');
      } else {
        if (!formData.password) {
          showToast('Password wajib diisi untuk pengguna baru', 'error');
          setSubmitting(false);
          return;
        }
        const res = await userApi.createUser(formData);
        if (res.data) {
          setUsers((prev) => [res.data, ...prev.filter((u) => u.id !== res.data.id)]);
        }
        showToast(`Pengguna baru ${formData.name} berhasil didaftarkan`, 'success');
      }
      setShowModal(false);
      loadUsers(false);
      loadRbac();
    } catch (err) {
      showToast('Gagal menyimpan: ' + (err.response?.data?.message || err.message), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (user) => {
    const actionName = user.is_active ? 'menonaktifkan' : 'mengaktifkan';
    const confirmed = await showConfirm({
      title: `${user.is_active ? 'Nonaktifkan' : 'Aktifkan'} Akun`,
      message: `Yakin ingin ${actionName} akun ${user.name}?`,
      confirmText: user.is_active ? 'Nonaktifkan' : 'Aktifkan',
      type: user.is_active ? 'warning' : 'info',
    });
    if (!confirmed) return;

    try {
      await userApi.toggleStatus(user.id);
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, is_active: !u.is_active } : u))
      );
      showToast(`Status ${user.name} berhasil diubah`, 'success');
      loadUsers(false);
    } catch (err) {
      showToast('Gagal mengubah status: ' + (err.response?.data?.message || err.message), 'error');
    }
  };

  const handleDeleteUser = async (user) => {
    if (user.id === currentUser?.id) {
      showToast('Anda tidak dapat menghapus akun Anda sendiri!', 'error');
      return;
    }
    const confirmed = await showConfirm({
      title: 'Hapus Permanen Pengguna',
      message: `PERINGATAN: Yakin ingin menghapus permanen akun ${user.name}? Tindakan ini tidak dapat dibatalkan.`,
      confirmText: 'Hapus Permanen',
      type: 'danger',
    });
    if (!confirmed) return;

    try {
      await userApi.deleteUser(user.id);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      showToast(`Pengguna ${user.name} berhasil dihapus`, 'success');
      loadUsers(false);
      loadRbac();
    } catch (err) {
      showToast('Gagal menghapus: ' + (err.response?.data?.message || err.message), 'error');
    }
  };

  // Role & Permission Handlers
  const handleOpenCreateRole = () => {
    setEditingRole(null);
    const initialPerms = {};
    rbacData.modules.forEach((m) => {
      initialPerms[m.key] = false;
    });
    setRoleForm({
      name: '',
      code: '',
      badge: '',
      color: 'indigo',
      description: '',
      permissions: initialPerms,
    });
    setShowRoleModal(true);
  };

  const handleOpenEditRole = (role) => {
    setEditingRole(role);
    setRoleForm({
      name: role.name,
      code: role.code,
      badge: role.badge || '',
      color: role.color || 'indigo',
      description: role.description || '',
      permissions: { ...role.permissions },
    });
    setShowRoleModal(true);
  };

  const handleSubmitRole = async (e) => {
    e.preventDefault();
    setSubmittingRole(true);
    try {
      if (editingRole) {
        await userApi.updateRole(editingRole.id, roleForm);
        showToast(`Role ${roleForm.name} berhasil diperbarui`, 'success');
      } else {
        await userApi.createRole(roleForm);
        showToast(`Role baru ${roleForm.name} berhasil ditambahkan`, 'success');
      }
      setShowRoleModal(false);
      loadRbac();
    } catch (err) {
      showToast('Gagal menyimpan role: ' + (err.response?.data?.message || err.message), 'error');
    } finally {
      setSubmittingRole(false);
    }
  };

  const handleDeleteRole = async (role) => {
    if (role.is_system) {
      showToast('Role bawaan sistem tidak dapat dihapus!', 'error');
      return;
    }
    if (role.user_count > 0) {
      showToast(`Role ini masih memiliki ${role.user_count} pengguna aktif. Harap ubah role pengguna terlebih dahulu.`, 'error');
      return;
    }
    const confirmed = await showConfirm({
      title: 'Hapus Role Custom',
      message: `Yakin ingin menghapus role custom "${role.name}"?`,
      confirmText: 'Hapus Role',
      type: 'danger',
    });
    if (!confirmed) return;

    try {
      await userApi.deleteRole(role.id);
      showToast(`Role ${role.name} berhasil dihapus`, 'success');
      loadRbac();
    } catch (err) {
      showToast('Gagal menghapus role: ' + (err.response?.data?.message || err.message), 'error');
    }
  };

  const handleToggleRolePermission = async (role, moduleKey) => {
    const currentVal = !!role.permissions?.[moduleKey];
    const nextVal = !currentVal;

    // Optimistic UI update
    setRbacData((prev) => ({
      ...prev,
      roles: prev.roles.map((r) => {
        if (r.id === role.id) {
          return {
            ...r,
            permissions: {
              ...r.permissions,
              [moduleKey]: nextVal,
            },
          };
        }
        return r;
      }),
    }));

    try {
      await userApi.toggleRolePermission(role.id, moduleKey, nextVal);
      showToast(`Akses ${moduleKey} untuk ${role.name} diubah jadi ${nextVal ? 'DIIZINKAN' : 'DIBATASI'}`, 'success');
    } catch (err) {
      showToast('Gagal mengubah hak akses: ' + (err.response?.data?.message || err.message), 'error');
      loadRbac(); // revert
    }
  };

  const getRoleBadge = (roleCode) => {
    const r = rbacData.roles.find((item) => item.code === roleCode);
    if (r) {
      return (
        <span className={`px-2.5 py-1 rounded-full font-mono text-[11px] font-bold border ${
          r.color === 'purple' ? 'bg-purple-100 text-purple-800 border-purple-200' :
          r.color === 'amber' ? 'bg-amber-100 text-amber-800 border-amber-200' :
          r.color === 'teal' ? 'bg-teal-100 text-teal-800 border-teal-200' :
          r.color === 'blue' ? 'bg-blue-100 text-blue-800 border-blue-200' :
          r.color === 'emerald' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
          r.color === 'rose' ? 'bg-rose-100 text-rose-800 border-rose-200' :
          'bg-indigo-100 text-indigo-800 border-indigo-200'
        }`}>
          {r.badge || r.name}
        </span>
      );
    }
    return <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full font-mono text-[11px] font-bold">{roleCode}</span>;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl shadow-xs border border-slate-200/80">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-indigo-50 text-indigo-700 rounded-xl">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Pengguna & Hak Akses</h1>
              <p className="text-xs text-slate-500">
                Kelola akun pengguna personal, buat peran baru (Custom Role), dan atur hak akses per modul operasional (*RBAC Matrix*).
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { loadUsers(); loadRbac(); }}
            className="p-2.5 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
            title="Refresh Data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {activeTab === 'users' && (
            <button
              onClick={handleOpenCreate}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition active:scale-95"
            >
              <UserPlus className="w-4 h-4" />
              Tambah Pengguna Baru
            </button>
          )}
          {activeTab === 'roles' && (
            <button
              onClick={handleOpenCreateRole}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition active:scale-95"
            >
              <Plus className="w-4 h-4" />
              Tambah Role Baru
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-6 text-sm font-semibold text-slate-600">
        <button
          onClick={() => setActiveTab('users')}
          className={`pb-3 flex items-center gap-2 transition ${
            activeTab === 'users'
              ? 'border-b-2 border-indigo-600 text-indigo-700 font-bold'
              : 'hover:text-slate-900'
          }`}
        >
          <Users className="w-4 h-4" />
          Daftar Pengguna ({users.length})
        </button>
        <button
          onClick={() => setActiveTab('roles')}
          className={`pb-3 flex items-center gap-2 transition ${
            activeTab === 'roles'
              ? 'border-b-2 border-indigo-600 text-indigo-700 font-bold'
              : 'hover:text-slate-900'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Matriks Hak Akses & Kustomisasi Role ({rbacData.roles.length})
        </button>
      </div>

      {/* TAB 1: USERS */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3 bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
            <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari berdasarkan nama, email, atau no handphone..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold"
              >
                Cari
              </button>
            </form>

            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500 font-medium whitespace-nowrap">Filter Role:</label>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="p-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="ALL">Semua Role</option>
                {rbacData.roles.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* User Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                Memuat daftar pengguna...
              </div>
            ) : users.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                Tidak ada pengguna yang sesuai dengan filter pencarian.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50/80 text-slate-500 font-semibold border-b border-slate-200/80">
                    <tr>
                      <th className="p-3.5 pl-5">Nama & Profil</th>
                      <th className="p-3.5">Kontak</th>
                      <th className="p-3.5">Peran / Role</th>
                      <th className="p-3.5">Status Akun</th>
                      <th className="p-3.5">Terdaftar Sejak</th>
                      <th className="p-3.5 pr-5 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {users.map((user) => (
                      <tr key={user.id} className="hover:bg-slate-50/70 transition">
                        <td className="p-3.5 pl-5">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-sm">
                              {user.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 text-xs flex items-center gap-2">
                                <span>{user.name}</span>
                                {user.id === currentUser?.id && (
                                  <span className="text-[10px] px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded font-mono">Anda</span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                {user.email}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-3.5">
                          <div className="flex items-center gap-1.5 text-slate-600">
                            <Phone className="w-3.5 h-3.5 text-slate-400" />
                            <span>{user.phone || '-'}</span>
                          </div>
                        </td>
                        <td className="p-3.5">
                          {getRoleBadge(user.role)}
                        </td>
                        <td className="p-3.5">
                          {user.is_active ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" />
                              Aktif
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                              <XCircle className="w-3 h-3" />
                              Suspended
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-slate-400 text-[11px]">
                          {user.created_at ? new Date(user.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}
                        </td>
                        <td className="p-3.5 pr-5 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => handleToggleStatus(user)}
                              className={`p-1.5 rounded-lg border transition ${
                                user.is_active
                                  ? 'hover:bg-amber-50 text-amber-600 border-slate-200 hover:border-amber-300'
                                  : 'hover:bg-emerald-50 text-emerald-600 border-slate-200 hover:border-emerald-300'
                              }`}
                              title={user.is_active ? 'Nonaktifkan Akun' : 'Aktifkan Akun'}
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleOpenEdit(user)}
                              className="p-1.5 rounded-lg border border-slate-200 hover:bg-indigo-50 text-indigo-600 hover:border-indigo-300 transition"
                              title="Edit Pengguna"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteUser(user)}
                              disabled={user.id === currentUser?.id}
                              className="p-1.5 rounded-lg border border-slate-200 hover:bg-rose-50 text-rose-600 hover:border-rose-300 transition disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Hapus Pengguna"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
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

      {/* TAB 2: ROLES & RBAC PERMISSION MATRIX */}
      {activeTab === 'roles' && (
        <div className="space-y-6">
          {/* Role Cards Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rbacData.roles.map((r) => (
              <div key={r.id} className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold">{r.badge}</span>
                      {r.is_system ? (
                        <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-mono font-bold">
                          SISTEM
                        </span>
                      ) : (
                        <span className="text-[9px] px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded font-mono font-bold flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5" /> KUSTOM
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                      {r.user_count} Pengguna
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-800 text-sm">{r.name}</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    {r.description || 'Tidak ada deskripsi.'}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <span className="text-[11px] text-slate-400 font-mono">Kode: {r.code}</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleOpenEditRole(r)}
                      className="p-1.5 border rounded-lg hover:bg-indigo-50 text-indigo-600 transition"
                      title="Edit Detail Role"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {!r.is_system && (
                      <button
                        onClick={() => handleDeleteRole(r)}
                        className="p-1.5 border rounded-lg hover:bg-rose-50 text-rose-600 transition"
                        title="Hapus Role Kustom"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Interactive Matrix Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-slate-800 text-sm">
                  Matriks Hak Akses & Modul Operasional (Klik Checkbox untuk Mengubah)
                </h2>
                <p className="text-xs text-slate-500">
                  Superadmin dapat langsung mengklik tombol status di tabel untuk mengizinkan atau mencabut hak akses suatu role secara real-time.
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Diizinkan
                </span>
                <span className="flex items-center gap-1 text-slate-400 font-medium">
                  <XCircle className="w-3.5 h-3.5 text-slate-300" /> Dibatasi
                </span>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-white font-semibold">
                  <tr>
                    <th className="p-3 pl-4">Modul / Fungsionalitas</th>
                    <th className="p-3">Kategori</th>
                    {rbacData.roles.map((r) => (
                      <th key={r.id} className="p-3 text-center">
                        <div className="font-bold whitespace-nowrap">{r.name}</div>
                        <span className="text-[10px] text-slate-400 font-mono uppercase">{r.code}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rbacData.modules.map((m) => (
                    <tr key={m.key} className="hover:bg-slate-50/80 transition">
                      <td className="p-3 pl-4 font-semibold text-slate-800">
                        {m.name}
                      </td>
                      <td className="p-3 text-slate-400 font-mono text-[11px]">
                        {m.group}
                      </td>
                      {rbacData.roles.map((r) => {
                        const hasAccess = !!r.permissions?.[m.key];
                        return (
                          <td key={r.id} className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleRolePermission(r, m.key)}
                              className={`inline-flex items-center justify-center w-7 h-7 rounded-lg transition active:scale-90 cursor-pointer ${
                                hasAccess
                                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                  : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                              }`}
                              title={`Klik untuk ubah akses ${m.name} untuk ${r.name}`}
                            >
                              {hasAccess ? (
                                <Check className="w-4 h-4 stroke-[3]" />
                              ) : (
                                <X className="w-3.5 h-3.5 stroke-[2]" />
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-indigo-50/60 p-3.5 rounded-xl border border-indigo-100 flex items-start gap-2.5 text-xs text-indigo-900">
              <Info className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong>Kustomisasi Tanpa Batas:</strong>
                <p className="text-[11px] text-indigo-800 mt-0.5">
                  Anda dapat membuat role baru (misal: <em>QC Inspector</em>, <em>Finance Approver</em>, atau <em>Site Coordinator</em>) dan mengatur kombinasi izin modular sesuai kebutuhan struktur organisasi proyek.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL FORM USER */}
      {showModal && (
        <Portal>
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-[100] animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl border border-slate-100 space-y-5 my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">
                    {editingUser ? 'Edit Data Pengguna' : 'Pendaftaran Pengguna Baru'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {editingUser ? 'Perbarui profil dan peran akses pengguna' : 'Buat akun personal baru untuk operasional sistem'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitUser} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Nama Lengkap *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Budi Santoso"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Email Personal *</label>
                <input
                  type="email"
                  required
                  placeholder="contoh: user@mosa.id"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Peran / Role *</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
                  >
                    {rbacData.roles.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.badge ? `${r.badge} (${r.name})` : r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Nomor Handphone / WhatsApp</label>
                  <input
                    type="text"
                    placeholder="08123456789"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {formData.role !== 'superadmin' && (
                <fieldset className="space-y-2 rounded-xl border border-slate-200 p-3">
                  <legend className="px-1 font-semibold text-slate-700">Akses Warehouse</legend>
                  <label className="flex cursor-pointer items-center gap-2 font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={warehouses.length > 0 && formData.warehouse_ids.length === warehouses.length}
                      onChange={(e) => setFormData({ ...formData, warehouse_ids: e.target.checked ? warehouses.map((warehouse) => warehouse.id) : [] })}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Semua Warehouse
                  </label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {warehouses.map((warehouse) => (
                      <label key={warehouse.id} className="flex cursor-pointer items-center gap-2 rounded-lg bg-slate-50 p-2 text-slate-700">
                        <input
                          type="checkbox"
                          checked={formData.warehouse_ids.includes(warehouse.id)}
                          onChange={(e) => setFormData({ ...formData, warehouse_ids: e.target.checked ? [...formData.warehouse_ids, warehouse.id] : formData.warehouse_ids.filter((id) => id !== warehouse.id) })}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        {warehouse.name}
                      </label>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-500">Kosong berarti tanpa akses warehouse. Superadmin selalu mengakses semua warehouse.</p>
                </fieldset>
              )}

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  {editingUser ? 'Password Baru (Kosongkan jika tidak ingin mengubah)' : 'Password Masuk *'}
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="password"
                    placeholder={editingUser ? '•••••••• (Tetap sama)' : 'Minimal 6 karakter'}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required={!editingUser}
                    minLength={6}
                    className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="is_active_checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                />
                <label htmlFor="is_active_checkbox" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  Akun berstatus aktif (dapat login ke sistem)
                </label>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-xs transition disabled:opacity-50"
                >
                  {submitting ? 'Menyimpan...' : editingUser ? 'Simpan Perubahan' : 'Daftarkan Pengguna'}
                </button>
              </div>
            </form>
          </div>
        </div>
        </Portal>
      )}

      {/* MODAL FORM ROLE BARU / EDIT ROLE */}
      {showRoleModal && (
        <Portal>
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-[100] animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl border border-slate-100 space-y-4 my-8 max-h-[92vh] flex flex-col overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">
                    {editingRole ? `Edit Role: ${editingRole.name}` : 'Tambah Role Akses Baru'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {editingRole ? 'Ubah deskripsi dan konfigurasi perizinan role' : 'Tentukan peran fungsional baru beserta hak akses modul'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowRoleModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitRole} className="space-y-4 text-xs overflow-y-auto pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Nama Role *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. QC Field Inspector"
                    value={roleForm.name}
                    onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Kode Slug Unik *</label>
                  <input
                    type="text"
                    required
                    disabled={!!editingRole}
                    placeholder="e.g. qc_inspector"
                    value={roleForm.code}
                    onChange={(e) => setRoleForm({ ...roleForm, code: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-mono disabled:bg-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Label Badge</label>
                  <input
                    type="text"
                    placeholder="e.g. 🔍 QC INSPECTOR"
                    value={roleForm.badge}
                    onChange={(e) => setRoleForm({ ...roleForm, badge: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Warna Tema Badge</label>
                  <select
                    value={roleForm.color}
                    onChange={(e) => setRoleForm({ ...roleForm, color: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="indigo">Indigo (Standar)</option>
                    <option value="purple">Ungu (Purple)</option>
                    <option value="amber">Amber / Kuning Emas</option>
                    <option value="teal">Teal (Hijau Kebiruan)</option>
                    <option value="blue">Biru (Blue)</option>
                    <option value="emerald">Emerald (Hijau)</option>
                    <option value="rose">Rose (Merah Muda)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Deskripsi Tugas / Fungsi Peran</label>
                <textarea
                  rows={2}
                  placeholder="Keterangan tanggung jawab operasional peran ini..."
                  value={roleForm.description}
                  onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Permissions Checklist in Modal */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="font-bold text-slate-800 block text-xs">
                  Hak Akses Modul Operasional:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200">
                  {rbacData.modules.map((mod) => (
                    <label
                      key={mod.key}
                      className="flex items-center gap-2 p-1.5 bg-white rounded-lg border border-slate-200/60 cursor-pointer hover:border-indigo-300 transition"
                    >
                      <input
                        type="checkbox"
                        checked={!!roleForm.permissions[mod.key]}
                        onChange={(e) => setRoleForm({
                          ...roleForm,
                          permissions: {
                            ...roleForm.permissions,
                            [mod.key]: e.target.checked,
                          },
                        })}
                        className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                      />
                      <span className="text-[11px] font-medium text-slate-700 leading-tight">
                        {mod.name}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowRoleModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingRole}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-xs transition disabled:opacity-50"
                >
                  {submittingRole ? 'Menyimpan...' : editingRole ? 'Simpan Perubahan' : 'Buat Role'}
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
