<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('shipping_document_tags', function (Blueprint $table) {
            $table->dropForeign(['rfid_tag_id']);
            $table->unsignedBigInteger('rfid_tag_id')->nullable()->change();
            $table->foreign('rfid_tag_id')->references('id')->on('rfid_tags')->nullOnDelete();
        });
    }

    public function down(): void
    {
        if (DB::table('shipping_document_tags')->whereNull('rfid_tag_id')->exists()) {
            throw new RuntimeException('Cannot restore the non-null RFID tag foreign key after registry tags were deleted.');
        }

        Schema::table('shipping_document_tags', function (Blueprint $table) {
            $table->dropForeign(['rfid_tag_id']);
            $table->unsignedBigInteger('rfid_tag_id')->nullable(false)->change();
            $table->foreign('rfid_tag_id')->references('id')->on('rfid_tags')->cascadeOnDelete();
        });
    }
};