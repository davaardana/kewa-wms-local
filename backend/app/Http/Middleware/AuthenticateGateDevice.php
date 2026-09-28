<?php

namespace App\Http\Middleware;

use App\Models\GateDevice;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateGateDevice
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->bearerToken();
        $device = $token
            ? GateDevice::where('api_token_hash', hash('sha256', $token))->where('is_active', true)->first()
            : null;

        if (!$device) {
            return response()->json(['message' => 'Unauthenticated device.'], 401);
        }

        $request->attributes->set('gate_device', $device);

        return $next($request);
    }
}