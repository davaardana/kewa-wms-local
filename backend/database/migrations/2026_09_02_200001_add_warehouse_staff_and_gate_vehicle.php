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
        // 1. Extend warehouses table with PIC, phone & storage capacity
        Schema::table('warehouses', function (Blueprint $table) {
            $table->foreignId('pic_user_id')->nullable()->after('is_active')->constrained('users')->nullOnDelete();
            $table->string('phone', 30)->nullable()->after('pic_user_id');
            $table->integer('capacity')->nullable()->after('phone');
        });

        // 2. Pivot table warehouse_staff for staff assignments
        Schema::create('warehouse_staff', function (Blueprint $table) {
            $table->id();
            $table->foreignId('warehouse_id')->constrained('warehouses')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('role_in_warehouse', 50)->default('staff'); // 'pic', 'staff'
            $table->timestamps();

            $table->unique(['warehouse_id', 'user_id']);
        });

        // 3. Link Work Orders to SPK contracts
        Schema::table('work_orders', function (Blueprint $table) {
            $table->foreignId('spk_id')->nullable()->after('project_id')->constrained('spks')->nullOnDelete();
        });

        // 4. Link Gate Transactions to vehicles and capture plate snapshot
        Schema::table('gate_transactions', function (Blueprint $table) {
            $table->foreignId('vehicle_id')->nullable()->after('pic_user_id')->constrained('vehicles')->nullOnDelete();
            $table->string('plate_number_snapshot', 50)->nullable()->after('vehicle_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('gate_transactions', function (Blueprint $table) {
            $table->dropForeign(['vehicle_id']);
            $table->dropColumn(['vehicle_id', 'plate_number_snapshot']);
        });

        Schema::table('work_orders', function (Blueprint $table) {
            $table->dropForeign(['spk_id']);
            $table->dropColumn('spk_id');
        });

        Schema::dropIfExists('warehouse_staff');

        Schema::table('warehouses', function (Blueprint $table) {
            $table->dropForeign(['pic_user_id']);
            $table->dropColumn(['pic_user_id', 'phone', 'capacity']);
        });
    }
};
