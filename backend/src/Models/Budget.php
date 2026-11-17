<?php

namespace FinanceHub\Models;

use FinanceHub\Config\Database;
use PDO;

class Budget
{
    public static function findAllByUser(int $userId, ?int $month = null, ?int $year = null): array
    {
        $sql = 'SELECT b.*, c.name as category_name, c.icon as category_icon, c.color as category_color,
                       COALESCE((
                           SELECT SUM(a.amount) FROM actions a
                           WHERE a.category_id = b.category_id
                           AND a.user_id = b.user_id
                           AND a.type = \'withdraw\'
                           AND (a.date BETWEEN ? AND ?)
                       ), 0) as spent
                FROM budgets b
                JOIN categories c ON b.category_id = c.id
                WHERE b.user_id = ? AND b.is_active = TRUE';

        $m = $month ?? (int)date('m');
        $y = $year ?? (int)date('Y');
        $startDate = "{$y}-{$m}-01";
        $endDate = date('Y-m-t', strtotime($startDate));

        $stmt = Database::getConnection()->prepare($sql . ' ORDER BY c.name ASC');
        $stmt->execute([$startDate, $endDate, $userId]);
        return $stmt->fetchAll();
    }

    public static function findById(int $id): ?array
    {
        $stmt = Database::getConnection()->prepare('SELECT * FROM budgets WHERE id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public static function findUserBudget(int $id, int $userId): ?array
    {
        $stmt = Database::getConnection()->prepare('SELECT * FROM budgets WHERE id = ? AND user_id = ?');
        $stmt->execute([$id, $userId]);
        return $stmt->fetch() ?: null;
    }

    public static function create(array $data): int
    {
        $stmt = Database::getConnection()->prepare(
            'INSERT INTO budgets (user_id, category_id, period, amount, is_percentage, auto_suggested)
             VALUES (?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $data['user_id'],
            $data['category_id'],
            $data['period'] ?? 'monthly',
            $data['amount'],
            // Bind booleans as 0/1 — PDO serializes false as '' which MySQL
            // rejects for TINYINT columns in strict mode.
            (int)($data['is_percentage'] ?? 0),
            (int)($data['auto_suggested'] ?? 0),
        ]);
        return (int)Database::getConnection()->lastInsertId();
    }

    public static function update(int $id, array $data): void
    {
        $fields = [];
        $values = [];
        foreach (['amount', 'is_percentage', 'auto_suggested', 'is_active'] as $field) {
            if (isset($data[$field])) {
                $fields[] = "{$field} = ?";
                $values[] = is_bool($data[$field]) ? (int)$data[$field] : $data[$field];
            }
        }
        if (empty($fields)) return;
        $values[] = $id;
        Database::getConnection()->prepare(
            'UPDATE budgets SET ' . implode(', ', $fields) . ' WHERE id = ?'
        )->execute($values);
    }

    public static function getBudgetPerformance(int $userId, int $year): array
    {
        $stmt = Database::getConnection()->prepare(
            "SELECT b.id, b.amount as budget_amount, c.name as category_name, c.icon, c.color,
                    MONTH(a.date) as month, SUM(a.amount) as spent
             FROM budgets b
             JOIN categories c ON b.category_id = c.id
             JOIN actions a ON a.category_id = b.category_id AND a.user_id = b.user_id
             WHERE b.user_id = ? AND YEAR(a.date) = ? AND a.type = \'withdraw\'
             GROUP BY b.id, c.name, c.icon, c.color, MONTH(a.date)
             ORDER BY month ASC"
        );
        $stmt->execute([$userId, $year]);
        return $stmt->fetchAll();
    }
}
