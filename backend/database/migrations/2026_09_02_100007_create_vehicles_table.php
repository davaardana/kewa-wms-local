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
        Schema::create('vehicles', function (Blueprint $table) {
            $table->id();
            $table->string('plate_number', 50)->unique();
            $table->string('vehicle_type', 50)->default('truck_medium'); // pickup, truck_medium, truck_heavy, trailer
            $table->string('driver_name', 150)->nullable();
            $table->string('driver_phone', 50)->nullable();
            $table->string('transporter_name', 150)->nullable(); // Expedisi / Vendor Logistik
            $table->integer('max_pole_capacity')->default(50);
            $table->boolean('is_active')->default(true);
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('vehicles');
    }
};
