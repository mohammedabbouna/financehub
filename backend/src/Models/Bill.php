<?php

namespace FinanceHub\Models;

use FinanceHub\Config\Database;
use PDO;

class Bill
{
    public static function findAllByUser(int $userId): array
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT b.*, c.name as category_name, c.icon as category_icon
             FROM bills b
             LEFT JOIN categories c ON b.category_id = c.id
             WHERE b.user_id = ?
             ORDER BY b.is_paid ASC, b.due_date ASC'
        );
        $stmt->execute([$userId]);
        return $stmt->fetchAll();
    }

    public static function findUpcoming(int $userId, int $days = 7): array
    {
        $stmt = Database::getConnection()->prepare(
            "SELECT b.*, c.name as category_name, c.icon as category_icon
             FROM bills b
             LEFT JOIN categories c ON b.category_id = c.id
             WHERE b.user_id = ? AND b.is_paid = FALSE
             AND b.due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
             ORDER BY b.due_date ASC"
        );
        $stmt->execute([$userId, $days]);
        return $stmt->fetchAll();
    }

    public static function findById(int $id): ?array
    {
        $stmt = Database::getConnection()->prepare('SELECT * FROM bills WHERE id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public static function findUserBill(int $id, int $userId): ?array
    {
        $stmt = Database::getConnection()->prepare('SELECT * FROM bills WHERE id = ? AND user_id = ?');
        $stmt->execute([$id, $userId]);
        return $stmt->fetch() ?: null;
    }

    public static function create(array $data): int
    {
        $stmt = Database::getConnection()->prepare(
            'INSERT INTO bills (user_id, name, amount, due_date, category_id, wallet_id, reminder_days_before, is_recurring, recurring_frequency)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $data['user_id'],
            $data['name'],
            $data['amount'],
            $data['due_date'],
            $data['category_id'] ?? null,
            $data['wallet_id'] ?? null,
            $data['reminder_days_before'] ?? 3,
            // PDO stringifies a PHP bool false as '' under native prepares,
            // which MySQL rejects for the TINYINT column — bind an int.
            (int)($data['is_recurring'] ?? 0),
            ($data['recurring_frequency'] ?? null) !== '' ? ($data['recurring_frequency'] ?? null) : null,
        ]);
        return (int)Database::getConnection()->lastInsertId();
    }

    public static function markAsPaid(int $id): void
    {
        $stmt = Database::getConnection()->prepare('UPDATE bills SET is_paid = TRUE WHERE id = ?');
        $stmt->execute([$id]);
    }

    public static function update(int $id, array $data): void
    {
        $fields = [];
        $values = [];
        foreach (['name', 'amount', 'due_date', 'is_paid', 'reminder_days_before'] as $field) {
            if (isset($data[$field])) {
                $fields[] = "{$field} = ?";
                // Booleans must bind as 0/1 — PDO turns false into ''.
                $values[] = is_bool($data[$field]) ? (int)$data[$field] : $data[$field];
            }
        }
        if (empty($fields)) return;
        $values[] = $id;
        Database::getConnection()->prepare(
            'UPDATE bills SET ' . implode(', ', $fields) . ' WHERE id = ?'
        )->execute($values);
    }
}
