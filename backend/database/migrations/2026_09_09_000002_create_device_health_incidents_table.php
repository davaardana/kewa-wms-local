<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('device_health_incidents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('gate_device_id')->constrained('gate_devices')->cascadeOnDelete();
            $table->uuid('event_id')->unique();
            $table->string('component', 20);
            $table->string('status', 30);
            $table->string('reason', 500)->nullable();
            $table->timestamp('observed_at');
            $table->timestamp('received_at');
            $table->timestamps();
            $table->index(['gate_device_id', 'observed_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('device_health_incidents');
    }
};