<?php

namespace App\Console\Commands;

use App\Models\ApprovalRequest;
use App\Models\Item;
use App\Models\Principal;
use App\Models\Project;
use App\Models\RfidTag;
use App\Models\Spk;
use App\Models\SpkItem;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class PrepareHandheldDemo extends Command
{
    protected $signature = 'mosa:prepare-handheld-demo {--apply : Buat fixture demo tanpa reset data}';

    protected $description = 'Menyiapkan satu skenario presentasi handheld yang terisolasi dan idempotent';

    public function handle(): int
    {
        $keys = [
            'spk' => 'DEMO-HH-SPK-20260913',
            'approval' => 'DEMO-HH-APP-20260913',
            'epcs' => ['E280DE002026091300000001', 'E280DE002026091300000002'],
        ];

        if (!$this->option('apply')) {
            $this->info('Dry-run. Tambahkan --apply untuk membuat fixture demo. Tidak ada data diubah.');
            $this->line("SPK: {$keys['spk']}");
            return self::SUCCESS;
        }

        try {
            $result = DB::transaction(function () use ($keys): array {
                $procurement = $this->requiredUser('procurement.siti@mosa.id', 'procurement');
                $storeroom = $this->requiredUser('storeroom.joko@mosa.id', 'storeroom');
                $pm = $this->requiredUser('pm.budi@mosa.id', 'pm');
                $principal = Principal::where('code', 'MYREP')->firstOrFail();
                $project = Project::where('code', 'PRJ-MYREP-BGR-2026')->firstOrFail();
                $warehouse = Warehouse::where('code', 'WH-BOGOR-01')->firstOrFail();
                $item = Item::where('code', 'POLE-FO-7M')->firstOrFail();

                $storeroom->assignedWarehouses()->syncWithoutDetaching([
                    $warehouse->id => ['role_in_warehouse' => 'staff'],
                ]);

                $spk = Spk::updateOrCreate(['spk_number' => $keys['spk']], [
                    'principal_id' => $principal->id,
                    'project_id' => $project->id,
                    'created_by_user_id' => $procurement->id,
                    'title' => 'Demo Presentasi Handheld Dispatch & Receiving',
                    'total_amount' => 2000000,
                    'payment_status' => 'unpaid',
                    'notes' => 'Fixture presentasi idempotent; jangan gunakan sebagai transaksi produksi.',
                ]);

                if ($spk->deliveries()->exists()) {
                    throw new RuntimeException('Fixture demo sudah pernah dipakai. Delivery lama tidak dihapus demi menjaga audit.');
                }

                SpkItem::updateOrCreate(['spk_id' => $spk->id, 'item_id' => $item->id], [
                    'target_qty' => 2,
                    'price_per_unit' => 1000000,
                    'received_qty' => 0,
                    'notes' => 'Dua EPC untuk demo handheld.',
                ]);

                ApprovalRequest::updateOrCreate(['request_number' => $keys['approval']], [
                    'module' => 'SPK',
                    'reference_id' => $spk->id,
                    'reference_code' => $spk->spk_number,
                    'title' => $spk->title,
                    'project_id' => $project->id,
                    'requester_user_id' => $procurement->id,
                    'current_step_order' => 1,
                    'total_steps' => 1,
                    'current_approver_user_id' => null,
                    'status' => 'approved',
                    'total_amount' => $spk->total_amount,
                    'final_approved_at' => now(),
                    'final_approved_by_user_id' => $pm->id,
                ]);

                foreach ($keys['epcs'] as $epc) {
                    $tag = RfidTag::firstOrNew(['epc' => $epc]);
                    if ($tag->exists && ($tag->last_warehouse_id !== null || $tag->custodyLogs()->exists())) {
                        throw new RuntimeException("EPC {$epc} sudah memiliki custody dan tidak boleh di-reset.");
                    }
                    $tag->fill([
                        'item_id' => $item->id,
                        'tag_type' => 'passive_uhf',
                        'status' => 'active',
                        'last_warehouse_id' => null,
                        'project_id' => $project->id,
                        'notes' => 'Fixture presentasi handheld.',
                    ])->save();
                }

                return compact('spk', 'warehouse');
            });
        } catch (\Throwable $error) {
            $this->error($error->getMessage());
            return self::FAILURE;
        }

        $this->info('Fixture demo handheld siap.');
        $this->line("SPK: {$result['spk']->spk_number}");
        $this->line("Gudang: {$result['warehouse']->name}");
        $this->line('EPC: '.implode(', ', $keys['epcs']));
        $this->line('Dispatch: procurement.siti@mosa.id');
        $this->line('Receiving: storeroom.joko@mosa.id');

        return self::SUCCESS;
    }

    private function requiredUser(string $email, string $role): User
    {
        $user = User::where('email', $email)->first();
        if (!$user || !$user->is_active || $user->role !== $role) {
            throw new RuntimeException("User aktif {$email} dengan role {$role} tidak tersedia.");
        }

        return $user;
    }
}
