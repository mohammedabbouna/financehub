<?php

namespace FinanceHub\Models;

use FinanceHub\Config\Database;

class Debt
{
    /**
     * Shared SELECT that computes the live remaining balance for every debt
     * (amount minus its payments, floored at 0) — the single source of truth
     * since there is no denormalized status column.
     */
    private const SELECT_BASE = 'SELECT d.*,
            c.name as contact_name, c.phone as contact_phone,
            a.description as action_description,
            GREATEST(d.amount - COALESCE((
                SELECT SUM(p.amount) FROM debt_payments p WHERE p.debt_id = d.id
            ), 0), 0) as remaining,
            COALESCE((SELECT SUM(p.amount) FROM debt_payments p WHERE p.debt_id = d.id), 0) as paid_amount,
            (SELECT MAX(p.payment_date) FROM debt_payments p WHERE p.debt_id = d.id) as last_payment_date,
            CASE
                WHEN GREATEST(d.amount - COALESCE((
                    SELECT SUM(p.amount) FROM debt_payments p WHERE p.debt_id = d.id
                ), 0), 0) <= 0 THEN \'paid\'
                WHEN COALESCE((SELECT SUM(p.amount) FROM debt_payments p WHERE p.debt_id = d.id), 0) > 0 THEN \'partial\'
                ELSE \'pending\'
            END as status';

    private const FROM_BASE = ' FROM debts d
            JOIN contacts c ON d.contact_id = c.id
            LEFT JOIN actions a ON d.action_id = a.id';

    /** @param array{direction?:string, status?:string, contact_id?:int} $filters */
    public static function findAllByUser(int $userId, array $filters = []): array
    {
        $sql = self::SELECT_BASE . self::FROM_BASE . ' WHERE d.user_id = ?';
        $params = [$userId];

        if (!empty($filters['direction'])) {
            $sql .= ' AND d.direction = ?';
            $params[] = $filters['direction'];
        }
        if (!empty($filters['contact_id'])) {
            $sql .= ' AND d.contact_id = ?';
            $params[] = (int)$filters['contact_id'];
        }

        $sql .= ' ORDER BY (GREATEST(d.amount - COALESCE((SELECT SUM(p.amount) FROM debt_payments p WHERE p.debt_id = d.id), 0), 0) > 0) DESC,
                        d.due_date IS NULL, d.due_date ASC, d.created_at DESC';

        if (!empty($filters['status'])) {
            // HAVING on the computed status — pending | partial | paid
            $having = $filters['status'];
            $sql = 'SELECT * FROM (' . $sql . ') t WHERE t.status = ?';
            $params[] = $having;
        }

        $stmt = Database::getConnection()->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public static function findUserDebt(int $id, int $userId): ?array
    {
        $stmt = Database::getConnection()->prepare(
            self::SELECT_BASE . self::FROM_BASE . ' WHERE d.id = ? AND d.user_id = ?'
        );
        $stmt->execute([$id, $userId]);
        return $stmt->fetch() ?: null;
    }

    public static function create(array $data): int
    {
        $stmt = Database::getConnection()->prepare(
            'INSERT INTO debts (user_id, contact_id, direction, amount, due_date, notes, action_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $data['user_id'],
            $data['contact_id'],
            $data['direction'],
            $data['amount'],
            $data['due_date'] ?? null,
            $data['notes'] ?? null,
            $data['action_id'] ?? null,
        ]);
        return (int)Database::getConnection()->lastInsertId();
    }

    public static function update(int $id, array $data): void
    {
        $fields = [];
        $params = [];
        foreach (['direction', 'amount', 'due_date', 'notes', 'contact_id'] as $key) {
            if (array_key_exists($key, $data)) {
                $fields[] = "{$key} = ?";
                $params[] = $data[$key];
            }
        }
        if ($fields === []) {
            return;
        }
        $params[] = $id;
        Database::getConnection()->prepare(
            'UPDATE debts SET ' . implode(', ', $fields) . ' WHERE id = ?'
        )->execute($params);
    }

    public static function delete(int $id): void
    {
        Database::getConnection()->prepare('DELETE FROM debts WHERE id = ?')->execute([$id]);
    }

