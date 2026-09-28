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
        // Add custom fields to users table
        Schema::table('users', function (Blueprint $table) {
            $table->string('role', 50)->default('pic_lapangan')->after('email'); // superadmin, pm, procurement, storeroom, pic_lapangan, gate_service
            $table->string('phone', 50)->nullable()->after('role');
            $table->boolean('is_active')->default(true)->after('phone');
        });

        // Principals
        Schema::create('principals', function (Blueprint $table) {
            $table->id();
            $table->string('name', 150);
            $table->string('code', 50)->unique();
            $table->string('contact_person', 100)->nullable();
            $table->string('phone', 50)->nullable();
            $table->string('email', 100)->nullable();
            $table->text('address')->nullable();
            $table->timestamps();
        });

        // Projects
        Schema::create('projects', function (Blueprint $table) {
            $table->id();
            $table->foreignId('principal_id')->nullable()->constrained('principals')->nullOnDelete();
            $table->string('code', 50)->unique();
            $table->string('name', 150);
            $table->string('client_name', 100)->nullable();
            $table->string('location', 150)->nullable();
            $table->string('status', 50)->default('active'); // active, on_hold, completed
            $table->timestamps();
        });

        // Transient / Mobile Project Warehouses
        Schema::create('warehouses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->nullable()->constrained('projects')->nullOnDelete();
            $table->string('code', 50)->unique();
            $table->string('name', 150);
            $table->string('gate_mode', 50)->default('DUAL_ANTENNA_AUTO'); // DUAL_ANTENNA_AUTO, SINGLE_ANTENNA_SESSION
            $table->text('address')->nullable();
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // Items (Material, Tools, Cable, Poles)
        Schema::create('items', function (Blueprint $table) {
            $table->id();
            $table->string('code', 50)->unique();
            $table->string('name', 150);
            $table->string('category', 50); // pole, cable, hardware, tools, accessories
            $table->boolean('is_metal')->default(false);
            $table->boolean('is_reusable')->default(false); // true for tools, false for installed material
            $table->boolean('is_serialized_tag')->default(true); // true: 1 item = 1 tag, false: batch/bag tag or consumable
            $table->string('unit', 30)->default('pcs'); // pcs, meter, roll, set, pack
            $table->integer('min_stock')->default(0);
            $table->text('description')->nullable();
            $table->timestamps();
        });

        // RFID Tag Registry
        Schema::create('rfid_tags', function (Blueprint $table) {
            $table->id();
            $table->string('epc', 64)->unique();
            $table->foreignId('item_id')->constrained('items')->cascadeOnDelete();
            $table->string('tag_type', 50)->default('anti_metal'); // anti_metal, sticker, bag_batch
            $table->string('status', 50)->default('active'); // active, attached, defective, lost, decommissioned
            $table->foreignId('last_warehouse_id')->nullable()->constrained('warehouses')->nullOnDelete();
            $table->timestamp('last_read_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('rfid_tags');
        Schema::dropIfExists('items');
        Schema::dropIfExists('warehouses');
        Schema::dropIfExists('projects');
        Schema::dropIfExists('principals');

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['role', 'phone', 'is_active']);
        });
    }
};
