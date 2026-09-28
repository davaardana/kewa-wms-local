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
        // SPK (Surat Perjanjian Kerja / Principal Contracts)
        Schema::create('spks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('principal_id')->constrained('principals')->cascadeOnDelete();
            $table->foreignId('project_id')->nullable()->constrained('projects')->nullOnDelete();
            $table->string('spk_number', 100)->unique();
            $table->string('title', 191);
            $table->decimal('total_amount', 15, 2)->default(0);
            $table->string('payment_status', 50)->default('unpaid'); // unpaid, partial, paid
            $table->json('payment_terms_json')->nullable(); // agile payment terms structure
            $table->string('document_url', 255)->nullable(); // SPK contract PDF / scanned doc
            $table->date('start_date')->nullable();
            $table->date('end_date')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        // SPK Items
        Schema::create('spk_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('spk_id')->constrained('spks')->cascadeOnDelete();
            $table->foreignId('item_id')->constrained('items')->cascadeOnDelete();
            $table->integer('target_qty')->default(0);
            $table->decimal('price_per_unit', 15, 2)->default(0);
            $table->integer('received_qty')->default(0);
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        // Stock-in Deliveries from Principal with Handheld 1 (Dispatch) & Handheld 2 (Receiving) support
        Schema::create('deliveries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('spk_id')->constrained('spks')->cascadeOnDelete();
            $table->foreignId('warehouse_id')->constrained('warehouses')->cascadeOnDelete();
            $table->string('delivery_number', 100)->unique();
            $table->foreignId('received_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('dispatched_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('dispatched_at')->nullable();
            $table->json('dispatch_epcs_json')->nullable(); // Handheld 1: Scanned EPC list at Principal Yard
            $table->json('received_epcs_json')->nullable(); // Handheld 2: Scanned EPC list at Warehouse Receiving
            $table->string('reconciliation_status', 50)->default('pending'); // pending, matched, mismatch
            $table->string('status', 50)->default('pending'); // pending, matched, mismatch_flagged, approved
            $table->string('proof_photo_url', 255)->nullable();
            $table->string('document_url', 255)->nullable(); // Delivery order / Surat Jalan PDF
            $table->timestamp('verified_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        // Delivery Items (Verification vs SPK)
        Schema::create('delivery_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('delivery_id')->constrained('deliveries')->cascadeOnDelete();
            $table->foreignId('item_id')->constrained('items')->cascadeOnDelete();
            $table->integer('spk_qty')->default(0);
            $table->integer('delivered_qty')->default(0);
            $table->integer('difference_qty')->default(0); // delivered_qty - spk_qty
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('delivery_items');
        Schema::dropIfExists('deliveries');
        Schema::dropIfExists('spk_items');
        Schema::dropIfExists('spks');
    }
};
