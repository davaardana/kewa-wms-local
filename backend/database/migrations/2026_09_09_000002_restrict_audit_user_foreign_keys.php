<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * User identities referenced by operational or audit records must be retained.
     */
    public function up(): void
    {
        $this->replaceUserForeignKeys([
            'work_orders' => ['pm_user_id', 'approved_by_user_id'],
            'deliveries' => ['received_by_user_id', 'dispatched_by_user_id'],
            'gate_transactions' => ['pic_user_id', 'approved_by_user_id'],
            'custody_ledger' => ['holder_user_id'],
            'approval_template_steps' => ['approver_user_id'],
            'approval_config_steps' => ['approver_user_id'],
            'approval_requests' => ['requester_user_id', 'current_approver_user_id', 'final_approved_by_user_id'],
            'approval_histories' => ['designated_user_id', 'action_by_user_id'],
            'warehouses' => ['pic_user_id'],
            'warehouse_users' => ['user_id'],
            'spks' => ['created_by_user_id'],
        ]);
    }

    public function down(): void
    {
        $this->replaceUserForeignKeys([
            'work_orders' => ['pm_user_id'],
            'gate_transactions' => ['pic_user_id'],
            'custody_ledger' => ['holder_user_id'],
            'approval_template_steps' => ['approver_user_id'],
            'approval_config_steps' => ['approver_user_id'],
            'approval_requests' => ['requester_user_id'],
            'approval_histories' => ['designated_user_id'],
            'warehouse_users' => ['user_id'],
        ], 'cascade');

        $this->replaceUserForeignKeys([
            'work_orders' => ['approved_by_user_id'],
            'deliveries' => ['received_by_user_id', 'dispatched_by_user_id'],
            'gate_transactions' => ['approved_by_user_id'],
            'approval_requests' => ['current_approver_user_id', 'final_approved_by_user_id'],
            'approval_histories' => ['action_by_user_id'],
            'warehouses' => ['pic_user_id'],
            'spks' => ['created_by_user_id'],
        ], 'null');
    }

    private function replaceUserForeignKeys(array $tables, string $onDelete = 'restrict'): void
    {
        foreach ($tables as $tableName => $columns) {
            if (!Schema::hasTable($tableName)) {
                continue;
            }

            foreach ($columns as $column) {
                if (!Schema::hasColumn($tableName, $column)) {
                    continue;
                }

                Schema::table($tableName, function (Blueprint $table) use ($column, $onDelete) {
                    $table->dropForeign([$column]);
                    $foreign = $table->foreign($column)->references('id')->on('users');

                    match ($onDelete) {
                        'cascade' => $foreign->cascadeOnDelete(),
                        'null' => $foreign->nullOnDelete(),
                        default => $foreign->restrictOnDelete(),
                    };
                });
            }
        }
    }
};