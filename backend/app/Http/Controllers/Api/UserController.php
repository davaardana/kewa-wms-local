<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    /**
     * Get list of users with search and role filter
     */
    public function index(Request $request): JsonResponse
    {
        $query = User::with('assignedWarehouses')->orderBy('name');

        if ($request->has('role') && $request->role !== 'ALL') {
            $query->where('role', $request->role);
        }

        if ($request->has('search') && $request->search) {
            $s = $request->search;
            $query->where(function ($q) use ($s) {
                $q->where('name', 'like', "%{$s}%")
                  ->orWhere('email', 'like', "%{$s}%")
                  ->orWhere('phone', 'like', "%{$s}%");
            });
        }

        return response()->json($query->get());
    }

    /**
     * Store new user
     */
    public function store(Request $request): JsonResponse
    {
        $this->authorizeSuperAdmin($request);

        $validated = $request->validate([
            'name' => 'required|string|max:150',
            'email' => 'required|email|max:150|unique:users,email',
            'password' => 'required|string|min:6',
            'role' => 'required|string|max:50',
            'phone' => 'nullable|string|max:50',
            'is_active' => 'boolean',
            'warehouse_ids' => 'nullable|array',
            'warehouse_ids.*' => 'integer|distinct|exists:warehouses,id',
        ]);

        $user = DB::transaction(function () use ($validated) {
            $user = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => Hash::make($validated['password']),
            'role' => $validated['role'],
            'phone' => $validated['phone'] ?? null,
            'is_active' => $validated['is_active'] ?? true,
            ]);
            $user->assignedWarehouses()->sync($validated['warehouse_ids'] ?? []);
            return $user;
        });

        return response()->json([
            'success' => true,
            'message' => 'Pengguna baru berhasil didaftarkan',
            'data' => $user->load('assignedWarehouses'),
        ], 201);
    }

    /**
     * Update user
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $this->authorizeSuperAdmin($request);

        $user = User::findOrFail($id);

        $validated = $request->validate([
            'name' => 'required|string|max:150',
            'email' => ['required', 'email', 'max:150', Rule::unique('users')->ignore($user->id)],
            'password' => 'nullable|string|min:6',
            'role' => 'required|string|max:50',
            'phone' => 'nullable|string|max:50',
            'is_active' => 'boolean',
            'warehouse_ids' => 'sometimes|array',
            'warehouse_ids.*' => 'integer|distinct|exists:warehouses,id',
        ]);

        $updateData = [
            'name' => $validated['name'],
            'email' => $validated['email'],
            'role' => $validated['role'],
            'phone' => $validated['phone'] ?? null,
            'is_active' => $validated['is_active'] ?? true,
        ];

        if (!empty($validated['password'])) {
            $updateData['password'] = Hash::make($validated['password']);
        }

        DB::transaction(function () use ($user, $updateData, $validated) {
            $user->update($updateData);
            if (array_key_exists('warehouse_ids', $validated)) {
                $user->assignedWarehouses()->sync($validated['warehouse_ids']);
            }
        });

        return response()->json([
            'success' => true,
            'message' => 'Data pengguna berhasil diperbarui',
            'data' => $user->load('assignedWarehouses'),
        ]);
    }

    /**
     * Preserve the user identity and deactivate it instead of deleting audit history.
     */
    public function destroy(int $id): JsonResponse
    {
        $this->authorizeSuperAdmin(request());

        $user = User::findOrFail($id);
        $user->is_active = false;
        $user->save();

        return response()->json([
            'success' => true,
            'message' => 'Pengguna dinonaktifkan; identitas audit tetap disimpan',
            'data' => $user,
        ]);
    }

    /**
     * Toggle user active/inactive status
     */
    public function toggleStatus(int $id): JsonResponse
    {
        $this->authorizeSuperAdmin(request());

        $user = User::findOrFail($id);
        $user->is_active = !$user->is_active;
        $user->save();

        return response()->json([
            'success' => true,
            'message' => 'Status pengguna berhasil diperbarui',
            'data' => $user,
        ]);
    }

    /**
     * Get system roles and RBAC permission matrix (From Database)
     */
    public function getRolesAndPermissions(): JsonResponse
    {
        $this->ensureDefaultRolesExist();

        $modules = $this->getSystemModules();
        $dbRoles = Role::with('permissions')->get();

        $roles = $dbRoles->map(function ($r) use ($modules) {
            $perms = [];
            foreach ($modules as $m) {
                $perms[$m['key']] = false;
            }
            foreach ($r->permissions as $p) {
                $perms[$p->module_key] = (bool) $p->is_allowed;
            }

            return [
                'id' => $r->id,
                'name' => $r->name,
                'code' => $r->code,
                'badge' => $r->badge ?: strtoupper($r->name),
                'color' => $r->color ?: 'indigo',
                'description' => $r->description,
                'is_system' => (bool) $r->is_system,
                'user_count' => User::where('role', $r->code)->count(),
                'permissions' => $perms,
            ];
        });

        return response()->json([
            'roles' => $roles,
            'modules' => $modules,
        ]);
    }

    /**
     * Create custom role with permissions
     */
    public function createRole(Request $request): JsonResponse
    {
        $this->authorizeSuperAdmin($request);

        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'code' => 'required|string|max:50|unique:roles,code',
            'description' => 'nullable|string',
            'color' => 'nullable|string|max:30',
            'badge' => 'nullable|string|max:50',
            'permissions' => 'nullable|array',
        ]);

        $role = DB::transaction(function () use ($validated) {
            $newRole = Role::create([
                'name' => $validated['name'],
                'code' => strtolower(str_replace(' ', '_', $validated['code'])),
                'description' => $validated['description'] ?? null,
                'color' => $validated['color'] ?? 'indigo',
                'badge' => $validated['badge'] ?? strtoupper($validated['name']),
                'is_system' => false,
            ]);

            $perms = $validated['permissions'] ?? [];
            foreach ($this->getSystemModules() as $mod) {
                RolePermission::create([
                    'role_id' => $newRole->id,
                    'module_key' => $mod['key'],
                    'is_allowed' => !empty($perms[$mod['key']]),
                ]);
            }

            return $newRole;
        });

        return response()->json([
            'success' => true,
            'message' => 'Role baru berhasil ditambahkan',
            'data' => $role,
        ], 201);
    }

    /**
     * Update role details and permissions
     */
    public function updateRole(Request $request, int $id): JsonResponse
    {
        $this->authorizeSuperAdmin($request);

        $role = Role::findOrFail($id);

        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'description' => 'nullable|string',
            'color' => 'nullable|string|max:30',
            'badge' => 'nullable|string|max:50',
            'permissions' => 'nullable|array',
        ]);

        DB::transaction(function () use ($role, $validated) {
            $role->update([
                'name' => $validated['name'],
                'description' => $validated['description'] ?? $role->description,
                'color' => $validated['color'] ?? $role->color,
                'badge' => $validated['badge'] ?? $role->badge,
            ]);

            if (isset($validated['permissions']) && is_array($validated['permissions'])) {
                foreach ($validated['permissions'] as $modKey => $isAllowed) {
                    RolePermission::updateOrCreate(
                        ['role_id' => $role->id, 'module_key' => $modKey],
                        ['is_allowed' => (bool) $isAllowed]
                    );
                }
            }
        });

        return response()->json([
            'success' => true,
            'message' => 'Konfigurasi role berhasil diperbarui',
            'data' => $role->load('permissions'),
        ]);
    }

    /**
     * Toggle individual permission for a role
     */
    public function toggleRolePermission(Request $request, int $id): JsonResponse
    {
        $this->authorizeSuperAdmin($request);

        $role = Role::findOrFail($id);
        $validated = $request->validate([
            'module_key' => 'required|string|max:50',
            'is_allowed' => 'required|boolean',
        ]);

        $perm = RolePermission::updateOrCreate(
            ['role_id' => $role->id, 'module_key' => $validated['module_key']],
            ['is_allowed' => $validated['is_allowed']]
        );

        return response()->json([
            'success' => true,
            'message' => "Hak akses {$validated['module_key']} berhasil diubah",
            'data' => $perm,
        ]);
    }

    /**
     * Delete custom role
     */
    public function deleteRole(int $id): JsonResponse
    {
        $this->authorizeSuperAdmin(request());

        $role = Role::findOrFail($id);

        if ($role->is_system) {
            return response()->json([
                'success' => false,
                'message' => 'Role bawaan sistem tidak dapat dihapus',
            ], 422);
        }

        $userCount = User::where('role', $role->code)->count();
        if ($userCount > 0) {
            return response()->json([
                'success' => false,
                'message' => "Tidak dapat menghapus role ini karena masih memiliki {$userCount} pengguna aktif",
            ], 422);
        }

        $role->delete();

        return response()->json([
            'success' => true,
            'message' => 'Role kustom berhasil dihapus',
        ]);
    }

    private function authorizeSuperAdmin(Request $request): void
    {
        abort_unless($request->user()?->isSuperAdmin(), 403, 'Akses Ditolak: Hanya Superadmin yang berwenang mengubah pengguna dan hak akses.');
    }

    /**
     * Ensure standard default system roles exist in DB
     */
    protected function ensureDefaultRolesExist(): void
    {
        if (Role::count() > 0) {
            return;
        }

        $defaultRoles = [
            [
                'name' => 'Super Administrator',
                'code' => 'superadmin',
                'badge' => '👑 SUPERADMIN',
                'color' => 'purple',
                'description' => 'Akses penuh tanpa batas, konfigurasi sistem, user management, audit trail mutasi, dan override bypass gerbang RFID.',
                'is_system' => true,
                'permissions' => [
                    'spk_create' => true, 'spk_approve' => true,
                    'dispatch_scan' => true, 'receiving_scan' => true,
                    'boq_quota_lock' => true, 'report_prepared' => true,
                    'gate_monitor' => true, 'gate_override' => true,
                    'field_pwa' => true, 'return_verify' => true,
                    'stock_opname' => true, 'audit_trail' => true,
                    'tag_enrollment' => true, 'master_data' => true,
                    'approval_settings' => true, 'user_management' => true,
                ],
            ],
            [
                'name' => 'Direksi / Top Level Management',
                'code' => 'management',
                'badge' => '👔 DIREKSI / BOD',
                'color' => 'indigo',
                'description' => 'Akses eksekutif pemantauan seluruh proyek FO, audit trail mutasi, status armada pengiriman, analitik shrinkage, dan approval tingkat tinggi.',
                'is_system' => true,
                'permissions' => [
                    'spk_create' => false, 'spk_approve' => true,
                    'dispatch_scan' => false, 'receiving_scan' => false,
                    'boq_quota_lock' => false, 'report_prepared' => false,
                    'gate_monitor' => true, 'gate_override' => false,
                    'field_pwa' => false, 'return_verify' => false,
                    'stock_opname' => true, 'audit_trail' => true,
                    'tag_enrollment' => false, 'master_data' => true,
                    'approval_settings' => true, 'user_management' => false,
                ],
            ],
            [
                'name' => 'Project Manager (PM)',
                'code' => 'pm',
                'badge' => '👨‍💼 PM APPROVER',
                'color' => 'amber',
                'description' => 'Pemilik otoritas proyek, penguncian kuota BOQ (Invarian SoD), persetujuan SPK pengadaan dan sign-off retur material sisa.',
                'is_system' => true,
                'permissions' => [
                    'spk_create' => true, 'spk_approve' => true,
                    'dispatch_scan' => false, 'receiving_scan' => false,
                    'boq_quota_lock' => true, 'report_prepared' => false,
                    'gate_monitor' => true, 'gate_override' => false,
                    'field_pwa' => false, 'return_verify' => true,
                    'stock_opname' => true, 'audit_trail' => true,
                    'tag_enrollment' => true, 'master_data' => true,
                    'approval_settings' => true, 'user_management' => false,
                ],
            ],
            [
                'name' => 'Procurement & Logistik',
                'code' => 'procurement',
                'badge' => '📋 PROCUREMENT',
                'color' => 'teal',
                'description' => 'Pembuatan SPK/PO vendor, pemindaian muat truk Handheld 1 di yard principal, pemantauan status truk dan in-transit shrinkage.',
                'is_system' => true,
                'permissions' => [
                    'spk_create' => true, 'spk_approve' => false,
                    'dispatch_scan' => true, 'receiving_scan' => false,
                    'boq_quota_lock' => false, 'report_prepared' => false,
                    'gate_monitor' => false, 'gate_override' => false,
                    'field_pwa' => false, 'return_verify' => false,
                    'stock_opname' => false, 'audit_trail' => true,
                    'tag_enrollment' => true, 'master_data' => true,
                    'approval_settings' => false, 'user_management' => false,
                ],
            ],
            [
                'name' => 'Petugas Gudang (Storeroom)',
                'code' => 'storeroom',
                'badge' => '📦 STOREROOM',
                'color' => 'blue',
                'description' => 'Bongkar & scan terima Handheld 2 di gerbang, pelaporan prepared_qty (READ-ONLY kuota), verifikasi fisik retur, dan stock opname yard.',
                'is_system' => true,
                'permissions' => [
                    'spk_create' => false, 'spk_approve' => false,
                    'dispatch_scan' => false, 'receiving_scan' => true,
                    'boq_quota_lock' => false, 'report_prepared' => true,
                    'gate_monitor' => true, 'gate_override' => false,
                    'field_pwa' => false, 'return_verify' => true,
                    'stock_opname' => true, 'audit_trail' => false,
                    'tag_enrollment' => false, 'master_data' => false,
                    'approval_settings' => false, 'user_management' => false,
                ],
            ],
            [
                'name' => 'Mandor / PIC Lapangan',
                'code' => 'pic_lapangan',
                'badge' => '👷 MANDOR LAPANGAN',
                'color' => 'emerald',
                'description' => 'Pengguna aplikasi PWA mobile, checkout muatan truk saat melintas gerbang sensor RFID, dan pelaporan retur sisa kabel/tiang proyek.',
                'is_system' => true,
                'permissions' => [
                    'spk_create' => false, 'spk_approve' => false,
                    'dispatch_scan' => false, 'receiving_scan' => false,
                    'boq_quota_lock' => false, 'report_prepared' => false,
                    'gate_monitor' => false, 'gate_override' => false,
                    'field_pwa' => true, 'return_verify' => false,
                    'stock_opname' => false, 'audit_trail' => false,
                    'tag_enrollment' => false, 'master_data' => false,
                    'approval_settings' => false, 'user_management' => false,
                ],
            ],
        ];

        foreach ($defaultRoles as $r) {
            $role = Role::create([
                'name' => $r['name'],
                'code' => $r['code'],
                'badge' => $r['badge'],
                'color' => $r['color'],
                'description' => $r['description'],
                'is_system' => $r['is_system'],
            ]);

            foreach ($r['permissions'] as $modKey => $isAllowed) {
                RolePermission::create([
                    'role_id' => $role->id,
                    'module_key' => $modKey,
                    'is_allowed' => $isAllowed,
                ]);
            }
        }
    }

    /**
     * List of operational modules in system
     */
    protected function getSystemModules(): array
    {
        return [
            ['key' => 'spk_create', 'name' => 'Buat SPK & PO Vendor', 'group' => 'Pengadaan & Logistik'],
            ['key' => 'spk_approve', 'name' => 'Approval SPK & PO Vendor', 'group' => 'Pengadaan & Logistik'],
            ['key' => 'dispatch_scan', 'name' => 'Handheld 1: Dispatch Scan di Principal', 'group' => 'Pengadaan & Logistik'],
            ['key' => 'receiving_scan', 'name' => 'Handheld 2: Receiving Scan di Gudang', 'group' => 'Pengadaan & Logistik'],
            ['key' => 'boq_quota_lock', 'name' => 'Kunci Kuota BOQ Work Order (PM Only)', 'group' => 'Perencanaan & Governance'],
            ['key' => 'report_prepared', 'name' => 'Input Prepared Qty Storeroom', 'group' => 'Perencanaan & Governance'],
            ['key' => 'approval_settings', 'name' => 'Master Setting Alur & Tier Approval', 'group' => 'Perencanaan & Governance'],
            ['key' => 'gate_monitor', 'name' => 'Monitoring Sensor Gerbang RFID Live', 'group' => 'Sensor Gerbang RFID'],
            ['key' => 'gate_override', 'name' => 'Bypass / Unlock Manual Gerbang RFID', 'group' => 'Sensor Gerbang RFID'],
            ['key' => 'field_pwa', 'name' => 'Akses Field App PWA Mandor', 'group' => 'Operasional Lapangan'],
            ['key' => 'return_verify', 'name' => 'Verifikasi Fisik Retur Sisa', 'group' => 'Retur & Audit'],
            ['key' => 'stock_opname', 'name' => 'Stock Opname Fisik Yard', 'group' => 'Retur & Audit'],
            ['key' => 'audit_trail', 'name' => 'Lihat Ledger Mutasi Digital (Audit Trail)', 'group' => 'Retur & Audit'],
            ['key' => 'tag_enrollment', 'name' => 'Registrasi Tag RFID EPC Baru', 'group' => 'Pengaturan Sistem'],
            ['key' => 'master_data', 'name' => 'Master Data Gudang, Proyek & Armada Truk', 'group' => 'Pengaturan Sistem'],
            ['key' => 'user_management', 'name' => 'Manajemen Pengguna & Hak Akses', 'group' => 'Pengaturan Sistem'],
        ];
    }
}
