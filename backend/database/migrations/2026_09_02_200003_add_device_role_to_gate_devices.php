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
        Schema::table('gate_devices', function (Blueprint $table) {
            if (!Schema::hasColumn('gate_devices', 'device_role')) {
                $table->string('device_role', 30)->default('gate_controller')->after('device_model'); // gate_controller, enrollment_desktop, hybrid_workstation
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('gate_devices', function (Blueprint $table) {
            if (Schema::hasColumn('gate_devices', 'device_role')) {
                $table->dropColumn('device_role');
            }
        });
    }
};
