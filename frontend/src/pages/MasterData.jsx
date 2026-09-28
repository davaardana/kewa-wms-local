import React, { useState, useEffect } from 'react';
import { masterApi, userApi } from '../services/api';
import { showToast } from '../components/Toast';
import Portal from '../components/Portal';
import { 
  Building2, 
  FolderKanban, 
  Warehouse as WhIcon, 
  Package, 
  Plus, 
  Check, 
  Search, 
  Radio, 
  ExternalLink,
  Tag,
  ShieldCheck,
  Truck,
  X,
  Users,
  UserCheck,
  Edit2,
  Phone,
  Layers,
  MapPin,
  Cpu
} from 'lucide-react';

export default function MasterData({ defaultTab = 'items', onNavigate = null, currentUser = null }) {
  const [activeTab, setActiveTab] = useState(defaultTab || 'items'); // items, warehouses, projects, principals, vehicles
  const [items, setItems] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [projects, setProjects] = useState([]);
  const [principals, setPrincipals] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');



  // Form states
  const [showItemModal, setShowItemModal] = useState(false);
  const [newItem, setNewItem] = useState({
    code: '',
    name: '',
    category: 'pole',
    is_metal: true,
    is_reusable: false,
    is_serialized_tag: true,
    unit: 'batang',
    min_stock: 10,
    description: '',
    epc_prefix: '',
    epc_suffix_digits: 14,
  });

  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [newVehicle, setNewVehicle] = useState({
    plate_number: '',
    vehicle_type: 'truck_medium',
    driver_name: '',
    driver_phone: '',
    transporter_name: '',
    max_pole_capacity: 50,
    notes: '',
  });

  // Project Modal state
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [newProject, setNewProject] = useState({
    principal_id: '',
    code: '',
    name: '',
    client_name: '',
    location: '',
    status: 'active',
  });

  // Principal Modal state
  const [showPrincipalModal, setShowPrincipalModal] = useState(false);
  const [newPrincipal, setNewPrincipal] = useState({
    name: '',
    code: '',
    contact_person: '',
    phone: '',
    email: '',
    address: '',
  });

  // Warehouse Modal state
  const [showWarehouseModal, setShowWarehouseModal] = useState(false);
  const [newWarehouse, setNewWarehouse] = useState({
    project_id: '',
    project_ids: [],
    code: '',
    name: '',
    gate_mode: 'SINGLE_ANTENNA_SESSION',
    address: '',
    pic_user_id: '',
    phone: '',
    capacity: 1000,
    staff_user_ids: [],
  });

  // Edit Warehouse Modal state
  const [showEditWarehouseModal, setShowEditWarehouseModal] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState(null);

  const loadData = async (targetTab = activeTab, showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      if (targetTab === 'items') {
        const itRes = await masterApi.getItems();
        setItems(itRes.data || []);
      } else if (targetTab === 'vehicles') {
        const vehRes = await masterApi.getVehicles();
        setVehicles(vehRes.data || []);
      } else if (targetTab === 'principals') {
        const prinRes = await masterApi.getPrincipals();
        setPrincipals(prinRes.data || []);
      } else if (targetTab === 'projects') {
        const prRes = await masterApi.getProjects();
        setProjects(prRes.data || []);
      } else if (targetTab === 'warehouses') {
        const whRes = await masterApi.getWarehouses();
        setWarehouses(whRes.data || []);
      } else {
        const itRes = await masterApi.getItems();
        setItems(itRes.data || []);
      }
    } catch (err) {
      console.error('Error loading master data:', err);
      showToast('Gagal memuat master data', 'error');
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    const tab = defaultTab || 'items';
    setActiveTab(tab);
    loadData(tab);
  }, [defaultTab]);

  const handleCreateItem = async (e) => {
    e.preventDefault();
    try {
      const res = await masterApi.createItem(newItem);
      setShowItemModal(false);
      setNewItem({
        code: '',
        name: '',
        category: 'pole',
        is_metal: true,
        is_reusable: false,
        is_serialized_tag: true,
        unit: 'batang',
        min_stock: 10,
        description: '',
        epc_prefix: '',
        epc_suffix_digits: 14,
      });
      if (res.data) {
        setItems((prev) => [res.data, ...prev.filter((it) => it.id !== res.data.id)]);
      }
      loadData('items', false);
      showToast('Material baru berhasil ditambahkan ke katalog!', 'success');
    } catch (err) {
      showToast('Gagal menambah item: ' + (err.response?.data?.message || err.message), 'error');
    }
  };

  const handleCreateVehicle = async (e) => {
    e.preventDefault();
    try {
      const res = await masterApi.createVehicle(newVehicle);
      setShowVehicleModal(false);
      setNewVehicle({
        plate_number: '',
        vehicle_type: 'truck_medium',
        driver_name: '',
        driver_phone: '',
        transporter_name: '',
        max_pole_capacity: 50,
        notes: '',
      });
      if (res.data) {
        setVehicles((prev) => [res.data, ...prev.filter((v) => v.id !== res.data.id)]);
      }
      loadData('vehicles', false);
      showToast('Armada truk baru berhasil didaftarkan!', 'success');
    } catch (err) {
      showToast('Gagal menambah kendaraan: ' + (err.response?.data?.message || err.message), 'error');
    }
  };

  const handleCreateProject = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...newProject,
        principal_id: newProject.principal_id ? parseInt(newProject.principal_id, 10) : null,
      };
      const res = await masterApi.createProject(payload);
      setShowProjectModal(false);
      setNewProject({
        principal_id: '',
        code: '',
        name: '',
        client_name: '',
        location: '',
        status: 'active',
      });
      if (res.data) {
        const fullProj = {
          ...res.data,
          principal: principals.find((p) => p.id === res.data.principal_id) || res.data.principal,
        };
        setProjects((prev) => [fullProj, ...prev.filter((p) => p.id !== res.data.id)]);
      }
      loadData('projects', false);
      showToast('Proyek Rollout baru berhasil dibuat!', 'success');
    } catch (err) {
      showToast('Gagal membuat proyek: ' + (err.response?.data?.message || err.message), 'error');
    }
  };

  const handleCreatePrincipal = async (e) => {
    e.preventDefault();
    try {
      const res = await masterApi.createPrincipal(newPrincipal);
      setShowPrincipalModal(false);
      setNewPrincipal({
        name: '',
        code: '',
        contact_person: '',
        phone: '',
        email: '',
        address: '',
      });
      if (res.data) {
        setPrincipals((prev) => [res.data, ...prev.filter((p) => p.id !== res.data.id)]);
      }
      loadData('principals', false);
      showToast('Principal Vendor baru berhasil didaftarkan!', 'success');
    } catch (err) {
      showToast('Gagal menambah principal: ' + (err.response?.data?.message || err.message), 'error');
    }
  };

  const handleCreateWarehouse = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...newWarehouse,
        project_id: newWarehouse.project_id ? parseInt(newWarehouse.project_id, 10) : null,
        project_ids: newWarehouse.project_ids || [],
        pic_user_id: newWarehouse.pic_user_id ? parseInt(newWarehouse.pic_user_id, 10) : null,
        capacity: newWarehouse.capacity ? parseInt(newWarehouse.capacity, 10) : null,
      };
      const res = await masterApi.createWarehouse(payload);
      setShowWarehouseModal(false);
      setNewWarehouse({
        project_id: '',
        project_ids: [],
        code: '',
        name: '',
        gate_mode: 'SINGLE_ANTENNA_SESSION',
        address: '',
        pic_user_id: '',
        phone: '',
        capacity: 1000,
        staff_user_ids: [],
      });
      if (res.data) {
        const fullWh = {
          ...res.data,
          pic: users.find((u) => u.id === res.data.pic_user_id) || res.data.pic,
          projects: projects.filter((p) => (payload.project_ids || []).includes(p.id)),
        };
        setWarehouses((prev) => [fullWh, ...prev.filter((w) => w.id !== res.data.id)]);
      }
      loadData('warehouses', false);
      showToast('Gudang Transit baru berhasil dibuat beserta alokasi proyek & staf!', 'success');
    } catch (err) {
      showToast('Gagal membuat gudang: ' + (err.response?.data?.message || err.message), 'error');
    }
  };

  const openProjectModal = () => {
    setShowProjectModal(true);
    if (principals.length === 0) {
      masterApi.getPrincipals().then((res) => setPrincipals(res.data || [])).catch(() => {});
    }
  };

  const openWarehouseModal = () => {
    setShowWarehouseModal(true);
    if (projects.length === 0) {
      masterApi.getProjects().then((res) => setProjects(res.data || [])).catch(() => {});
    }
    if (users.length === 0) {
      userApi.getUsers().then((res) => setUsers(res.data || [])).catch(() => {});
    }
  };

  const openEditWarehouse = (wh) => {
    if (projects.length === 0) {
      masterApi.getProjects().then((res) => setProjects(res.data || [])).catch(() => {});
    }
    if (users.length === 0) {
      userApi.getUsers().then((res) => setUsers(res.data || [])).catch(() => {});
    }
    const existingProjectIds = wh.projects?.map((p) => p.id) || (wh.project_id ? [wh.project_id] : []);
    setEditingWarehouse({
      id: wh.id,
      project_id: wh.project_id || '',
      project_ids: existingProjectIds,
      code: wh.code,
      name: wh.name,
      gate_mode: wh.gate_mode || 'SINGLE_ANTENNA_SESSION',
      address: wh.address || '',
      pic_user_id: wh.pic_user_id || '',
      phone: wh.phone || '',
      capacity: wh.capacity || 1000,
      is_active: wh.is_active ?? true,
      staff_user_ids: wh.staff?.map((s) => s.id) || [],
    });
    setShowEditWarehouseModal(true);
  };

  const handleUpdateWarehouse = async (e) => {
    e.preventDefault();
    if (!editingWarehouse) return;
    try {
      const payload = {
        ...editingWarehouse,
        project_id: editingWarehouse.project_id ? parseInt(editingWarehouse.project_id, 10) : null,
        project_ids: editingWarehouse.project_ids || [],
        pic_user_id: editingWarehouse.pic_user_id ? parseInt(editingWarehouse.pic_user_id, 10) : null,
        capacity: editingWarehouse.capacity ? parseInt(editingWarehouse.capacity, 10) : null,
      };
      const res = await masterApi.updateWarehouse(editingWarehouse.id, payload);
      setShowEditWarehouseModal(false);
      const updatedWh = res.data || { ...payload, id: editingWarehouse.id };
      const fullWh = {
        ...updatedWh,
        pic: users.find((u) => u.id === updatedWh.pic_user_id) || updatedWh.pic,
        projects: projects.filter((p) => (payload.project_ids || []).includes(p.id)),
      };
      setWarehouses((prev) => prev.map((w) => (w.id === editingWarehouse.id ? { ...w, ...fullWh } : w)));
      setEditingWarehouse(null);
      loadData('warehouses', false);
      showToast('Data gudang, alokasi proyek & staf berhasil diperbarui!', 'success');
    } catch (err) {
      showToast('Gagal memperbarui gudang: ' + (err.response?.data?.message || err.message), 'error');
    }
  };

  const filteredItems = items.filter(
    (it) => it.name.toLowerCase().includes(searchTerm.toLowerCase()) || it.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredWarehouses = warehouses.filter(
    (wh) => wh.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            wh.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (wh.pic?.name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredProjects = projects.filter(
    (pr) => pr.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            pr.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (pr.principal?.name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredPrincipals = principals.filter(
    (p) => p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (p.contact_person || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredVehicles = vehicles.filter(
    (v) => (v.plate_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (v.driver_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (v.transporter_name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            {activeTab === 'principals' && 'Principal & Klien Telco'}
            {activeTab === 'projects' && 'Proyek Rollout FO'}
            {activeTab === 'warehouses' && 'Gudang Transit & Staf Yard'}
            {activeTab === 'items' && 'Katalog Material FO'}
            {activeTab === 'vehicles' && 'Armada Truk Ekspedisi'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {activeTab === 'projects' && 'Kelola proyek fiber optic rollout, alokasi wilayah, dan keterhubungan dengan SPK & WO.'}
            {activeTab === 'principals' && 'Kelola daftar klien telekomunikasi (MyRepublic, Biznet) dan kontak PIC vendor.'}
            {activeTab === 'warehouses' && 'Kelola gudang transit mobile, penugasan PIC & Staf Storeroom, serta mode sensor gate.'}
            {activeTab === 'items' && 'Kelola katalog material tiang, kabel, aksesoris, dan spesifikasi tag RFID anti-metal.'}
            {activeTab === 'vehicles' && 'Kelola armada truk pengangkut tiang, kapasitas muatan, dan data kontak driver.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'items' && (!currentUser || ['superadmin', 'pm', 'procurement'].includes(currentUser.role)) && (
            <button
              onClick={() => setShowItemModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Material Baru</span>
            </button>
          )}
          {activeTab === 'warehouses' && (
            <>
              {onNavigate && (
                <button
                  onClick={() => onNavigate('device-pairing')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
                >
                  <Cpu className="w-3.5 h-3.5" />
                  <span>Pairing Reader RFID</span>
                </button>
              )}
              {(!currentUser || ['superadmin', 'pm'].includes(currentUser.role)) && (
                <button
                  onClick={openWarehouseModal}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Gudang Baru</span>
                </button>
              )}
            </>
          )}
          {activeTab === 'projects' && (!currentUser || ['superadmin', 'pm'].includes(currentUser.role)) && (
            <button
              onClick={openProjectModal}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Proyek Baru</span>
            </button>
          )}
          {activeTab === 'principals' && (!currentUser || ['superadmin', 'pm', 'procurement'].includes(currentUser.role)) && (
            <button
              onClick={() => setShowPrincipalModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Principal</span>
            </button>
          )}
          {activeTab === 'vehicles' && (!currentUser || ['superadmin', 'pm', 'procurement'].includes(currentUser.role)) && (
            <button
              onClick={() => setShowVehicleModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Armada Truk</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200/90 shadow-xs flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 text-slate-700 text-xs font-medium border border-slate-200 font-mono">
            {activeTab === 'projects' && <FolderKanban className="w-3.5 h-3.5 text-emerald-600" />}
            {activeTab === 'principals' && <Building2 className="w-3.5 h-3.5 text-emerald-600" />}
            {activeTab === 'warehouses' && <WhIcon className="w-3.5 h-3.5 text-emerald-600" />}
            {activeTab === 'items' && <Package className="w-3.5 h-3.5 text-emerald-600" />}
            {activeTab === 'vehicles' && <Truck className="w-3.5 h-3.5 text-emerald-600" />}
            <span>
              Total: {
                activeTab === 'projects' ? `${projects.length} Proyek` :
                activeTab === 'principals' ? `${principals.length} Principal` :
                activeTab === 'warehouses' ? `${warehouses.length} Gudang Transit` :
                activeTab === 'items' ? `${items.length} Jenis Material` :
                `${vehicles.length} Armada Truk`
              }
            </span>
          </span>
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder={
              activeTab === 'projects' ? 'Cari nama, kode proyek, klien...' :
              activeTab === 'principals' ? 'Cari nama principal, kontak, kode...' :
              activeTab === 'warehouses' ? 'Cari nama gudang, kode, PIC...' :
              activeTab === 'items' ? 'Cari nama barang, kode item...' :
              'Cari plat nomor, driver, ekspedisi...'
            }
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50/70 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400 font-medium placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Tab 1: Material Items Table */}
      {activeTab === 'items' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-3.5">Kode Material</th>
                  <th className="py-3 px-3.5">Nama Barang</th>
                  <th className="py-3 px-3.5">Kategori</th>
                  <th className="py-3 px-3.5">Satuan / Format EPC</th>
                  <th className="py-3 px-3.5">Rekomendasi Tag RFID</th>
                  <th className="py-3 px-3.5">Sifat Barang</th>
                  <th className="py-3 px-3.5 text-right">Tag Terpasang</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      Tidak ada material yang sesuai dengan pencarian.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((it) => (
                    <tr key={it.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-2.5 px-3.5 font-mono font-bold text-slate-900">{it.code}</td>
                      <td className="py-2.5 px-3.5 font-semibold text-slate-800">{it.name}</td>
                      <td className="py-2.5 px-3.5">
                        <span className="capitalize px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[11px]">
                          {it.category}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 text-slate-600 font-medium">
                        <div>{it.unit}</div>
                        <div className="font-mono text-[10px] text-slate-400">{it.epc_prefix ? `${it.epc_prefix}${'0'.repeat(Math.min(it.epc_suffix_digits, 8))}${it.epc_suffix_digits > 8 ? '…' : ''}` : 'Belum dikonfigurasi'}</div>
                      </td>
                      <td className="py-2.5 px-3.5">
                        {it.is_metal ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-bold text-[10px]">
                            WZ-Y258 (ABS Anti-Metal 13M)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200 font-bold text-[10px]">
                            EL-UHF9424-U9-W (PET Inlay 15M)
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3.5">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          it.is_metal ? 'bg-slate-200 text-slate-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {it.is_metal ? 'Logam / Konduktif' : 'Non-Logam'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono font-bold text-emerald-700">
                        {it.rfid_tags_count ?? 0} Tag
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Warehouses Table */}
      {activeTab === 'warehouses' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-3.5">Kode & Nama Gudang</th>
                  <th className="py-3 px-3.5">Proyek & Lokasi</th>
                  <th className="py-3 px-3.5">PIC Gudang & Kontak</th>
                  <th className="py-3 px-3.5">Staf Storeroom Ditugaskan</th>
                  <th className="py-3 px-3.5">Mode Perlintasan</th>
                  <th className="py-3 px-3.5 text-center">Kapasitas</th>
                  <th className="py-3 px-3.5 text-center">Status</th>
                  <th className="py-3 px-3.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredWarehouses.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      Tidak ada data gudang yang sesuai.
                    </td>
                  </tr>
                ) : (
                  filteredWarehouses.map((wh) => (
                    <tr key={wh.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-2.5 px-3.5">
                        <div className="font-bold text-slate-900">{wh.name}</div>
                        <span className="font-mono text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                          {wh.code}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5">
                        {wh.projects && wh.projects.length > 0 ? (
                          <div className="space-y-1">
                            <div className="flex flex-wrap gap-1">
                              {wh.projects.map((p) => (
                                <span
                                  key={p.id}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-semibold"
                                >
                                  <FolderKanban className="w-2.5 h-2.5" />
                                  {p.name}
                                </span>
                              ))}
                            </div>
                            {wh.projects.length > 1 && (
                              <span className="inline-block px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[9px] font-mono font-bold">
                                ⚡ SHARED HUB ({wh.projects.length} Proyek)
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="font-semibold text-slate-800">{wh.project?.name || '-'}</div>
                        )}
                        <div className="text-[10px] text-slate-400 truncate max-w-xs">{wh.address || '-'}</div>
                      </td>
                      <td className="py-2.5 px-3.5">
                        {wh.pic ? (
                          <div className="flex items-center gap-1.5">
                            <UserCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <div>
                              <div className="font-bold text-slate-800">{wh.pic.name}</div>
                              {wh.phone && <div className="text-[10px] text-slate-400 font-mono">{wh.phone}</div>}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">- Belum ada PIC -</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3.5">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {wh.staff && wh.staff.length > 0 ? (
                            wh.staff.map((st) => (
                              <span
                                key={st.id}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200"
                              >
                                <Users className="w-2.5 h-2.5 text-slate-500" />
                                {st.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">- Belum ada staf -</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono font-bold text-[10px] ${
                          wh.gate_mode === 'SINGLE_ANTENNA_SESSION'
                            ? 'bg-purple-100 text-purple-800 border border-purple-200'
                            : 'bg-teal-100 text-teal-800 border border-teal-200'
                        }`}>
                          <Radio className="w-3 h-3" />
                          {wh.gate_mode === 'SINGLE_ANTENNA_SESSION' ? '1 Antena' : '2 Antena'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 text-center font-mono font-bold text-slate-800">
                        {wh.capacity ? `${wh.capacity} Pcs` : '-'}
                      </td>
                      <td className="py-2.5 px-3.5 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          wh.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                        }`}>
                          {wh.is_active ? 'AKTIF' : 'NON-AKTIF'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 text-right">
                        {(!currentUser || ['superadmin', 'pm'].includes(currentUser.role)) && (
                          <button
                            onClick={() => openEditWarehouse(wh)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition cursor-pointer"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>Atur Staf</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Projects Table */}
      {activeTab === 'projects' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-3.5">Kode Proyek</th>
                  <th className="py-3 px-3.5">Nama Proyek</th>
                  <th className="py-3 px-3.5">Principal Client</th>
                  <th className="py-3 px-3.5">Lokasi Wilayah</th>
                  <th className="py-3 px-3.5 text-center">Status</th>
                  <th className="py-3 px-3.5 text-right">Work Orders</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProjects.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      Tidak ada proyek yang sesuai.
                    </td>
                  </tr>
                ) : (
                  filteredProjects.map((pr) => (
                    <tr key={pr.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-2.5 px-3.5 font-mono font-bold text-slate-900">{pr.code}</td>
                      <td className="py-2.5 px-3.5 font-bold text-slate-800">{pr.name}</td>
                      <td className="py-2.5 px-3.5 font-medium text-slate-700">{pr.principal?.name || '-'}</td>
                      <td className="py-2.5 px-3.5 text-slate-600">{pr.location || '-'}</td>
                      <td className="py-2.5 px-3.5 text-center">
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] uppercase">
                          {pr.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono font-bold text-slate-800">
                        {pr.work_orders_count ?? 0} WO
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Principals Table */}
      {activeTab === 'principals' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-3.5">Kode</th>
                  <th className="py-3 px-3.5">Nama Principal Vendor</th>
                  <th className="py-3 px-3.5">PIC & Kontak</th>
                  <th className="py-3 px-3.5">Email</th>
                  <th className="py-3 px-3.5">Alamat Kantor / Yard</th>
                  <th className="py-3 px-3.5 text-right">Proyek & Kontrak</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPrincipals.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      Tidak ada principal yang sesuai.
                    </td>
                  </tr>
                ) : (
                  filteredPrincipals.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-2.5 px-3.5 font-mono font-bold text-blue-700">
                        <span className="px-2 py-0.5 bg-blue-50 border border-blue-200 rounded">
                          {p.code}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 font-bold text-slate-900">{p.name}</td>
                      <td className="py-2.5 px-3.5 text-slate-700">
                        <strong>{p.contact_person || '-'}</strong>
                        <span className="block text-[11px] text-slate-400 font-mono">{p.phone || '-'}</span>
                      </td>
                      <td className="py-2.5 px-3.5 text-slate-600 font-mono">{p.email || '-'}</td>
                      <td className="py-2.5 px-3.5 text-slate-600 max-w-xs truncate">{p.address || '-'}</td>
                      <td className="py-2.5 px-3.5 text-right font-mono text-xs">
                        <span className="font-bold text-emerald-700">{p.spks_count ?? 0} SPK</span>
                        <span className="text-slate-400"> · </span>
                        <span className="font-bold text-blue-700">{p.projects_count ?? 0} Proyek</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 5: Armada Truk & Ekspedisi Table */}
      {activeTab === 'vehicles' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-3.5">Nomor Polisi / Plat</th>
                  <th className="py-3 px-3.5">Tipe Truk</th>
                  <th className="py-3 px-3.5">Driver / Supir</th>
                  <th className="py-3 px-3.5">Perusahaan Ekspedisi / Vendor</th>
                  <th className="py-3 px-3.5 text-center">Kapasitas Tiang</th>
                  <th className="py-3 px-3.5">Status Armada</th>
                  <th className="py-3 px-3.5">Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredVehicles.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      Tidak ada armada truk yang sesuai.
                    </td>
                  </tr>
                ) : (
                  filteredVehicles.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-2.5 px-3.5 font-mono font-bold text-slate-900">
                        <span className="px-2.5 py-1 bg-slate-900 text-amber-400 rounded-lg border border-slate-800">
                          {v.plate_number}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5">
                        <span className="capitalize px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[11px]">
                          {v.vehicle_type?.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 text-slate-800 font-semibold">
                        <div>{v.driver_name || '-'}</div>
                        {v.driver_phone && (
                          <div className="text-[11px] text-slate-400 font-mono">{v.driver_phone}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-3.5 text-slate-700 font-medium">
                        {v.transporter_name || 'Internal MOSA'}
                      </td>
                      <td className="py-2.5 px-3.5 text-center font-mono font-bold text-slate-800">
                        {v.max_pole_capacity} Batang
                      </td>
                      <td className="py-2.5 px-3.5">
                        {v.is_active ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Aktif Beroperasi
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            Nonaktif
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3.5 text-slate-500 text-[11px]">
                        {v.notes || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Tambah Item */}
      {showItemModal && (
        <Portal>
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[100] animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-2xl w-full space-y-4 shadow-2xl my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-800">Tambah Material FO Baru</h2>
              <button onClick={() => setShowItemModal(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateItem} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Kode Barang *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. POLE-FO-7M"
                  value={newItem.code}
                  onChange={(e) => setNewItem({ ...newItem, code: e.target.value.toUpperCase() })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-mono font-bold"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Nama Material *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tiang FO 7M Besi Galvanis"
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-semibold"
                />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Kategori *</label>
                  <select
                    value={newItem.category}
                    onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold"
                  >
                    <option value="pole">Tiang (Pole)</option>
                    <option value="cable">Kabel FO</option>
                    <option value="hardware">Hardware</option>
                    <option value="tools">Alat Kerja (Tools)</option>
                    <option value="accessories">Aksesoris / Clamp</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Satuan *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. batang / unit / drum"
                    value={newItem.unit}
                    onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-semibold"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Prefix EPC</label>
                  <input
                    type="text"
                    placeholder="POLEA1"
                    value={newItem.epc_prefix}
                    onChange={(e) => setNewItem({ ...newItem, epc_prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Digit Suffix</label>
                  <input
                    type="number"
                    min="1"
                    max="18"
                    value={newItem.epc_suffix_digits}
                    onChange={(e) => setNewItem({ ...newItem, epc_suffix_digits: Number(e.target.value) })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-mono font-bold"
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-500">Contoh: {newItem.epc_prefix || 'POLEA1'}{'0'.repeat(Math.min(newItem.epc_suffix_digits || 1, 14))}. Prefix kosong menonaktifkan generate EPC.</p>
              <div className="flex gap-4 pt-2">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={newItem.is_metal}
                    onChange={(e) => setNewItem({ ...newItem, is_metal: e.target.checked })}
                    className="rounded text-emerald-600 w-4 h-4"
                  />
                  <span>Material Logam (Tag Anti-Metal WZ-Y258)</span>
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowItemModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-600 hover:bg-slate-50 font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow cursor-pointer"
                >
                  Simpan Material
                </button>
              </div>
            </form>
          </div>
        </div>
        </Portal>
      )}

      {/* Modal Tambah Armada Truk */}
      {showVehicleModal && (
        <Portal>
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[100] animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-2xl w-full space-y-4 shadow-2xl my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-emerald-600" />
                <h2 className="text-base font-bold text-slate-800">Tambah Armada Truk</h2>
              </div>
              <button onClick={() => setShowVehicleModal(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateVehicle} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Nomor Polisi (Plat Truk) *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. B 9123 FO / L 4421 X"
                  value={newVehicle.plate_number}
                  onChange={(e) => setNewVehicle({ ...newVehicle, plate_number: e.target.value.toUpperCase() })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-mono font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Tipe Kendaraan *</label>
                  <select
                    value={newVehicle.vehicle_type}
                    onChange={(e) => setNewVehicle({ ...newVehicle, vehicle_type: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold"
                  >
                    <option value="pickup">Pickup (Kecil)</option>
                    <option value="truck_medium">Truk Engkel / Medium</option>
                    <option value="truck_heavy">Truk Fuso / Berat</option>
                    <option value="trailer">Trailer Panjang</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Kapasitas Tiang (Batang) *</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={newVehicle.max_pole_capacity}
                    onChange={(e) => setNewVehicle({ ...newVehicle, max_pole_capacity: Number(e.target.value) })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Nama Supir / Driver</label>
                <input
                  type="text"
                  placeholder="e.g. Suparman"
                  value={newVehicle.driver_name}
                  onChange={(e) => setNewVehicle({ ...newVehicle, driver_name: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">No HP / WhatsApp Supir</label>
                  <input
                    type="text"
                    placeholder="08123456789"
                    value={newVehicle.driver_phone}
                    onChange={(e) => setNewVehicle({ ...newVehicle, driver_phone: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Vendor Ekspedisi</label>
                  <input
                    type="text"
                    placeholder="e.g. PT Trans Logistik"
                    value={newVehicle.transporter_name}
                    onChange={(e) => setNewVehicle({ ...newVehicle, transporter_name: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Catatan Tambahan</label>
                <textarea
                  rows={2}
                  placeholder="Kondisi bak truk / ketentuan izin pergerakan..."
                  value={newVehicle.notes}
                  onChange={(e) => setNewVehicle({ ...newVehicle, notes: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowVehicleModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-600 hover:bg-slate-50 font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow cursor-pointer"
                >
                  Simpan Truk
                </button>
              </div>
            </form>
          </div>
        </div>
        </Portal>
      )}

      {/* Modal Tambah Proyek Baru */}
      {showProjectModal && (
        <Portal>
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[100] animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-3xl w-full space-y-4 shadow-2xl my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FolderKanban className="w-5 h-5 text-emerald-600" />
                <h2 className="text-base font-bold text-slate-800">Tambah Proyek Rollout FO Baru</h2>
              </div>
              <button onClick={() => setShowProjectModal(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Principal Vendor / Client *</label>
                <select
                  required
                  value={newProject.principal_id}
                  onChange={(e) => setNewProject({ ...newProject, principal_id: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold"
                >
                  <option value="">-- Pilih Principal Klien --</option>
                  {principals.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Kode Proyek *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. PRJ-MYREP-BGR-2026"
                    value={newProject.code}
                    onChange={(e) => setNewProject({ ...newProject, code: e.target.value.toUpperCase() })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Nama Client Branch</label>
                  <input
                    type="text"
                    placeholder="e.g. MyRepublic Jabodetabek"
                    value={newProject.client_name}
                    onChange={(e) => setNewProject({ ...newProject, client_name: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Nama Proyek Rollout FO *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rollout Feeder & Distribution FO 1500 Tiang Bogor Timur"
                  value={newProject.name}
                  onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Lokasi Wilayah *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Bogor Timur & Sukasari"
                    value={newProject.location}
                    onChange={(e) => setNewProject({ ...newProject, location: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-semibold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Status Proyek *</label>
                  <select
                    value={newProject.status}
                    onChange={(e) => setNewProject({ ...newProject, status: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold"
                  >
                    <option value="active">Active (Aktif Berjalan)</option>
                    <option value="on_hold">On Hold (Ditunda)</option>
                    <option value="completed">Completed (Selesai)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowProjectModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-600 hover:bg-slate-50 font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow cursor-pointer"
                >
                  Simpan Proyek Baru
                </button>
              </div>
            </form>
          </div>
        </div>
        </Portal>
      )}

      {/* Modal Tambah Principal Baru */}
      {showPrincipalModal && (
        <Portal>
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[100] animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-2xl w-full space-y-4 shadow-2xl my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-600" />
                <h2 className="text-base font-bold text-slate-800">Tambah Principal Vendor / Klien</h2>
              </div>
              <button onClick={() => setShowPrincipalModal(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePrincipal} className="space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-2.5">
                <div className="col-span-2">
                  <label className="font-bold text-slate-700 block mb-1">Nama Perusahaan / Klien *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. PT MyRepublic Indonesia"
                    value={newPrincipal.name}
                    onChange={(e) => setNewPrincipal({ ...newPrincipal, name: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-semibold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Kode Singkat *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. MYREP"
                    value={newPrincipal.code}
                    onChange={(e) => setNewPrincipal({ ...newPrincipal, code: e.target.value.toUpperCase() })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Nama PIC Vendor</label>
                  <input
                    type="text"
                    placeholder="e.g. Rian Hidayat"
                    value={newPrincipal.contact_person}
                    onChange={(e) => setNewPrincipal({ ...newPrincipal, contact_person: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">No. Telepon / WA</label>
                  <input
                    type="text"
                    placeholder="021-50505050"
                    value={newPrincipal.phone}
                    onChange={(e) => setNewPrincipal({ ...newPrincipal, phone: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Email Resmi</label>
                <input
                  type="email"
                  placeholder="vendor.ops@myrepublic.co.id"
                  value={newPrincipal.email}
                  onChange={(e) => setNewPrincipal({ ...newPrincipal, email: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Alamat Kantor / Yard</label>
                <textarea
                  rows={2}
                  placeholder="Alamat kantor pusat atau lokasi yard pabrik..."
                  value={newPrincipal.address}
                  onChange={(e) => setNewPrincipal({ ...newPrincipal, address: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPrincipalModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-600 hover:bg-slate-50 font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow cursor-pointer"
                >
                  Simpan Principal
                </button>
              </div>
            </form>
          </div>
        </div>
        </Portal>
      )}

      {/* Modal Tambah Gudang Transit Baru */}
      {showWarehouseModal && (
        <Portal>
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[100] animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-3xl w-full space-y-4 shadow-2xl my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <WhIcon className="w-5 h-5 text-emerald-600" />
                <h2 className="text-base font-bold text-slate-800">Tambah Gudang Transit & Staf Yard</h2>
              </div>
              <button onClick={() => setShowWarehouseModal(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateWarehouse} className="space-y-3 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700 block">Alokasi Proyek yang Dilayani (Shared Hub)</label>
                  <span className="text-[10px] text-slate-400">Pilih 1 atau lebih proyek</span>
                </div>
                <div className="border border-slate-200 rounded-xl p-2.5 bg-slate-50/50 max-h-32 overflow-y-auto space-y-1.5">
                  {projects.length === 0 ? (
                    <div className="text-slate-400 text-center py-1">Belum ada proyek terdaftar</div>
                  ) : (
                    projects.map((pr) => {
                      const isChecked = newWarehouse.project_ids?.includes(pr.id);
                      return (
                        <label
                          key={pr.id}
                          className="flex items-center gap-2 p-1.5 hover:bg-white rounded-lg cursor-pointer transition border border-transparent hover:border-slate-200"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNewWarehouse({
                                  ...newWarehouse,
                                  project_ids: [...(newWarehouse.project_ids || []), pr.id],
                                });
                              } else {
                                setNewWarehouse({
                                  ...newWarehouse,
                                  project_ids: (newWarehouse.project_ids || []).filter((id) => id !== pr.id),
                                });
                              }
                            }}
                            className="rounded text-blue-600 w-4 h-4"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="font-semibold text-slate-800">{pr.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono ml-1.5">({pr.code})</span>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Kode Gudang *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. WH-BOGOR-02"
                    value={newWarehouse.code}
                    onChange={(e) => setNewWarehouse({ ...newWarehouse, code: e.target.value.toUpperCase() })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Mode Reader RFID *</label>
                  <select
                    value={newWarehouse.gate_mode}
                    onChange={(e) => setNewWarehouse({ ...newWarehouse, gate_mode: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold"
                  >
                    <option value="SINGLE_ANTENNA_SESSION">1 Antena (App Session)</option>
                    <option value="DUAL_ANTENNA_AUTO">2 Antena (A ↔ B Auto Direction)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Nama Gudang Transit *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Gudang Transit Tajur Bogor"
                  value={newWarehouse.name}
                  onChange={(e) => setNewWarehouse({ ...newWarehouse, name: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">PIC Warehouse (Kepala Gudang)</label>
                  <select
                    value={newWarehouse.pic_user_id}
                    onChange={(e) => setNewWarehouse({ ...newWarehouse, pic_user_id: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold"
                  >
                    <option value="">-- Pilih User PIC --</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">No. Kontak / WA Gudang</label>
                  <input
                    type="text"
                    placeholder="0813-9876-5432"
                    value={newWarehouse.phone}
                    onChange={(e) => setNewWarehouse({ ...newWarehouse, phone: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Kapasitas Maksimal Tiang (Pcs)</label>
                <input
                  type="number"
                  min={1}
                  placeholder="1000"
                  value={newWarehouse.capacity}
                  onChange={(e) => setNewWarehouse({ ...newWarehouse, capacity: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-semibold font-mono"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Alamat / Lokasi Proyek</label>
                <textarea
                  rows={2}
                  placeholder="Jl. Raya Tajur No. 88, Bogor..."
                  value={newWarehouse.address}
                  onChange={(e) => setNewWarehouse({ ...newWarehouse, address: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Penugasan Staf Storeroom (Multi-Select)</label>
                <div className="border border-slate-200 rounded-xl p-2.5 bg-slate-50/50 max-h-36 overflow-y-auto space-y-1.5">
                  {users.length === 0 ? (
                    <div className="text-slate-400 text-center py-2">Memuat daftar pengguna...</div>
                  ) : (
                    users.map((u) => {
                      const isChecked = newWarehouse.staff_user_ids.includes(u.id);
                      return (
                        <label
                          key={u.id}
                          className="flex items-center gap-2 p-1.5 hover:bg-white rounded-lg cursor-pointer transition"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNewWarehouse({
                                  ...newWarehouse,
                                  staff_user_ids: [...newWarehouse.staff_user_ids, u.id],
                                });
                              } else {
                                setNewWarehouse({
                                  ...newWarehouse,
                                  staff_user_ids: newWarehouse.staff_user_ids.filter((id) => id !== u.id),
                                });
                              }
                            }}
                            className="rounded text-emerald-600 w-4 h-4"
                          />
                          <span className="font-semibold text-slate-800">{u.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">({u.role})</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowWarehouseModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-600 hover:bg-slate-50 font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow cursor-pointer"
                >
                  Simpan Gudang Baru
                </button>
              </div>
            </form>
          </div>
        </div>
        </Portal>
      )}

      {/* Modal Edit / Atur Staf Gudang */}
      {showEditWarehouseModal && editingWarehouse && (
        <Portal>
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[100] animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-3xl w-full space-y-4 shadow-2xl my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-emerald-600" />
                <h2 className="text-base font-bold text-slate-800">Atur PIC & Staf Gudang ({editingWarehouse.code})</h2>
              </div>
              <button onClick={() => setShowEditWarehouseModal(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateWarehouse} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Nama Gudang Transit *</label>
                <input
                  type="text"
                  required
                  value={editingWarehouse.name}
                  onChange={(e) => setEditingWarehouse({ ...editingWarehouse, name: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-semibold"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700 block">Alokasi Proyek yang Dilayani (Shared Hub)</label>
                  <span className="text-[10px] text-slate-400">Pilih 1 atau lebih proyek</span>
                </div>
                <div className="border border-slate-200 rounded-xl p-2.5 bg-slate-50/50 max-h-32 overflow-y-auto space-y-1.5">
                  {projects.length === 0 ? (
                    <div className="text-slate-400 text-center py-1">Belum ada proyek terdaftar</div>
                  ) : (
                    projects.map((pr) => {
                      const isChecked = editingWarehouse.project_ids?.includes(pr.id);
                      return (
                        <label
                          key={pr.id}
                          className="flex items-center gap-2 p-1.5 hover:bg-white rounded-lg cursor-pointer transition border border-transparent hover:border-slate-200"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setEditingWarehouse({
                                  ...editingWarehouse,
                                  project_ids: [...(editingWarehouse.project_ids || []), pr.id],
                                });
                              } else {
                                setEditingWarehouse({
                                  ...editingWarehouse,
                                  project_ids: (editingWarehouse.project_ids || []).filter((id) => id !== pr.id),
                                });
                              }
                            }}
                            className="rounded text-blue-600 w-4 h-4"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="font-semibold text-slate-800">{pr.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono ml-1.5">({pr.code})</span>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Mode Reader RFID *</label>
                <select
                  value={editingWarehouse.gate_mode}
                  onChange={(e) => setEditingWarehouse({ ...editingWarehouse, gate_mode: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold"
                >
                  <option value="SINGLE_ANTENNA_SESSION">1 Antena (App Session)</option>
                  <option value="DUAL_ANTENNA_AUTO">2 Antena (A ↔ B Auto Direction)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">PIC Warehouse (Kepala Gudang)</label>
                  <select
                    value={editingWarehouse.pic_user_id}
                    onChange={(e) => setEditingWarehouse({ ...editingWarehouse, pic_user_id: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold"
                  >
                    <option value="">-- Pilih User PIC --</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">No. Telepon / WA</label>
                  <input
                    type="text"
                    value={editingWarehouse.phone}
                    onChange={(e) => setEditingWarehouse({ ...editingWarehouse, phone: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Kapasitas (Pcs)</label>
                  <input
                    type="number"
                    min={1}
                    value={editingWarehouse.capacity}
                    onChange={(e) => setEditingWarehouse({ ...editingWarehouse, capacity: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Status Operasi</label>
                  <select
                    value={editingWarehouse.is_active ? '1' : '0'}
                    onChange={(e) => setEditingWarehouse({ ...editingWarehouse, is_active: e.target.value === '1' })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold"
                  >
                    <option value="1">Aktif Beroperasi</option>
                    <option value="0">Nonaktif</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Alamat Gudang</label>
                <textarea
                  rows={2}
                  value={editingWarehouse.address}
                  onChange={(e) => setEditingWarehouse({ ...editingWarehouse, address: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Penugasan Staf Storeroom (Multi-Select)</label>
                <div className="border border-slate-200 rounded-xl p-2.5 bg-slate-50/50 max-h-36 overflow-y-auto space-y-1.5">
                  {users.map((u) => {
                    const isChecked = editingWarehouse.staff_user_ids.includes(u.id);
                    return (
                      <label
                        key={u.id}
                        className="flex items-center gap-2 p-1.5 hover:bg-white rounded-lg cursor-pointer transition"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setEditingWarehouse({
                                ...editingWarehouse,
                                staff_user_ids: [...editingWarehouse.staff_user_ids, u.id],
                              });
                            } else {
                              setEditingWarehouse({
                                ...editingWarehouse,
                                staff_user_ids: editingWarehouse.staff_user_ids.filter((id) => id !== u.id),
                              });
                            }
                          }}
                          className="rounded text-emerald-600 w-4 h-4"
                        />
                        <span className="font-semibold text-slate-800">{u.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">({u.role})</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEditWarehouseModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-600 hover:bg-slate-50 font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow cursor-pointer"
                >
                  Simpan Perubahan
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
