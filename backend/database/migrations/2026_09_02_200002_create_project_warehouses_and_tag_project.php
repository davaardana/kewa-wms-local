<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Pivot table project_warehouses (1 Warehouse : N Projects)
        if (!Schema::hasTable('project_warehouses')) {
            Schema::create('project_warehouses', function (Blueprint $table) {
                $table->id();
                $table->foreignId('project_id')->constrained('projects')->cascadeOnDelete();
                $table->foreignId('warehouse_id')->constrained('warehouses')->cascadeOnDelete();
                $table->boolean('is_primary')->default(false);
                $table->timestamps();

                $table->unique(['project_id', 'warehouse_id']);
            });
        }

        // 2. Add project_id to rfid_tags for multi-project stock segregation
        if (Schema::hasTable('rfid_tags') && !Schema::hasColumn('rfid_tags', 'project_id')) {
            Schema::table('rfid_tags', function (Blueprint $table) {
                $table->foreignId('project_id')->nullable()->after('last_warehouse_id')->constrained('projects')->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('project_warehouses');

        if (Schema::hasTable('rfid_tags') && Schema::hasColumn('rfid_tags', 'project_id')) {
            Schema::table('rfid_tags', function (Blueprint $table) {
                $table->dropConstrainedForeignId('project_id');
            });
        }
    }
};
