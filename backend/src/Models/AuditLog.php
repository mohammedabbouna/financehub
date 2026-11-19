<?php
namespace FinanceHub\Models;

use FinanceHub\Config\Database;

class AuditLog
{
    public static function record(?int $userId, string $action, string $entity, ?int $entityId = null, ?array $diff = null, ?string $ip = null): void
    {
        try {
            Database::getConnection()->prepare(
                'INSERT INTO audit_log (user_id, action, entity, entity_id, diff, ip) VALUES (?, ?, ?, ?, ?, ?)'
            )->execute([
                $userId,
                $action,
                $entity,
                $entityId,
                $diff !== null ? json_encode($diff, JSON_UNESCAPED_UNICODE) : null,
                $ip,
            ]);
        } catch (\Throwable $e) {
            // never break the request on audit failure
        }
    }

    public static function listByUser(int $userId, int $limit = 100): array
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT * FROM audit_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
        );
        $stmt->execute([$userId, $limit]);
        return $stmt->fetchAll();
    }

    public static function listAll(int $limit = 200): array
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?'
        );
        $stmt->execute([$limit]);
        return $stmt->fetchAll();
    }
}
