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
        // Work Orders (WO)
        Schema::create('work_orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained('projects')->cascadeOnDelete();
            $table->foreignId('warehouse_id')->constrained('warehouses')->cascadeOnDelete();
            $table->foreignId('pm_user_id')->constrained('users')->cascadeOnDelete();
            $table->string('wo_number', 100)->unique();
            $table->string('title', 191);
            $table->string('status', 50)->default('draft'); // draft, pending_approval, approved, in_progress, completed, cancelled
            $table->foreignId('approved_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->date('target_completion_date')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        // Bill of Quantities (BOQ Items - Quota Lock)
        Schema::create('boq_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('work_order_id')->constrained('work_orders')->cascadeOnDelete();
            $table->foreignId('item_id')->constrained('items')->cascadeOnDelete();
            $table->integer('quota_qty')->default(0); // Quota approved by PM (IMMUTABLE by storeroom)
            $table->integer('prepared_qty')->default(0); // Reported by storeroom
            $table->integer('withdrawn_qty')->default(0); // Passed out via Gate
            $table->integer('returned_qty')->default(0); // Returned back via Gate & verified
            $table->integer('installed_qty')->default(0); // Reported installed by PIC Lapangan
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('boq_items');
        Schema::dropIfExists('work_orders');
    }
};
