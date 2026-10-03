<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('shipping_documents', function (Blueprint $table) {
            // Attachments: array of {url, original_name, size, mime_type}
            $table->jsonb('attachments')->nullable()->after('notes');
        });
    }

    public function down(): void
    {
        Schema::table('shipping_documents', function (Blueprint $table) {
            $table->dropColumn('attachments');
        });
    }
};
