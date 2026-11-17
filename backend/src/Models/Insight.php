<?php

namespace FinanceHub\Models;

use FinanceHub\Config\Database;
use PDO;

class Insight
{
    public static function findAllByUser(int $userId, int $limit = 20): array
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT * FROM insights WHERE user_id = ? AND is_dismissed = FALSE ORDER BY created_at DESC LIMIT ?'
        );
        $stmt->execute([$userId, $limit]);
        return $stmt->fetchAll();
    }

    public static function create(array $data): int
    {
        $stmt = Database::getConnection()->prepare(
            'INSERT INTO insights (user_id, type, message, supporting_data) VALUES (?, ?, ?, ?)'
        );
        $stmt->execute([
            $data['user_id'],
            $data['type'],
            $data['message'],
            isset($data['supporting_data']) ? json_encode($data['supporting_data']) : null,
        ]);
        return (int)Database::getConnection()->lastInsertId();
    }

    /**
     * True when the same insight (type + message) was already stored for this
     * user within $hours — prevents duplicate rows on repeated generation.
     */
    public static function existsRecent(int $userId, string $type, string $message, int $hours = 24): bool
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT id FROM insights
             WHERE user_id = ? AND type = ? AND message = ?
               AND created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
             LIMIT 1'
        );
        $stmt->execute([$userId, $type, $message, $hours]);
        return (bool)$stmt->fetch();
    }

    public static function markAsRead(int $id): void
    {
        Database::getConnection()->prepare('UPDATE insights SET is_read = TRUE WHERE id = ?')->execute([$id]);
    }

    public static function dismiss(int $id, int $userId): void
    {
        Database::getConnection()->prepare('UPDATE insights SET is_dismissed = TRUE WHERE id = ? AND user_id = ?')->execute([$id, $userId]);
    }
}
