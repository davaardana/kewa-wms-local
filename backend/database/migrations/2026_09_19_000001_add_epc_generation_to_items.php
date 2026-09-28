<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->string('epc_prefix', 32)->nullable()->unique()->after('description');
            $table->unsignedTinyInteger('epc_suffix_digits')->default(14)->after('epc_prefix');
            $table->unsignedBigInteger('epc_next_sequence')->default(1)->after('epc_suffix_digits');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropUnique(['epc_prefix']);
            $table->dropColumn(['epc_prefix', 'epc_suffix_digits', 'epc_next_sequence']);
        });
    }
};
