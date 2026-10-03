<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Fix dangerous CASCADE deletes on shipping_documents:
     * - created_by_user_id: CASCADE → RESTRICT (deleting a user should not wipe their documents)
     * - warehouse_id: CASCADE → RESTRICT (deleting a warehouse should not wipe all docs)
     */
    public function up(): void
    {
        Schema::table('shipping_documents', function (Blueprint $table) {
            // Drop old FK constraints
            $table->dropForeign(['created_by_user_id']);
            $table->dropForeign(['warehouse_id']);

            // Re-add with RESTRICT
            $table->foreign('created_by_user_id')
                ->references('id')->on('users')
                ->restrictOnDelete();

            $table->foreign('warehouse_id')
                ->references('id')->on('warehouses')
                ->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('shipping_documents', function (Blueprint $table) {
            $table->dropForeign(['created_by_user_id']);
            $table->dropForeign(['warehouse_id']);

            $table->foreign('created_by_user_id')
                ->references('id')->on('users')
                ->cascadeOnDelete();

            $table->foreign('warehouse_id')
                ->references('id')->on('warehouses')
                ->cascadeOnDelete();
        });
    }
};
