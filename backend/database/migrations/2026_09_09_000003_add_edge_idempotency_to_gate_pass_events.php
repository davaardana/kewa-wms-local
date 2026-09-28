<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('gate_pass_events', function (Blueprint $table) {
            $table->foreignId('gate_device_id')->nullable()->after('id')->constrained('gate_devices')->restrictOnDelete();
            $table->uuid('event_id')->nullable()->after('gate_device_id');
            $table->timestamp('observed_at')->nullable()->after('event_id');
            $table->json('decision_result_json')->nullable()->after('raw_payload');
            $table->unique(['gate_device_id', 'event_id'], 'gate_events_device_event_unique');
        });
    }

    public function down(): void
    {
        Schema::table('gate_pass_events', function (Blueprint $table) {
            $table->dropUnique('gate_events_device_event_unique');
            $table->dropForeign(['gate_device_id']);
            $table->dropColumn(['gate_device_id', 'event_id', 'observed_at', 'decision_result_json']);
        });
    }
};