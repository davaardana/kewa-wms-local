<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Shipping Documents: Core workflow table for PM → PIC Lapangan goods flow.
     * PM creates a document (items + qty), PIC Lapangan assigns RFID tags,
     * system matches scanned tags at gate against document expectations.
     */
    public function up(): void
    {
        // Shipping Documents (Dokumen Barang Masuk/Keluar)
        Schema::create('shipping_documents', function (Blueprint $table) {
            $table->id();
            $table->string('document_number', 100)->unique();
            $table->string('type', 20); // inbound, outbound
            $table->string('status', 30)->default('draft'); // draft, approved, in_progress, completed, cancelled
            $table->foreignId('created_by_user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('approved_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->foreignId('warehouse_id')->constrained('warehouses')->cascadeOnDelete();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['status', 'type']);
            $table->index(['warehouse_id', 'status']);
        });

        // Shipping Document Items (Daftar Barang + Jumlah dari PM)
        Schema::create('shipping_document_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('shipping_document_id')->constrained('shipping_documents')->cascadeOnDelete();
            $table->foreignId('item_id')->constrained('items')->cascadeOnDelete();
            $table->integer('expected_qty')->default(0); // Jumlah yang diharapkan PM
            $table->integer('scanned_qty')->default(0);  // Jumlah tag yang sudah terbaca di gate
            $table->timestamps();

            $table->unique(['shipping_document_id', 'item_id']);
        });

        // Shipping Document Tags (Tag RFID yang di-assign ke dokumen)
        Schema::create('shipping_document_tags', function (Blueprint $table) {
            $table->id();
            $table->foreignId('shipping_document_id')->constrained('shipping_documents')->cascadeOnDelete();
            $table->foreignId('shipping_document_item_id')->constrained('shipping_document_items')->cascadeOnDelete();
            $table->foreignId('rfid_tag_id')->constrained('rfid_tags')->cascadeOnDelete();
            $table->string('tag_epc', 64)->index(); // Denormalized for fast lookup
            $table->timestamp('scanned_at')->nullable(); // Terisi saat tag terbaca di gate
            $table->string('status', 20)->default('expected'); // expected, scanned, missing
            $table->timestamps();

            $table->unique(['shipping_document_id', 'rfid_tag_id']);
            $table->index(['tag_epc', 'status']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('shipping_document_tags');
        Schema::dropIfExists('shipping_document_items');
        Schema::dropIfExists('shipping_documents');
    }
};
