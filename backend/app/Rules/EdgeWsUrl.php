<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

class EdgeWsUrl implements ValidationRule
{
    public static function isValid(string $value): bool
    {
        // ASCII DNS/IP authority, optional port/path; no browser URL normalization surprises.
        if (strlen($value) > 2048 || preg_match('/[\x00-\x20\x7f-\xff\\\\?#%]/', $value)) {
            return false;
        }
        $parts = parse_url($value);
        return $parts !== false
            && ($parts['scheme'] ?? '') === 'wss'
            && !array_key_exists('user', $parts)
            && !array_key_exists('pass', $parts)
            && isset($parts['host'])
            && filter_var('https://'.substr($value, 6), FILTER_VALIDATE_URL) !== false
            && (!isset($parts['port']) || $parts['port'] >= 1);
    }

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (!is_string($value) || !self::isValid($value)) {
            $fail('Endpoint Edge harus URL wss:// valid tanpa kredensial, query, fragmen, atau karakter terenkode.');
        }
    }
}