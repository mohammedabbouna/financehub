<?php

namespace FinanceHub\Models;

use FinanceHub\Config\Database;
use PDO;

class Wallet
{
    public static function findAllByUser(int $userId): array
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT * FROM wallets WHERE user_id = ? ORDER BY is_archived ASC, created_at ASC'
        );
        $stmt->execute([$userId]);
        return $stmt->fetchAll();
    }

    public static function findById(int $id): ?array
    {
        $stmt = Database::getConnection()->prepare('SELECT * FROM wallets WHERE id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public static function findUserWallet(int $id, int $userId): ?array
    {
        $stmt = Database::getConnection()->prepare('SELECT * FROM wallets WHERE id = ? AND user_id = ?');
        $stmt->execute([$id, $userId]);
        return $stmt->fetch() ?: null;
    }

    public static function create(array $data): int
    {
        $stmt = Database::getConnection()->prepare(
            'INSERT INTO wallets (user_id, name, type, currency, balance, icon, color)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $data['user_id'],
            $data['name'],
            $data['type'] ?? 'cash',
            $data['currency'] ?? 'DZD',
            $data['balance'] ?? 0,
            $data['icon'] ?? '💰',
            $data['color'] ?? '#3b82f6',
        ]);
        return (int)Database::getConnection()->lastInsertId();
    }

    public static function updateBalance(int $id, float $newBalance): void
    {
        $stmt = Database::getConnection()->prepare('UPDATE wallets SET balance = ? WHERE id = ?');
        $stmt->execute([$newBalance, $id]);
    }

    public static function update(int $id, array $data): void
    {
        $fields = [];
        $values = [];
        foreach (['name', 'type', 'currency', 'icon', 'color', 'is_archived'] as $field) {
            if (isset($data[$field])) {
                $fields[] = "{$field} = ?";
                $values[] = is_bool($data[$field]) ? (int)$data[$field] : $data[$field];
            }
        }
        if (empty($fields)) return;
        $values[] = $id;
        $stmt = Database::getConnection()->prepare(
            'UPDATE wallets SET ' . implode(', ', $fields) . ' WHERE id = ?'
        );
        $stmt->execute($values);
    }

    public static function archive(int $id): void
    {
        $stmt = Database::getConnection()->prepare('UPDATE wallets SET is_archived = TRUE WHERE id = ?');
        $stmt->execute([$id]);
    }

    public static function getTotalAssets(int $userId): float
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT COALESCE(SUM(balance), 0) as total FROM wallets WHERE user_id = ? AND is_archived = FALSE'
        );
        $stmt->execute([$userId]);
        return (float)$stmt->fetch()['total'];
    }
}
