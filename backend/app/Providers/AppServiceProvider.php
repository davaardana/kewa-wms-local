<?php

namespace App\Providers;

use App\Models\ShippingDocument;
use App\Models\User;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Schema::defaultStringLength(191);

        // ── #1: Terpusat Gate Definitions ─────────────────────────────────────
        // Menggantikan pengecekan role inline di setiap controller method.
        // Satu tempat → satu fix untuk semua endpoint terkait.

        // Superadmin bisa semua hal
        Gate::before(fn (User $user) => $user->role === 'superadmin' ? true : null);

        // Shipping Documents
        Gate::define('shipping-document:create',  fn (User $u) => in_array($u->role, ['pm', 'superadmin']));
        Gate::define('shipping-document:approve', fn (User $u) => in_array($u->role, ['pm', 'superadmin']));
        Gate::define('shipping-document:cancel',  fn (User $u) => in_array($u->role, ['pm', 'superadmin']));
        Gate::define('shipping-document:update',  fn (User $u) => in_array($u->role, ['pm', 'superadmin']));
        Gate::define('shipping-document:archive', fn (User $u) => $u->role === 'superadmin');
        Gate::define('shipping-document:assign-tags', fn (User $u) => in_array($u->role, ['pic_lapangan', 'pm', 'superadmin']));
        Gate::define('shipping-document:complete',    fn (User $u) => in_array($u->role, ['pic_lapangan', 'superadmin']));
        Gate::define('shipping-document:reconcile',   fn (User $u) => in_array($u->role, ['pm', 'superadmin']));

        // Master Data
        Gate::define('master-data:write', fn (User $u) => in_array($u->role, ['pm', 'superadmin']));

        // User & Role Management
        Gate::define('users:manage', fn (User $u) => $u->role === 'superadmin');
    }
}
