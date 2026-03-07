<?php
/**
 * Auth — Simple API key authentication for the fiscal microservice.
 *
 * The key is set via FISCAL_API_KEY env var in docker-compose.yml.
 * The SOSApp sends it via X-Api-Key header.
 */

declare(strict_types=1);

namespace App;

class Auth
{
    public static function check(): bool
    {
        $expected = getenv('FISCAL_API_KEY') ?: '';
        if (empty($expected)) {
            // If no key configured, allow all (dev mode)
            return true;
        }

        // Check X-Api-Key header
        $headers = getallheaders();
        $apiKey = $headers['X-Api-Key'] ?? $headers['x-api-key'] ?? '';
        if (!empty($apiKey) && hash_equals($expected, $apiKey)) {
            return true;
        }

        // Check Authorization: Bearer <key>
        $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
        if (str_starts_with($authHeader, 'Bearer ')) {
            $token = substr($authHeader, 7);
            if (hash_equals($expected, $token)) {
                return true;
            }
        }

        return false;
    }
}
