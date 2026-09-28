<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('gate_devices', fn (Blueprint $table) => $table->string('edge_ws_url', 2048)->nullable());
    }

    public function down(): void
    {
        Schema::table('gate_devices', fn (Blueprint $table) => $table->dropColumn('edge_ws_url'));
    }
};