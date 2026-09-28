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
        // Gate Transactions (Session Approval for Gate Access)
        Schema::create('gate_transactions', function (Blueprint $table) {
            $table->id();
            $table->string('transaction_number', 100)->unique();
            $table->foreignId('work_order_id')->constrained('work_orders')->cascadeOnDelete();
            $table->foreignId('warehouse_id')->constrained('warehouses')->cascadeOnDelete();
            $table->foreignId('pic_user_id')->constrained('users')->cascadeOnDelete(); // Personal PIC Login
            $table->string('type', 50)->default('OUT_FULFILLMENT'); // OUT_FULFILLMENT, IN_RETURN
            $table->string('status', 50)->default('pending_approval'); // pending_approval, approved, rejected, completed, cancelled, expired
            $table->boolean('is_auto_approved')->default(false);
            $table->foreignId('approved_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->text('rejection_reason')->nullable();
            $table->timestamp('valid_until')->nullable(); // Session expiration (e.g. valid for 30 minutes)
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        // Gate Transaction Items
        Schema::create('gate_transaction_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('gate_transaction_id')->constrained('gate_transactions')->cascadeOnDelete();
            $table->foreignId('item_id')->constrained('items')->cascadeOnDelete();
            $table->integer('requested_qty')->default(0);
            $table->integer('passed_qty')->default(0);
            $table->string('returned_condition', 50)->default('good'); // good, damaged, scrap
            $table->timestamps();
        });

        // Physical Gate Pass Events (Triggered by IoT Gate Reader / CCTV)
        Schema::create('gate_pass_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('gate_transaction_id')->nullable()->constrained('gate_transactions')->nullOnDelete();
            $table->foreignId('warehouse_id')->constrained('warehouses')->cascadeOnDelete();
            $table->string('gate_id', 50)->default('GATE-01');
            $table->string('direction', 20); // OUT, IN
            $table->string('antenna_sequence', 20); // A_TO_B (out), B_TO_A (in)
            $table->json('tag_epcs_json'); // array of EPCs detected
            $table->integer('total_tags_detected')->default(0);
            $table->string('cctv_snapshot_path', 255)->nullable();
            $table->boolean('is_valid')->default(true);
            $table->boolean('mismatch_flag')->default(false);
            $table->text('mismatch_details')->nullable();
            $table->json('raw_payload')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('gate_pass_events');
        Schema::dropIfExists('gate_transaction_items');
        Schema::dropIfExists('gate_transactions');
    }
};
