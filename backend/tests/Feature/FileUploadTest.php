<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FileUploadTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_user_can_upload_physical_proof(): void
    {
        Storage::fake('public');
        Sanctum::actingAs(User::factory()->create());

        $response = $this->post('/api/upload', [
            'file' => UploadedFile::fake()->create('proof.pdf', 10, 'application/pdf'),
            'folder' => 'delivery_proofs',
        ]);

        $response->assertCreated()
            ->assertJsonPath('original_name', 'proof.pdf')
            ->assertJsonPath('mime_type', 'application/pdf')
            ->assertJsonPath('url', fn (string $url) => str_starts_with($url, '/storage/uploads/delivery_proofs/'));

        Storage::disk('public')->assertExists(
            str_replace('/storage/', '', $response->json('url'))
        );
    }

    public function test_upload_rejects_unsupported_file_types(): void
    {
        Storage::fake('public');
        Sanctum::actingAs(User::factory()->create());

        $this->post('/api/upload', [
            'file' => UploadedFile::fake()->create('payload.exe', 1, 'application/octet-stream'),
            'folder' => 'general',
        ])->assertUnprocessable();
    }
}