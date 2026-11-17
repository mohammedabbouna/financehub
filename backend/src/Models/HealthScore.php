<?php

namespace FinanceHub\Models;

use FinanceHub\Config\Database;

/** daily financial_health_scores snapshots. */
class HealthScore
{
    /** True when a snapshot was already stored today (GET /health-score is idempotent). */
    public static function existsToday(int $userId): bool
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT id FROM financial_health_scores WHERE user_id = ? AND DATE(calculated_at) = CURDATE() LIMIT 1'
        );
        $stmt->execute([$userId]);
        return (bool)$stmt->fetch();
    }

    /**
     * Store today's snapshot unless one already exists.
     *
     * @param array{score: int|float, breakdown: array<string, mixed>} $result
     */
    public static function persist(int $userId, array $result): void
    {
        if (self::existsToday($userId)) {
            return;
        }
        $stmt = Database::getConnection()->prepare(
            'INSERT INTO financial_health_scores (user_id, score, breakdown) VALUES (?, ?, ?)'
        );
        $stmt->execute([
            $userId,
            (int)$result['score'],
            json_encode($result['breakdown'] ?? [], JSON_UNESCAPED_UNICODE),
        ]);
    }

    /** @return array<int, array<string, mixed>> */
    public static function history(int $userId, int $limit = 12): array
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT * FROM financial_health_scores WHERE user_id = ?
             ORDER BY calculated_at DESC LIMIT ' . max(1, min(100, $limit))
        );
        $stmt->execute([$userId]);
        return $stmt->fetchAll();
    }
}
