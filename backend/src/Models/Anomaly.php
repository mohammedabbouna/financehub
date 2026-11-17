<?php

namespace FinanceHub\Models;

use FinanceHub\Config\Database;
use PDO;

class Anomaly
{
    public static function findAllByUser(int $userId, ?string $severity = null): array
    {
        $sql = 'SELECT a.*, ac.description, ac.amount, ac.date, ac.type as action_type,
                       c.name as category_name
                FROM anomalies a
                LEFT JOIN actions ac ON a.action_id = ac.id
                LEFT JOIN categories c ON ac.category_id = c.id
                WHERE a.user_id = ?';
        $params = [$userId];
        if ($severity) {
            $sql .= ' AND a.severity = ?';
            $params[] = $severity;
        }
        $sql .= ' ORDER BY a.created_at DESC LIMIT 50';
        $stmt = Database::getConnection()->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public static function create(array $data): int
    {
        $stmt = Database::getConnection()->prepare(
            'INSERT INTO anomalies (user_id, action_id, reason, severity, supporting_data)
             VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $data['user_id'],
            $data['action_id'] ?? null,
            $data['reason'],
            $data['severity'] ?? 'medium',
            isset($data['supporting_data']) ? json_encode($data['supporting_data']) : null,
        ]);
        return (int)Database::getConnection()->lastInsertId();
    }

    public static function markAsRead(int $id, int $userId): void
    {
        Database::getConnection()->prepare('UPDATE anomalies SET is_read = TRUE WHERE id = ? AND user_id = ?')->execute([$id, $userId]);
    }
}
