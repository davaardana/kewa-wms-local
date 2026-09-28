<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class PreparedSeeder extends Seeder
{
    /**
     * Alias for StagingReadySeeder.
     * Reproduces exact live operational state: SPK approved, Delivery matched (14 tags stocked in Gudang Tajur Bogor).
     */
    public function run(): void
    {
        $this->call(StagingReadySeeder::class);
    }
}
