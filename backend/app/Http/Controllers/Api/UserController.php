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

        // Default: only active users. Superadmin can pass include_inactive=1 to see all.
        if (!$request->boolean('include_inactive')) {
            $query->where('is_active', true);
        }

        if ($request->has('role') && $request->role !== 'ALL') {
            $query->where('role', $request->role);
        }

        if ($request->has('search') && $request->search) {
            $s = $request->search;
            $query->where(function ($q) use ($s) {
                $q->where('name', 'ilike', "%{$s}%")
                  ->orWhere('email', 'ilike', "%{$s}%")
                  ->orWhere('phone', 'ilike', "%{$s}%");
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
            'role' => ['required', 'string', \Illuminate\Validation\Rule::in(['superadmin', 'pm', 'pic_lapangan'])],
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
            'role' => ['required', 'string', \Illuminate\Validation\Rule::in(['superadmin', 'pm', 'pic_lapangan'])],
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

        if ($user->role === 'superadmin') {
            return response()->json(['message' => 'Tidak dapat menghapus akun superadmin.'], 403);
        }

        try {
            $user->tokens()->delete();
            $user->delete();

            return response()->json([
                'success' => true,
                'message' => "Pengguna {$user->name} berhasil dihapus permanen.",
            ]);
        } catch (\Illuminate\Database\QueryException $e) {
            // FK constraint — deactivate instead
            $user->is_active = false;
            $user->save();

            return response()->json([
                'success' => true,
                'message' => "Pengguna {$user->name} dinonaktifkan (tidak bisa dihapus karena terkait data audit).",
                'data' => $user,
            ]);
        }
    }

    /**
     * Toggle user active/inactive status
     */
    public function toggleStatus(int $id): JsonResponse
    {
        $this->authorizeSuperAdmin(request());

        $user = User::findOrFail($id);

        // Prevent SA from locking themselves out
        if (request()->user()->id === $user->id) {
            return response()->json(['message' => 'Tidak dapat mengubah status aktif akun Anda sendiri.'], 403);
        }

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
     * #7: Cache-Control 3 menit — roles sangat jarang berubah
     */
    public function getRolesAndPermissions(): JsonResponse
    {
        $this->ensureDefaultRolesExist();

        $modules = $this->getSystemModules();
        $dbRoles = Role::with('permissions')->get();

        // Pre-fetch user counts grouped by role — prevents N+1 query
        $userCounts = User::selectRaw('role, count(*) as total')
            ->groupBy('role')
            ->pluck('total', 'role');

        $roles = $dbRoles->map(function ($r) use ($modules, $userCounts) {
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
                'user_count' => (int) ($userCounts[$r->code] ?? 0),
                'permissions' => $perms,
            ];
        });

        // #7: Role & permission matrix sangat jarang berubah — cache 3 menit
        return response()->json([
            'roles'   => $roles,
            'modules' => $modules,
        ])->header('Cache-Control', 'private, max-age=180, stale-while-revalidate=60');
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
                'name'        => 'Super Administrator',
                'code'        => 'superadmin',
                'badge'       => '\U0001f451 SUPERADMIN',
                'color'       => 'purple',
                'description' => 'Akses penuh tanpa batas: konfigurasi sistem, kelola pengguna, audit trail, override gerbang RFID.',
                'is_system'   => true,
                'permissions' => [
                    'shipping_document_create' => true, 'shipping_document_approve' => true,
                    'shipping_document_complete' => true, 'shipping_document_cancel' => true,
                    'tag_enrollment' => true, 'master_data' => true,
                    'gate_monitor' => true, 'device_pairing' => true,
                    'laporan' => true, 'user_management' => true,
                ],
            ],
            [
                'name'        => 'Project Manager (PM)',
                'code'        => 'pm',
                'badge'       => '\U0001f468\u200d\U0001f4bc PM APPROVER',
                'color'       => 'amber',
                'description' => 'Buat dan approve dokumen, master data, RFID gate, laporan. Tidak bisa kelola pengguna.',
                'is_system'   => true,
                'permissions' => [
                    'shipping_document_create' => true, 'shipping_document_approve' => true,
                    'shipping_document_complete' => false, 'shipping_document_cancel' => true,
                    'tag_enrollment' => true, 'master_data' => true,
                    'gate_monitor' => true, 'device_pairing' => true,
                    'laporan' => true, 'user_management' => false,
                ],
            ],
            [
                'name'        => 'PIC Lapangan',
                'code'        => 'pic_lapangan',
                'badge'       => '\U0001f477 PIC LAPANGAN',
                'color'       => 'blue',
                'description' => 'Assign tag, selesaikan dokumen, monitor gate, laporan. Tidak bisa buat/approve dokumen atau kelola master data.',
                'is_system'   => true,
                'permissions' => [
                    'shipping_document_create' => false, 'shipping_document_approve' => false,
                    'shipping_document_complete' => true, 'shipping_document_cancel' => false,
                    'tag_enrollment' => true, 'master_data' => false,
                    'gate_monitor' => true, 'device_pairing' => false,
                    'laporan' => true, 'user_management' => false,
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
            ['key' => 'dispatch_scan', 'name' => 'Handheld 1: Dispatch Scan Barang Keluar', 'group' => 'Pengadaan & Logistik'],
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
