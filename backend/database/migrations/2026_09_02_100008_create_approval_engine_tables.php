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
        // 1. Approval Templates (Master Template Default)
        Schema::create('approval_templates', function (Blueprint $table) {
            $table->id();
            $table->string('name', 150);
            $table->string('code', 50)->unique();
            $table->string('module', 50); // SPK, WORK_ORDER, DELIVERY, RETURN_SCRAP, GATE_ACCESS
            $table->text('description')->nullable();
            $table->boolean('is_default')->default(false);
            $table->decimal('min_amount', 15, 2)->nullable();
            $table->decimal('max_amount', 15, 2)->nullable();
            $table->timestamps();
        });

        // 2. Approval Template Steps (Step per template assigned directly to designated user)
        Schema::create('approval_template_steps', function (Blueprint $table) {
            $table->id();
            $table->foreignId('approval_template_id')->constrained('approval_templates')->cascadeOnDelete();
            $table->unsignedSmallInteger('step_order')->default(1);
            $table->string('step_name', 150);
            $table->foreignId('approver_user_id')->constrained('users')->cascadeOnDelete();
            $table->unsignedInteger('sla_hours')->default(24);
            $table->boolean('can_reject')->default(true);
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(['approval_template_id', 'step_order']);
        });

        // 3. Approval Configs (Per-Project or Per-Warehouse Override Matrix)
        Schema::create('approval_configs', function (Blueprint $table) {
            $table->id();
            $table->string('scope_type', 30); // project, warehouse
            $table->foreignId('project_id')->nullable()->constrained('projects')->cascadeOnDelete();
            $table->foreignId('warehouse_id')->nullable()->constrained('warehouses')->cascadeOnDelete();
            $table->string('module', 50); // SPK, WORK_ORDER, DELIVERY, RETURN_SCRAP, GATE_ACCESS
            $table->boolean('use_template')->default(true);
            $table->foreignId('approval_template_id')->nullable()->constrained('approval_templates')->nullOnDelete();
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['scope_type', 'project_id', 'module']);
            $table->index(['scope_type', 'warehouse_id', 'module']);
        });

        // 4. Approval Config Steps (Custom steps if use_template == false for specific project/warehouse)
        Schema::create('approval_config_steps', function (Blueprint $table) {
            $table->id();
            $table->foreignId('approval_config_id')->constrained('approval_configs')->cascadeOnDelete();
            $table->unsignedSmallInteger('step_order')->default(1);
            $table->string('step_name', 150);
            $table->foreignId('approver_user_id')->constrained('users')->cascadeOnDelete();
            $table->unsignedInteger('sla_hours')->default(24);
            $table->boolean('can_reject')->default(true);
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(['approval_config_id', 'step_order']);
        });

        // 5. Approval Requests (Live Active Requests across system)
        Schema::create('approval_requests', function (Blueprint $table) {
            $table->id();
            $table->string('request_number', 100)->unique();
            $table->string('module', 50); // SPK, WORK_ORDER, DELIVERY, RETURN_SCRAP, GATE_ACCESS
            $table->unsignedBigInteger('reference_id');
            $table->string('reference_code', 100);
            $table->string('title', 191);
            $table->foreignId('project_id')->nullable()->constrained('projects')->nullOnDelete();
            $table->foreignId('warehouse_id')->nullable()->constrained('warehouses')->nullOnDelete();
            $table->foreignId('requester_user_id')->constrained('users')->cascadeOnDelete();
            $table->unsignedSmallInteger('current_step_order')->default(1);
            $table->unsignedSmallInteger('total_steps')->default(1);
            $table->foreignId('current_approver_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('status', 30)->default('pending'); // pending, approved, rejected, revision_requested
            $table->decimal('total_amount', 15, 2)->default(0);
            $table->json('steps_snapshot_json')->nullable(); // Snapshot of steps configuration at creation time
            $table->json('meta_data_json')->nullable();
            $table->timestamp('final_approved_at')->nullable();
            $table->foreignId('final_approved_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['module', 'reference_id']);
            $table->index(['status', 'current_approver_user_id']);
        });

        // 6. Approval Histories (Audit trail of every approval / rejection action)
        Schema::create('approval_histories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('approval_request_id')->constrained('approval_requests')->cascadeOnDelete();
            $table->unsignedSmallInteger('step_order');
            $table->string('step_name', 150);
            $table->foreignId('designated_user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('action_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('action', 30); // approved, rejected, revision_requested, delegated
            $table->text('comments')->nullable();
            $table->timestamp('action_at');
            $table->json('meta_json')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('approval_histories');
        Schema::dropIfExists('approval_requests');
        Schema::dropIfExists('approval_config_steps');
        Schema::dropIfExists('approval_configs');
        Schema::dropIfExists('approval_template_steps');
        Schema::dropIfExists('approval_templates');
    }
};
