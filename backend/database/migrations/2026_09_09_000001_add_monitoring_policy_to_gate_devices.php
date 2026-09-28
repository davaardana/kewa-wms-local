<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('gate_devices', function (Blueprint $table) {
            $table->unsignedInteger('internet_downtime_tolerance_seconds')->default(90)->after('metrics_json');
        });
    }

    public function down(): void
    {
        Schema::table('gate_devices', fn (Blueprint $table) => $table->dropColumn('internet_downtime_tolerance_seconds'));
    }
};