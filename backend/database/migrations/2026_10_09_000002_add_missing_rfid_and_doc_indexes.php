<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * #1 Percepatan: Index yang belum ada setelah audit lengkap migrasi lama.
 *
 * Ditemukan hilang:
 *   rfid_tags.(status, last_warehouse_id)
 *     → stockSummary: WHERE status='active' + GROUP BY last_warehouse_id (full scan tanpa ini)
 *     → GateEngine: validasi tag status + lokasi gudang (per EPC dalam loop)
 *
 *   rfid_tags.(item_id, status)
 *     → getItems stock count per item_id
 *     → assignTags availability check per item
 *
 *   shipping_document_items.shipping_document_id
 *     → assignTags, complete: load items per document (N queries tanpa index)
 *
 * Yang SUDAH ada (tidak perlu):
 *   rfid_tags.epc           → unique() constraint = implicit B-tree index
 *   custody_ledger.tag_epc  → ->index() di migrasi awal
 *   custody_ledger.(ref_type, ref_id) → compound index di migrasi awal
 *   custody_ledger.(item_id, created_at) → compound index di migrasi awal
 */
return new class extends Migration
{
    public function up(): void
    {
        // ── rfid_tags ────────────────────────────────────────────────────────────
        Schema::table('rfid_tags', function (Blueprint $table) {
            // stockSummary + GateEngine per-tag status/location check
            if (!$this->pgIndexExists('rfid_tags', 'rt_status_warehouse_idx')) {
                $table->index(['status', 'last_warehouse_id'], 'rt_status_warehouse_idx');
            }
            // getItems stock grouping + assignTags availability per item
            if (!$this->pgIndexExists('rfid_tags', 'rt_item_status_idx')) {
                $table->index(['item_id', 'status'], 'rt_item_status_idx');
            }
        });

        // ── shipping_document_items ─────────────────────────────────────────────
        Schema::table('shipping_document_items', function (Blueprint $table) {
            // assignTags: load document items — FK constraint belum tentu ada index
            if (!$this->pgIndexExists('shipping_document_items', 'sdi_shipping_doc_idx')) {
                $table->index('shipping_document_id', 'sdi_shipping_doc_idx');
            }
        });
    }

    public function down(): void
    {
        Schema::table('rfid_tags', function (Blueprint $table) {
            if ($this->pgIndexExists('rfid_tags', 'rt_status_warehouse_idx')) {
                $table->dropIndex('rt_status_warehouse_idx');
            }
            if ($this->pgIndexExists('rfid_tags', 'rt_item_status_idx')) {
                $table->dropIndex('rt_item_status_idx');
            }
        });

        Schema::table('shipping_document_items', function (Blueprint $table) {
            if ($this->pgIndexExists('shipping_document_items', 'sdi_shipping_doc_idx')) {
                $table->dropIndex('sdi_shipping_doc_idx');
            }
        });
    }

    /** Check index existence via PostgreSQL catalog — compatible with Laravel 13.
     *  Returns false immediately on SQLite (e.g. in-memory test DB). */
    private function pgIndexExists(string $table, string $indexName): bool
    {
        if (DB::getDriverName() !== 'pgsql') {
            return false;
        }
        return DB::selectOne(
            'SELECT 1 FROM pg_indexes WHERE tablename = ? AND indexname = ? LIMIT 1',
            [$table, $indexName]
        ) !== null;
    }
};
