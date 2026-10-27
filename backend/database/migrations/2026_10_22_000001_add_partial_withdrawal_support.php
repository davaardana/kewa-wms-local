<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Solusi 2 – Partial/Multi-Withdrawal per RFID tag (length-based items, e.g. cable drums).
 *
 * Kolom baru:
 *  1. items.is_length_based           BOOLEAN  – item diukur per meter (kabel, selang, dll.)
 *  2. rfid_tags.total_length_m        DECIMAL  – total panjang drum saat dipasang tag
 *  3. rfid_tags.remaining_length_m    DECIMAL  – sisa panjang yang belum dikeluarkan
 *  4. shipping_document_tags.length_dispatched  DECIMAL – meter yang diambil dalam dokumen ini
 *  5. custody_ledger.quantity_value   DECIMAL  – kuantitas event (meter untuk partial-withdrawal)
 */
return new class extends Migration
{
    public function up(): void
    {
        // ── 1. items ─────────────────────────────────────────────────────────────
        Schema::table('items', function (Blueprint $table) {
            if (!Schema::hasColumn('items', 'is_length_based')) {
                $table->boolean('is_length_based')
                      ->default(false)
                      ->after('is_serialized_tag');
            }
        });

        // ── 2 & 3. rfid_tags ────────────────────────────────────────────────────
        Schema::table('rfid_tags', function (Blueprint $table) {
            if (!Schema::hasColumn('rfid_tags', 'total_length_m')) {
                $table->decimal('total_length_m', 12, 3)
                      ->nullable()
                      ->after('notes');
            }
            if (!Schema::hasColumn('rfid_tags', 'remaining_length_m')) {
                $table->decimal('remaining_length_m', 12, 3)
                      ->nullable()
                      ->after('total_length_m');
            }
        });

        // ── 4. shipping_document_tags ────────────────────────────────────────────
        Schema::table('shipping_document_tags', function (Blueprint $table) {
            if (!Schema::hasColumn('shipping_document_tags', 'length_dispatched')) {
                $table->decimal('length_dispatched', 12, 3)
                      ->nullable()
                      ->after('status');
            }
        });

        // ── 5. custody_ledger ────────────────────────────────────────────────────
        Schema::table('custody_ledger', function (Blueprint $table) {
            if (!Schema::hasColumn('custody_ledger', 'quantity_value')) {
                $table->decimal('quantity_value', 12, 3)
                      ->nullable()
                      ->after('notes');
            }
        });
    }

    public function down(): void
    {
        Schema::table('custody_ledger', function (Blueprint $table) {
            if (Schema::hasColumn('custody_ledger', 'quantity_value'))
                $table->dropColumn('quantity_value');
        });
        Schema::table('shipping_document_tags', function (Blueprint $table) {
            if (Schema::hasColumn('shipping_document_tags', 'length_dispatched'))
                $table->dropColumn('length_dispatched');
        });
        Schema::table('rfid_tags', function (Blueprint $table) {
            if (Schema::hasColumn('rfid_tags', 'remaining_length_m'))
                $table->dropColumn('remaining_length_m');
            if (Schema::hasColumn('rfid_tags', 'total_length_m'))
                $table->dropColumn('total_length_m');
        });
        Schema::table('items', function (Blueprint $table) {
            if (Schema::hasColumn('items', 'is_length_based'))
                $table->dropColumn('is_length_based');
        });
    }
};
