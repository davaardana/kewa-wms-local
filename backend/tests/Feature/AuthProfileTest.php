<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthProfileTest extends TestCase
{
    use RefreshDatabase;

    public function test_every_role_can_update_only_its_own_profile(): void
    {
        foreach (['superadmin', 'management', 'pm', 'procurement', 'storeroom', 'pic_lapangan'] as $role) {
            $user = User::factory()->create(['role' => $role, 'is_active' => true]);

            $this->actingAs($user)->putJson('/api/auth/profile', [
                'name' => "Updated {$role}",
                'email' => "updated.{$role}@mosa.id",
                'phone' => '08123456789',
                'role' => 'superadmin',
                'is_active' => false,
            ])->assertOk()->assertJsonPath('user.role', $role);

            $user->refresh();
            $this->assertSame($role, $user->role);
            $this->assertTrue($user->is_active);
        }
    }

    public function test_password_change_requires_current_password_and_confirmation(): void
    {
        $user = User::factory()->create(['password' => 'password123']);

        $this->actingAs($user)->putJson('/api/auth/password', [
            'current_password' => 'wrong-password',
            'password' => 'new-password-123',
            'password_confirmation' => 'new-password-123',
        ])->assertUnprocessable()->assertJsonValidationErrors('current_password');

        $this->actingAs($user)->putJson('/api/auth/password', [
            'current_password' => 'password123',
            'password' => 'new-password-123',
            'password_confirmation' => 'different-password',
        ])->assertUnprocessable()->assertJsonValidationErrors('password');

        $this->actingAs($user)->putJson('/api/auth/password', [
            'current_password' => 'password123',
            'password' => 'new-password-123',
            'password_confirmation' => 'new-password-123',
        ])->assertOk();

        $this->assertTrue(Hash::check('new-password-123', $user->fresh()->password));
    }

    public function test_profile_routes_require_authentication_and_unique_email(): void
    {
        $this->putJson('/api/auth/profile', [])->assertUnauthorized();
        $this->putJson('/api/auth/password', [])->assertUnauthorized();

        $user = User::factory()->create();
        $other = User::factory()->create();

        $this->actingAs($user)->putJson('/api/auth/profile', [
            'name' => $user->name,
            'email' => $other->email,
            'phone' => null,
        ])->assertUnprocessable()->assertJsonValidationErrors('email');
    }
}