<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Digital Chain of Custody (Immutable Append-Only Audit Ledger)
        Schema::create('custody_ledger', function (Blueprint $table) {
            $table->id();
            $table->string('tag_epc', 64)->nullable()->index();
            $table->foreignId('item_id')->constrained('items')->cascadeOnDelete();
            $table->foreignId('holder_user_id')->constrained('users')->cascadeOnDelete(); // Responsible person
            $table->string('action', 50)->index(); // STOCK_IN, PREPARED, GATE_OUT, FIELD_RECEIVED, INSTALLED, FIELD_RETURN, GATE_IN, AUDIT_OPNAME, DAMAGED_WRITE_OFF, STOCK_WRITE_OFF
            $table->string('ref_type', 100)->nullable(); // Polymorphic model reference (WorkOrder, GateTransaction, Delivery, etc.)
            $table->unsignedBigInteger('ref_id')->nullable();
            $table->foreignId('warehouse_id')->nullable()->constrained('warehouses')->nullOnDelete();
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->string('photo_url', 255)->nullable();
            $table->text('notes')->nullable();
            $table->timestamp('created_at')->useCurrent()->index();

            // Compound index for fast timeline tracing
            $table->index(['ref_type', 'ref_id']);
            $table->index(['item_id', 'created_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('custody_ledger');
    }
};
