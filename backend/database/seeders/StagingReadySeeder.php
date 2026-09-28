<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class StagingReadySeeder extends Seeder
{
    /**
     * Seed clean staging master data only.
     */
    public function run(): void
    {
        $this->call(LaunchSeeder::class);
    }
}
