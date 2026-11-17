<?php

namespace FinanceHub\Models;

use FinanceHub\Config\Database;
use PDO;

class Investment
{
    public static function findAllByUser(int $userId): array
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT *, (quantity * current_price) as current_value,
                    (quantity * (current_price - purchase_price)) as unrealized_pnl
             FROM investments WHERE user_id = ? ORDER BY asset_type, name'
        );
        $stmt->execute([$userId]);
        return $stmt->fetchAll();
    }

    public static function findById(int $id): ?array
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT *, (quantity * current_price) as current_value FROM investments WHERE id = ?'
        );
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public static function findUserInvestment(int $id, int $userId): ?array
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT * FROM investments WHERE id = ? AND user_id = ?'
        );
        $stmt->execute([$id, $userId]);
        return $stmt->fetch() ?: null;
    }

    public static function create(array $data): int
    {
        $stmt = Database::getConnection()->prepare(
            'INSERT INTO investments (user_id, wallet_id, asset_type, name, ticker, quantity, purchase_price, current_price, currency, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $data['user_id'],
            $data['wallet_id'] ?? null,
            $data['asset_type'],
            $data['name'],
            $data['ticker'] ?? null,
            $data['quantity'],
            $data['purchase_price'],
            $data['current_price'],
            $data['currency'] ?? 'DZD',
            $data['notes'] ?? null,
        ]);
        return (int)Database::getConnection()->lastInsertId();
    }

    public static function update(int $id, array $data): void
    {
        $fields = [];
        $values = [];
        foreach (['asset_type', 'name', 'ticker', 'quantity', 'purchase_price', 'current_price', 'currency', 'notes'] as $field) {
            if (isset($data[$field])) {
                $fields[] = "{$field} = ?";
                $values[] = $data[$field];
            }
        }
        if (empty($fields)) return;
        $values[] = $id;
        Database::getConnection()->prepare(
            'UPDATE investments SET ' . implode(', ', $fields) . ' WHERE id = ?'
        )->execute($values);
    }

    public static function updatePrice(int $id, float $price): void
    {
        Database::getConnection()->prepare(
            'UPDATE investments SET current_price = ?, price_updated_at = NOW() WHERE id = ?'
        )->execute([$price, $id]);
    }

    public static function getPortfolioSummary(int $userId): array
    {
        $stmt = Database::getConnection()->prepare(
            "SELECT asset_type,
                    SUM(quantity * purchase_price) as cost_basis,
                    SUM(quantity * current_price) as current_value,
                    SUM(quantity * (current_price - purchase_price)) as unrealized_pnl,
                    COUNT(*) as holdings_count
             FROM investments WHERE user_id = ?
             GROUP BY asset_type"
        );
        $stmt->execute([$userId]);
        return $stmt->fetchAll();
    }
}
