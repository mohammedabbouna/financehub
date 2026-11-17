<?php

namespace FinanceHub\Models;

use FinanceHub\Config\Database;
use PDO;

class Action
{
    public static function findAllByUser(int $userId, array $filters = []): array
    {
        $sql = 'SELECT a.*, c.name as category_name, c.icon as category_icon, c.color as category_color,
                       w.name as wallet_name, tw.name as target_wallet_name
                FROM actions a
                LEFT JOIN categories c ON a.category_id = c.id
                LEFT JOIN wallets w ON a.wallet_id = w.id
                LEFT JOIN wallets tw ON a.target_wallet_id = tw.id
                WHERE a.user_id = ?';

        $params = [$userId];

        if (!empty($filters['wallet_id'])) {
            $sql .= ' AND (a.wallet_id = ? OR a.target_wallet_id = ?)';
            $params[] = $filters['wallet_id'];
            $params[] = $filters['wallet_id'];
        }
        if (!empty($filters['category_id'])) {
            $sql .= ' AND a.category_id = ?';
            $params[] = $filters['category_id'];
        }
        if (!empty($filters['type'])) {
            $sql .= ' AND a.type = ?';
            $params[] = $filters['type'];
        }
        if (!empty($filters['date_from'])) {
            $sql .= ' AND a.date >= ?';
            $params[] = $filters['date_from'];
        }
        if (!empty($filters['date_to'])) {
            $sql .= ' AND a.date <= ?';
            $params[] = $filters['date_to'];
        }
        if (!empty($filters['tag'])) {
            $sql .= ' AND a.tag = ?';
            $params[] = $filters['tag'];
        }
        if (isset($filters['limit'])) {
            $sql .= ' LIMIT ' . (int)$filters['limit'];
        } else {
            $sql .= ' ORDER BY a.date DESC, a.created_at DESC LIMIT 50';
        }

        $stmt = Database::getConnection()->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public static function findById(int $id): ?array
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT a.*, c.name as category_name, c.icon as category_icon,
                    w.name as wallet_name, tw.name as target_wallet_name
             FROM actions a
             LEFT JOIN categories c ON a.category_id = c.id
             LEFT JOIN wallets w ON a.wallet_id = w.id
             LEFT JOIN wallets tw ON a.target_wallet_id = tw.id
             WHERE a.id = ?'
        );
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public static function findUserAction(int $id, int $userId): ?array
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT * FROM actions WHERE id = ? AND user_id = ?'
        );
        $stmt->execute([$id, $userId]);
        return $stmt->fetch() ?: null;
    }

    public static function create(array $data): int
    {
        $stmt = Database::getConnection()->prepare(
            'INSERT INTO actions (user_id, wallet_id, target_wallet_id, type, amount, category_id,
                                  description, date, tag, receipt_url, transfer_group_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $data['user_id'],
            $data['wallet_id'],
            $data['target_wallet_id'] ?? null,
            $data['type'],
            $data['amount'],
            $data['category_id'] ?? null,
            $data['description'] ?? null,
            $data['date'],
            $data['tag'] ?? null,
            $data['receipt_url'] ?? null,
            $data['transfer_group_id'] ?? null,
        ]);
        return (int)Database::getConnection()->lastInsertId();
    }

    public static function getMonthlySummary(int $userId, string $yearMonth): array
    {
        $stmt = Database::getConnection()->prepare(
            "SELECT a.type,
                    COALESCE(SUM(a.amount), 0) as total,
                    COUNT(*) as count
             FROM actions a
             WHERE a.user_id = ? AND DATE_FORMAT(a.date, '%Y-%m') = ?
             GROUP BY a.type"
        );
        $stmt->execute([$userId, $yearMonth]);
        return $stmt->fetchAll();
    }

    /**
     * Delete an action row. Wallet balances are NOT touched here — callers
     * that reverse a movement must adjust the balance themselves (see
     * DebtController::deletePayment), keeping the concern in one place.
     */
    public static function update(int $id, int $userId, array $data): void
    {
        $sets = [];
        $params = [];
        if (array_key_exists('category_id', $data)) {
            $sets[] = 'category_id = ?';
            $params[] = $data['category_id'];
        }
        if (array_key_exists('description', $data)) {
            $sets[] = 'description = ?';
            $params[] = $data['description'];
        }
        if (array_key_exists('date', $data)) {
            $sets[] = 'date = ?';
            $params[] = $data['date'];
        }
        if (array_key_exists('tag', $data)) {
            $sets[] = 'tag = ?';
            $params[] = $data['tag'];
        }
        if ($sets === []) {
            return;
        }
        $params[] = $id;
        $params[] = $userId;
        Database::getConnection()
            ->prepare('UPDATE actions SET ' . implode(', ', $sets) . ' WHERE id = ? AND user_id = ?')
            ->execute($params);
    }

    public static function getCategoryTotals(int $userId, string $startDate, string $endDate): array
    {
        $stmt = Database::getConnection()->prepare(
            "SELECT c.id, c.name, c.icon, c.color, COALESCE(SUM(a.amount), 0) as total,
                    COUNT(*) as count
             FROM actions a
             JOIN categories c ON a.category_id = c.id
             WHERE a.user_id = ? AND a.date BETWEEN ? AND ? AND a.type = 'withdraw'
             GROUP BY c.id, c.name, c.icon, c.color
             ORDER BY total DESC"
        );
        $stmt->execute([$userId, $startDate, $endDate]);
        return $stmt->fetchAll();
    }

    public static function getBalanceHistory(int $userId, int $walletId, string $startDate, string $endDate): array
    {
        $stmt = Database::getConnection()->prepare(
            "SELECT a.date,
                    SUM(CASE WHEN a.wallet_id = ? AND a.type IN ('deposit', 'transfer') THEN a.amount
                             WHEN a.wallet_id = ? AND a.type IN ('withdraw') THEN -a.amount
                             ELSE 0 END) as net
             FROM actions a
             WHERE a.user_id = ? AND a.date BETWEEN ? AND ?
             GROUP BY a.date
             ORDER BY a.date ASC"
        );
        $stmt->execute([$walletId, $walletId, $userId, $startDate, $endDate]);
        return $stmt->fetchAll();
    }
}
