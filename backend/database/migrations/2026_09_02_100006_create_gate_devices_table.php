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
        Schema::create('gate_devices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('warehouse_id')->constrained('warehouses')->cascadeOnDelete();
            $table->string('device_code', 50)->unique();
            $table->string('device_name', 100);
            $table->string('device_model', 100)->default('ELECTRON_HW-VX6346KL');
            $table->string('ip_address', 50)->nullable();
            $table->unsignedInteger('tcp_port')->default(2077);
            $table->string('status', 20)->default('offline'); // online, offline, warning
            $table->timestamp('last_heartbeat_at')->nullable();
            $table->json('metrics_json')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['warehouse_id', 'status']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('gate_devices');
    }
};
