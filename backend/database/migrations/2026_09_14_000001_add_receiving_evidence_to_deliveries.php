<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('deliveries', function (Blueprint $table) {
            $table->string('receiving_proof_photo_url', 255)->nullable()->after('document_url');
            $table->string('receiving_document_url', 255)->nullable()->after('receiving_proof_photo_url');
        });
    }

    public function down(): void
    {
        Schema::table('deliveries', function (Blueprint $table) {
            $table->dropColumn(['receiving_proof_photo_url', 'receiving_document_url']);
        });
    }
};