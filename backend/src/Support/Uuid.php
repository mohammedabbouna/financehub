<?php

namespace FinanceHub\Support;

/**
 * RFC 4122 v4 UUID using a cryptographically secure random source.
 * Replaces the duplicated mt_rand()-based generators in controllers.
 */
class Uuid
{
    public static function v4(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));
    }
}
