<?php

namespace FinanceHub\Models;

use FinanceHub\Config\Database;

class Reconciliation
{
    public static function createSession(int $userId, ?string $filename): int
    {
        $stmt = Database::getConnection()->prepare(
            'INSERT INTO reconciliation_sessions (user_id, filename) VALUES (?, ?)'
        );
        $stmt->execute([$userId, $filename]);
        return (int)Database::getConnection()->lastInsertId();
    }

    public static function findSession(int $id, int $userId): ?array
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT * FROM reconciliation_sessions WHERE id = ? AND user_id = ?'
        );
        $stmt->execute([$id, $userId]);
        return $stmt->fetch() ?: null;
    }

    public static function listSessions(int $userId): array
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT * FROM reconciliation_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
        );
        $stmt->execute([$userId]);
        return $stmt->fetchAll();
    }

    public static function addRows(int $sessionId, array $rows): void
    {
        $stmt = Database::getConnection()->prepare(
            'INSERT INTO reconciliation_rows (session_id, row_date, description, amount, direction) VALUES (?, ?, ?, ?, ?)'
        );
        foreach ($rows as $r) {
            $stmt->execute([
                $sessionId,
                $r['date'],
                $r['description'] ?? null,
                $r['amount'],
                $r['direction'] ?? 'out',
            ]);
        }
    }

    public static function getRows(int $sessionId): array
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT * FROM reconciliation_rows WHERE session_id = ? ORDER BY row_date ASC, id ASC'
        );
        $stmt->execute([$sessionId]);
        return $stmt->fetchAll();
    }

    public static function getRow(int $rowId, int $sessionId): ?array
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT * FROM reconciliation_rows WHERE id = ? AND session_id = ?'
        );
        $stmt->execute([$rowId, $sessionId]);
        return $stmt->fetch() ?: null;
    }

    public static function setMatch(int $rowId, ?int $actionId, string $status): void
    {
        Database::getConnection()->prepare(
            'UPDATE reconciliation_rows SET matched_action_id = ?, status = ? WHERE id = ?'
        )->execute([$actionId, $status, $rowId]);
    }

    public static function setStatus(int $sessionId, string $status): void
    {
        $sql = $status === 'completed'
            ? 'UPDATE reconciliation_sessions SET status = ?, completed_at = NOW() WHERE id = ?'
            : 'UPDATE reconciliation_sessions SET status = ? WHERE id = ?';
        Database::getConnection()->prepare($sql)->execute([$status, $sessionId]);
    }

    public static function deleteSession(int $id, int $userId): bool
    {
        $stmt = Database::getConnection()->prepare('DELETE FROM reconciliation_sessions WHERE id = ? AND user_id = ?');
        $stmt->execute([$id, $userId]);
        return $stmt->rowCount() > 0;
    }
}