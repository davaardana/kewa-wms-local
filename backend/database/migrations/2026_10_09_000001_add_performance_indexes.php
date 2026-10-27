<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * #5 Percepatan: Performance indexes untuk audit trail & gate event queries.
 *
 * custody_ledger:
 *   - (tag_epc)                          → auditTrail filter by EPC
 *   - (item_id, created_at)              → stockCard running balance
 *   - (holder_user_id)                   → auditTrail filter by holder
 *   - (warehouse_id, action, created_at) → stockSummary & stockCard combo
 *
 * gate_pass_events:
 *   - (warehouse_id, id)      → liveFeed & SSE stream polling (hot path)
 *   - (shipping_document_id)  → GateEngineService cumulative EPC lookup
 *   - (mismatch_flag, created_at) → dashboardKpis recent_mismatches
 *
 * shipping_document_tags:
 *   - (rfid_tag_id)               → assignTags cross-doc active check
 *   - (shipping_document_item_id) → assignTags quota check
 */
return new class extends Migration
{
    public function up(): void
    {
        // ── custody_ledger ──────────────────────────────────────────────────────
        Schema::table('custody_ledger', function (Blueprint $table) {
            if (!$this->pgIndexExists('custody_ledger', 'cl_tag_epc_idx')) {
                $table->index('tag_epc', 'cl_tag_epc_idx');
            }
            if (!$this->pgIndexExists('custody_ledger', 'cl_item_created_idx')) {
                $table->index(['item_id', 'created_at'], 'cl_item_created_idx');
            }
            if (!$this->pgIndexExists('custody_ledger', 'cl_holder_idx')) {
                $table->index('holder_user_id', 'cl_holder_idx');
            }
            if (!$this->pgIndexExists('custody_ledger', 'cl_wh_action_created_idx')) {
                $table->index(['warehouse_id', 'action', 'created_at'], 'cl_wh_action_created_idx');
            }
        });

        // ── gate_pass_events ────────────────────────────────────────────────────
        Schema::table('gate_pass_events', function (Blueprint $table) {
            if (!$this->pgIndexExists('gate_pass_events', 'gpe_wh_id_desc_idx')) {
                $table->index(['warehouse_id', 'id'], 'gpe_wh_id_desc_idx');
            }
            if (!$this->pgIndexExists('gate_pass_events', 'gpe_shipping_doc_idx')) {
                $table->index('shipping_document_id', 'gpe_shipping_doc_idx');
            }
            if (!$this->pgIndexExists('gate_pass_events', 'gpe_mismatch_created_idx')) {
                $table->index(['mismatch_flag', 'created_at'], 'gpe_mismatch_created_idx');
            }
        });

        // ── shipping_document_tags ──────────────────────────────────────────────
        Schema::table('shipping_document_tags', function (Blueprint $table) {
            if (!$this->pgIndexExists('shipping_document_tags', 'sdt_rfid_tag_idx')) {
                $table->index('rfid_tag_id', 'sdt_rfid_tag_idx');
            }
            if (!$this->pgIndexExists('shipping_document_tags', 'sdt_doc_item_idx')) {
                $table->index('shipping_document_item_id', 'sdt_doc_item_idx');
            }
        });
    }

    public function down(): void
    {
        Schema::table('custody_ledger', function (Blueprint $table) {
            if ($this->pgIndexExists('custody_ledger', 'cl_tag_epc_idx')) $table->dropIndex('cl_tag_epc_idx');
            if ($this->pgIndexExists('custody_ledger', 'cl_item_created_idx')) $table->dropIndex('cl_item_created_idx');
            if ($this->pgIndexExists('custody_ledger', 'cl_holder_idx')) $table->dropIndex('cl_holder_idx');
            if ($this->pgIndexExists('custody_ledger', 'cl_wh_action_created_idx')) $table->dropIndex('cl_wh_action_created_idx');
        });

        Schema::table('gate_pass_events', function (Blueprint $table) {
            if ($this->pgIndexExists('gate_pass_events', 'gpe_wh_id_desc_idx')) $table->dropIndex('gpe_wh_id_desc_idx');
            if ($this->pgIndexExists('gate_pass_events', 'gpe_shipping_doc_idx')) $table->dropIndex('gpe_shipping_doc_idx');
            if ($this->pgIndexExists('gate_pass_events', 'gpe_mismatch_created_idx')) $table->dropIndex('gpe_mismatch_created_idx');
        });

        Schema::table('shipping_document_tags', function (Blueprint $table) {
            if ($this->pgIndexExists('shipping_document_tags', 'sdt_rfid_tag_idx')) $table->dropIndex('sdt_rfid_tag_idx');
            if ($this->pgIndexExists('shipping_document_tags', 'sdt_doc_item_idx')) $table->dropIndex('sdt_doc_item_idx');
        });
    }

    /**
     * Check if an index exists using PostgreSQL information_schema.
     * Compatible with Laravel 10/11/13 — does NOT use deprecated getDoctrineSchemaManager().
     * Returns false immediately when running on SQLite (e.g. in-memory test DB).
     */
    private function pgIndexExists(string $table, string $indexName): bool
    {
        if (DB::getDriverName() !== 'pgsql') {
            return false;
        }
        $result = DB::selectOne(
            "SELECT 1 FROM pg_indexes WHERE tablename = ? AND indexname = ? LIMIT 1",
            [$table, $indexName]
        );
        return $result !== null;
    }
};
