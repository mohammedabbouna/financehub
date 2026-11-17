<?php

namespace FinanceHub\Models;

use FinanceHub\Config\Database;

class Notification
{
    /** @return array<int, array<string, mixed>> */
    public static function findAllByUser(int $userId, int $limit = 30): array
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT * FROM notifications
             WHERE user_id = ?
             ORDER BY is_read ASC, created_at DESC
             LIMIT ' . max(1, min(100, $limit))
        );
        $stmt->execute([$userId]);
        return $stmt->fetchAll();
    }

    public static function unreadCount(int $userId): int
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = FALSE'
        );
        $stmt->execute([$userId]);
        return (int)$stmt->fetchColumn();
    }

    /**
     * Create a notification unless one with the same dedup key already exists
     * for this user. Returns the new id, or 0 when it was skipped.
     */
    public static function createUnique(array $data): int
    {
        $refKey = $data['ref_key'] ?? null;
        if (is_string($refKey) && $refKey !== '') {
            $stmt = Database::getConnection()->prepare(
                'SELECT id FROM notifications WHERE user_id = ? AND ref_key = ? LIMIT 1'
            );
            $stmt->execute([$data['user_id'], $refKey]);
            if ($stmt->fetch()) {
                return 0;
            }
        }

        $stmt = Database::getConnection()->prepare(
            'INSERT INTO notifications (user_id, type, title, body, link, ref_key)
             VALUES (?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $data['user_id'],
            $data['type'],
            $data['title'],
            $data['body'],
            $data['link'] ?? null,
            is_string($refKey) && $refKey !== '' ? mb_substr($refKey, 0, 120) : null,
        ]);
        return (int)Database::getConnection()->lastInsertId();
    }

    /** @return bool true when the row existed and was updated */
    public static function markAsRead(int $id, int $userId): bool
    {
        $stmt = Database::getConnection()->prepare(
            'UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ? AND is_read = FALSE'
        );
        $stmt->execute([$id, $userId]);
        return $stmt->rowCount() > 0;
    }

    public static function markAllAsRead(int $userId): void
    {
        Database::getConnection()->prepare(
            'UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE'
        )->execute([$userId]);
    }

    /** Housekeeping: drop read notifications older than $days (worker task). */
    public static function pruneRead(int $days = 60): int
    {
        $stmt = Database::getConnection()->prepare(
            'DELETE FROM notifications WHERE is_read = TRUE AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)'
        );
        $stmt->execute([$days]);
        return $stmt->rowCount();
    }
}
