<?php

use App\Http\Middleware\AuthenticateGateDevice;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->redirectGuestsTo(function (Request $request): ?string {
            return $request->expectsJson() || $request->is('api/*')
                ? null
                : '/';
        });

        $middleware->alias([
            'auth.device' => AuthenticateGateDevice::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })
    ->booted(function (): void {
        // ── #5 Rate Limiting ────────────────────────────────────────────────────

        // Login: 10 percobaan per menit per IP — cegah brute force
        RateLimiter::for('login', function (Request $request): Limit {
            return Limit::perMinute(10)->by($request->ip());
        });

        // Gate events: 120 per menit per device_token — hardware RFID bisa rapid-fire
        RateLimiter::for('gate-events', function (Request $request): Limit {
            return Limit::perMinute(120)->by(
                $request->header('X-Device-Token') ?? $request->ip()
            );
        });

        // General API: 300 per menit per user (Sanctum-authenticated)
        RateLimiter::for('api', function (Request $request): Limit {
            return Limit::perMinute(300)->by(
                $request->user()?->id ?? $request->ip()
            );
        });
    })
    ->create();

