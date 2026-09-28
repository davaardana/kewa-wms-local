<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DevelopmentSeeder extends Seeder
{
    /**
     * Seed clean development master data only.
     */
    public function run(): void
    {
        $this->call(LaunchSeeder::class);
    }
}
