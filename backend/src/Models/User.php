<?php

namespace FinanceHub\Models;

use FinanceHub\Config\Database;
use PDO;

class User
{
    public static function findById(int $id): ?array
    {
        $stmt = Database::getConnection()->prepare('SELECT id, name, email, created_at, ai_api_key, ai_provider, ai_base_url, ai_model, totp_enabled, business_mode FROM users WHERE id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public static function getAiApiKey(int $id): ?string
    {
        $stmt = Database::getConnection()->prepare('SELECT ai_api_key FROM users WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) return null;
        $key = $row['ai_api_key'];
        return ($key === null || $key === '') ? null : $key;
    }

    public static function setAiApiKey(int $id, ?string $key): void
    {
        Database::getConnection()
            ->prepare('UPDATE users SET ai_api_key = ? WHERE id = ?')
            ->execute([$key === null || trim($key) === '' ? null : trim($key), $id]);
    }

    public static function getAiProvider(int $id): string
    {
        $stmt = Database::getConnection()->prepare('SELECT ai_provider FROM users WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        $p = $row['ai_provider'] ?? null;
        return ($p === null || $p === '') ? 'anthropic' : $p;
    }

    public static function setAiProvider(int $id, ?string $provider): void
    {
        $allowed = ['anthropic', 'openai', 'groq', 'openai-compatible'];
        if ($provider !== null && !in_array($provider, $allowed, true)) {
            $provider = 'anthropic';
        }
        Database::getConnection()
            ->prepare('UPDATE users SET ai_provider = ? WHERE id = ?')
            ->execute([$provider, $id]);
    }

    public static function getAiBaseUrl(int $id): ?string
    {
        $stmt = Database::getConnection()->prepare('SELECT ai_base_url FROM users WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        $v = $row['ai_base_url'] ?? null;
        return ($v === null || $v === '') ? null : $v;
    }

    public static function setAiBaseUrl(int $id, ?string $url): void
    {
        Database::getConnection()
            ->prepare('UPDATE users SET ai_base_url = ? WHERE id = ?')
            ->execute([$url === null || trim($url) === '' ? null : trim($url), $id]);
    }

    public static function getAiModel(int $id): ?string
    {
        $stmt = Database::getConnection()->prepare('SELECT ai_model FROM users WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        $v = $row['ai_model'] ?? null;
        return ($v === null || $v === '') ? null : $v;
    }

    public static function setAiModel(int $id, ?string $model): void
    {
        Database::getConnection()
            ->prepare('UPDATE users SET ai_model = ? WHERE id = ?')
            ->execute([$model === null || trim($model) === '' ? null : trim($model), $id]);
    }

    public static function findByEmail(string $email): ?array
    {
        $stmt = Database::getConnection()->prepare('SELECT * FROM users WHERE email = ?');
        $stmt->execute([$email]);
        return $stmt->fetch() ?: null;
    }

    /** Full row (includes password_hash) — for credential checks only. */
    public static function findWithHash(int $id): ?array
    {
        $stmt = Database::getConnection()->prepare('SELECT * FROM users WHERE id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public static function create(string $name, string $email, string $passwordHash): int
    {
        $stmt = Database::getConnection()->prepare(
            'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)'
        );
        $stmt->execute([$name, $email, $passwordHash]);
        return (int)Database::getConnection()->lastInsertId();
    }

    /** Update profile fields (name and/or email). */
    public static function update(int $id, array $data): void
    {
        $sets = [];
        $params = [];
        foreach (['name', 'email'] as $field) {
            if (array_key_exists($field, $data)) {
                $sets[] = "{$field} = ?";
                $params[] = $data[$field];
            }
        }
        if ($sets === []) {
            return;
        }
        $params[] = $id;
        Database::getConnection()
            ->prepare('UPDATE users SET ' . implode(', ', $sets) . ' WHERE id = ?')
            ->execute($params);
    }

    /** Replace the password hash (caller has already verified the old one). */
    public static function changePassword(int $id, string $passwordHash): void
    {
        Database::getConnection()
            ->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
            ->execute([$passwordHash, $id]);
    }

    public static function getTotpSecret(int $id): ?string
    {
        $stmt = Database::getConnection()->prepare('SELECT totp_secret FROM users WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        $v = $row['totp_secret'] ?? null;
        return ($v === null || $v === '') ? null : $v;
    }

    public static function setTotpSecret(int $id, ?string $secret): void
    {
        Database::getConnection()
            ->prepare('UPDATE users SET totp_secret = ? WHERE id = ?')
            ->execute([$secret === null || trim($secret) === '' ? null : trim($secret), $id]);
    }

    public static function isTotpEnabled(int $id): bool
    {
        $stmt = Database::getConnection()->prepare('SELECT totp_enabled FROM users WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        return (bool)($row['totp_enabled'] ?? false);
    }

    public static function setTotpEnabled(int $id, bool $enabled): void
    {
        Database::getConnection()
            ->prepare('UPDATE users SET totp_enabled = ? WHERE id = ?')
            ->execute([$enabled ? 1 : 0, $id]);
    }

    public static function getRecoveryCodes(int $id): array
    {
        $stmt = Database::getConnection()->prepare('SELECT recovery_codes FROM users WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        $v = $row['recovery_codes'] ?? null;
        if ($v === null || $v === '') return [];
        $decoded = json_decode($v, true);
        return is_array($decoded) ? $decoded : [];
    }

    public static function setRecoveryCodes(int $id, array $codes): void
    {
        Database::getConnection()
            ->prepare('UPDATE users SET recovery_codes = ? WHERE id = ?')
            ->execute([json_encode($codes), $id]);
    }

    public static function isBusinessMode(int $id): bool
    {
        $stmt = Database::getConnection()->prepare('SELECT business_mode FROM users WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        return (bool)($row['business_mode'] ?? false);
    }

    public static function setBusinessMode(int $id, bool $enabled): void
    {
        Database::getConnection()
            ->prepare('UPDATE users SET business_mode = ? WHERE id = ?')
            ->execute([$enabled ? 1 : 0, $id]);
    }
}
