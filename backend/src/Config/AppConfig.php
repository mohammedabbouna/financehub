<?php

namespace FinanceHub\Config;

class AppConfig
{
    private static function env(string $key, mixed $default = null): mixed
    {
        return $_ENV[$key] ?? $_SERVER[$key] ?? getenv($key) ?: $default;
    }

    public static function getJwtSecret(): string
    {
        return self::env('JWT_SECRET', 'dev_jwt_secret');
    }

    public static function getJwtExpiry(): int
    {
        return (int)self::env('JWT_EXPIRY', 3600);
    }

    public static function getJwtRefreshExpiry(): int
    {
        return (int)self::env('JWT_REFRESH_EXPIRY', 604800);
    }

    public static function getAnthropicApiKey(): string
    {
        return self::env('ANTHROPIC_API_KEY', '');
    }

    public static function getAnthropicModel(): string
    {
        return self::env('ANTHROPIC_MODEL', 'claude-3-opus-20240229');
    }

    public static function getAiRateLimitMinute(): int
    {
        return (int)self::env('AI_RATE_LIMIT_MINUTE', 10);
    }

    public static function getAiRateLimitDaily(): int
    {
        return (int)self::env('AI_RATE_LIMIT_DAILY', 100);
    }

    public static function getCorsOrigin(): string
    {
        return self::env('BACKEND_CORS_ORIGIN', 'http://localhost,http://localhost:3000');
    }
}
