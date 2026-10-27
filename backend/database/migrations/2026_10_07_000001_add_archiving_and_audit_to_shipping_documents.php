<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('shipping_documents', function (Blueprint $table) {
            $table->timestamp('archived_at')->nullable()->index();
            $table->foreignId('archived_by_user_id')->nullable()->constrained('users')->nullOnDelete();
        });

        Schema::create('shipping_document_audits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('shipping_document_id')->constrained('shipping_documents')->restrictOnDelete();
            $table->foreignId('actor_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('action', 40);
            $table->json('before_json')->nullable();
            $table->json('after_json')->nullable();
            $table->timestamp('created_at')->useCurrent()->index();
            $table->index(['shipping_document_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shipping_document_audits');
        Schema::table('shipping_documents', function (Blueprint $table) {
            $table->dropForeign(['archived_by_user_id']);
            $table->dropColumn(['archived_at', 'archived_by_user_id']);
        });
    }
};