    /**
     * Oldest debt of the given contact+direction that still has a balance.
     * Used by the borrow/repay auto-linking to decide where a payment lands.
     */
    public static function findOpenDebt(int $userId, int $contactId, string $direction): ?array
    {
        $stmt = Database::getConnection()->prepare(
            self::SELECT_BASE . self::FROM_BASE . '
             WHERE d.user_id = ? AND d.contact_id = ? AND d.direction = ?
               AND GREATEST(d.amount - COALESCE((
                   SELECT SUM(p.amount) FROM debt_payments p WHERE p.debt_id = d.id
               ), 0), 0) > 0
             ORDER BY d.due_date IS NULL, d.due_date ASC, d.created_at ASC
             LIMIT 1'
        );
        $stmt->execute([$userId, $contactId, $direction]);
        return $stmt->fetch() ?: null;
    }

    public static function addPayment(array $data): int
    {
        $stmt = Database::getConnection()->prepare(
            'INSERT INTO debt_payments (user_id, debt_id, amount, payment_date, notes, action_id)
             VALUES (?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $data['user_id'],
            $data['debt_id'],
            $data['amount'],
            $data['payment_date'],
            $data['notes'] ?? null,
            $data['action_id'] ?? null,
        ]);
        return (int)Database::getConnection()->lastInsertId();
    }

    public static function getPayments(int $debtId): array
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT p.*, a.description as action_description
             FROM debt_payments p
             LEFT JOIN actions a ON p.action_id = a.id
             WHERE p.debt_id = ?
             ORDER BY p.payment_date DESC, p.id DESC'
        );
        $stmt->execute([$debtId]);
        return $stmt->fetchAll();
    }

    public static function deletePayment(int $paymentId, int $userId): void
    {
        Database::getConnection()->prepare(
            'DELETE FROM debt_payments WHERE id = ? AND user_id = ?'
        )->execute([$paymentId, $userId]);
    }

    /**
     * Aggregate balances across all of the user's debts.
     *
     * @return array{lent_to: float, borrowed_from: float, net: float,
     *               open_count: int, paid_count: int, overdue_count: int,
     *               lent_to_count: int, borrowed_from_count: int}
     */
    public static function getSummary(int $userId): array
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT
                COALESCE(SUM(CASE WHEN d.direction = \'lent_to\' THEN d.remaining END), 0) as lent_to,
                COALESCE(SUM(CASE WHEN d.direction = \'borrowed_from\' THEN d.remaining END), 0) as borrowed_from,
                SUM(CASE WHEN d.remaining > 0 THEN 1 ELSE 0 END) as open_count,
                SUM(CASE WHEN d.remaining <= 0 THEN 1 ELSE 0 END) as paid_count,
                SUM(CASE WHEN d.remaining > 0 AND d.due_date IS NOT NULL AND d.due_date < CURDATE()
                         THEN 1 ELSE 0 END) as overdue_count,
                SUM(CASE WHEN d.direction = \'lent_to\' THEN 1 ELSE 0 END) as lent_to_count,
                SUM(CASE WHEN d.direction = \'borrowed_from\' THEN 1 ELSE 0 END) as borrowed_from_count
             FROM (
                 SELECT d.*, GREATEST(d.amount - COALESCE((
                     SELECT SUM(p.amount) FROM debt_payments p WHERE p.debt_id = d.id
                 ), 0), 0) as remaining
                 FROM debts d WHERE d.user_id = ?
             ) d'
        );
        $stmt->execute([$userId]);
        $row = $stmt->fetch() ?: [];

        $lentTo = (float)($row['lent_to'] ?? 0);
        $borrowedFrom = (float)($row['borrowed_from'] ?? 0);

        return [
            'lent_to' => $lentTo,
            'borrowed_from' => $borrowedFrom,
            'net' => $lentTo - $borrowedFrom,
            'open_count' => (int)($row['open_count'] ?? 0),
            'paid_count' => (int)($row['paid_count'] ?? 0),
            'overdue_count' => (int)($row['overdue_count'] ?? 0),
            'lent_to_count' => (int)($row['lent_to_count'] ?? 0),
            'borrowed_from_count' => (int)($row['borrowed_from_count'] ?? 0),
        ];
    }
}
