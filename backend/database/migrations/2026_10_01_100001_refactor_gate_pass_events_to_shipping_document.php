<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Refactor gate_pass_events:
 * - Drop gate_transaction_id (GateTransaction removed)
 * - Add shipping_document_id (new core reference)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('gate_pass_events', function (Blueprint $table) {
            // Drop old FK to gate_transactions
            $table->dropConstrainedForeignId('gate_transaction_id');

            // Add FK to shipping_documents
            $table->foreignId('shipping_document_id')
                ->nullable()
                ->after('event_id')
                ->constrained('shipping_documents')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('gate_pass_events', function (Blueprint $table) {
            $table->dropConstrainedForeignId('shipping_document_id');
            $table->foreignId('gate_transaction_id')
                ->nullable()
                ->constrained('gate_transactions')
                ->nullOnDelete();
        });
    }
};
