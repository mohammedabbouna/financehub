<?php

namespace FinanceHub\Models;

use FinanceHub\Config\Database;

class RecurringTransaction
{
    /** @return array<int, array<string, mixed>> action_template already decoded */
    public static function findAllByUser(int $userId): array
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT * FROM recurring_transactions
             WHERE user_id = ?
             ORDER BY is_active DESC, next_run_date ASC, name ASC'
        );
        $stmt->execute([$userId]);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$row) {
            $row['action_template'] = self::decodeTemplate($row['action_template'] ?? null);
        }
        return $rows;
    }

    public static function findUserRecurring(int $id, int $userId): ?array
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT * FROM recurring_transactions WHERE id = ? AND user_id = ?'
        );
        $stmt->execute([$id, $userId]);
        $row = $stmt->fetch();
        if (!$row) {
            return null;
        }
        $row['action_template'] = self::decodeTemplate($row['action_template'] ?? null);
        return $row;
    }

    /** Rows due for generation across ALL users — used by the worker. */
    public static function findDue(int $limit = 500): array
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT * FROM recurring_transactions
             WHERE is_active = TRUE AND next_run_date <= CURDATE()
             ORDER BY next_run_date ASC
             LIMIT ' . max(1, min(1000, $limit))
        );
        $stmt->execute();
        $rows = $stmt->fetchAll();
        foreach ($rows as &$row) {
            $row['action_template'] = self::decodeTemplate($row['action_template'] ?? null);
        }
        return $rows;
    }

    public static function create(array $data): int
    {
        $stmt = Database::getConnection()->prepare(
            'INSERT INTO recurring_transactions (user_id, name, action_template, frequency, next_run_date, is_active)
             VALUES (?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $data['user_id'],
            $data['name'],
            json_encode($data['action_template'], JSON_UNESCAPED_UNICODE),
            $data['frequency'],
            $data['next_run_date'],
            // 0/1 instead of a PHP bool — see Budget::create().
            (int)($data['is_active'] ?? 1),
        ]);
        return (int)Database::getConnection()->lastInsertId();
    }

    public static function update(int $id, array $data): void
    {
        $fields = [];
        $params = [];
        foreach (['name', 'frequency', 'next_run_date'] as $key) {
            if (array_key_exists($key, $data)) {
                $fields[] = "{$key} = ?";
                $params[] = $data[$key];
            }
        }
        if (array_key_exists('action_template', $data)) {
            $fields[] = 'action_template = ?';
            $params[] = json_encode($data['action_template'], JSON_UNESCAPED_UNICODE);
        }
        if (array_key_exists('is_active', $data)) {
            $fields[] = 'is_active = ?';
            $params[] = is_bool($data['is_active']) ? (int)$data['is_active'] : $data['is_active'];
        }
        if ($fields === []) {
            return;
        }
        $params[] = $id;
        Database::getConnection()->prepare(
            'UPDATE recurring_transactions SET ' . implode(', ', $fields) . ' WHERE id = ?'
        )->execute($params);
    }

    public static function delete(int $id): void
    {
        Database::getConnection()->prepare('DELETE FROM recurring_transactions WHERE id = ?')->execute([$id]);
    }

    /**
     * Advance next_run_date after a successful (or skipped) generation.
     * Monthly/yearly dates clamp to the last day of the target month so a
     * template created on the 31st doesn't drift into the following month.
     */
    public static function advanceNextRun(int $id, string $frequency, string $fromDate): void
    {
        $from = new \DateTimeImmutable($fromDate);
        $day = (int)$from->format('j');

        $next = match ($frequency) {
            'daily' => $from->modify('+1 day'),
            'weekly' => $from->modify('+7 days'),
            'monthly' => $from->modify('+1 month'),
            'yearly' => $from->modify('+1 year'),
            default => $from->modify('+1 month'),
        };

        if (in_array($frequency, ['monthly', 'yearly'], true) && (int)$next->format('j') !== $day) {
            $anchor = $frequency === 'monthly' ? 'last day of next month' : 'last day of next year';
            $clamped = $from->modify($anchor);
            $next = (int)$clamped->format('j') >= $day ? $clamped : $next;
        }

        Database::getConnection()->prepare(
            'UPDATE recurring_transactions SET next_run_date = ? WHERE id = ?'
        )->execute([$next->format('Y-m-d'), $id]);
    }

    /** @param mixed $raw */
    private static function decodeTemplate(mixed $raw): array
    {
        if (is_array($raw)) {
            return $raw;
        }
        if (!is_string($raw) || $raw === '') {
            return [];
        }
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : [];
    }
}
