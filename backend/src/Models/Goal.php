<?php

namespace FinanceHub\Models;

use FinanceHub\Config\Database;
use PDO;

class Goal
{
    public static function findAllByUser(int $userId): array
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT * FROM goals WHERE user_id = ? ORDER BY is_completed ASC, target_date ASC'
        );
        $stmt->execute([$userId]);
        return $stmt->fetchAll();
    }

    public static function findById(int $id): ?array
    {
        $stmt = Database::getConnection()->prepare('SELECT * FROM goals WHERE id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public static function findUserGoal(int $id, int $userId): ?array
    {
        $stmt = Database::getConnection()->prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?');
        $stmt->execute([$id, $userId]);
        return $stmt->fetch() ?: null;
    }

    public static function create(array $data): int
    {
        $stmt = Database::getConnection()->prepare(
            'INSERT INTO goals (user_id, name, target_amount, current_amount, target_date, linked_wallet_id, icon, color)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $data['user_id'],
            $data['name'],
            $data['target_amount'],
            $data['current_amount'] ?? 0,
            $data['target_date'] ?? null,
            $data['linked_wallet_id'] ?? null,
            $data['icon'] ?? '🎯',
            $data['color'] ?? '#8b5cf6',
        ]);
        return (int)Database::getConnection()->lastInsertId();
    }

    public static function updateProgress(int $id, float $currentAmount): void
    {
        $stmt = Database::getConnection()->prepare(
            'UPDATE goals SET current_amount = ?, is_completed = (current_amount >= target_amount) WHERE id = ?'
        );
        $stmt->execute([$currentAmount, $id]);
    }

    public static function update(int $id, array $data): void
    {
        $fields = [];
        $values = [];
        foreach (['name', 'target_amount', 'current_amount', 'target_date', 'icon', 'color', 'is_completed'] as $field) {
            if (isset($data[$field])) {
                $fields[] = "{$field} = ?";
                $values[] = $data[$field];
            }
        }
        if (empty($fields)) return;
        $values[] = $id;
        Database::getConnection()->prepare(
            'UPDATE goals SET ' . implode(', ', $fields) . ' WHERE id = ?'
        )->execute($values);
    }
}
