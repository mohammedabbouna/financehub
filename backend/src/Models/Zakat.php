<?php

namespace FinanceHub\Models;

use FinanceHub\Config\Database;

/**
 * Zakat: wealth is always recalculated server-side from wallets, gold
 * holdings, investments and debts — the client never supplies values.
 */
class Zakat
{
    /**
     * Build a full wealth breakdown for the user at this moment.
     *
     * cash          — sum of every wallet balance
     * gold_value    — gold holdings (investments.asset_type='gold'), valued at
     *                 the live gold price per gram when available, else at the
     *                 recorded current_price
     * investments   — non-gold investments at current value
     * receivables   — money owed TO the user (debts lent_to, remaining)
     * liabilities   — money the user OWES (debts borrowed_from, remaining)
     */
    public static function getWealthBreakdown(int $userId, ?float $goldPricePerGram = null): array
    {
        $db = Database::getConnection();

        $stmt = $db->prepare('SELECT COALESCE(SUM(balance), 0) AS cash FROM wallets WHERE user_id = ?');
        $stmt->execute([$userId]);
        $cash = (float)$stmt->fetchColumn();

        // Gold holdings: grams × live price when we have one, else recorded value.
        $stmt = $db->prepare(
            'SELECT COALESCE(SUM(quantity), 0) AS grams,
                    COALESCE(SUM(quantity * COALESCE(NULLIF(current_price, 0), purchase_price)), 0) AS recorded
             FROM investments WHERE user_id = ? AND asset_type = \'gold\''
        );
        $stmt->execute([$userId]);
        $gold = $stmt->fetch();
        $goldGrams = (float)$gold['grams'];
        $goldRecorded = (float)$gold['recorded'];
        $goldValue = ($goldPricePerGram !== null && $goldGrams > 0)
            ? round($goldGrams * $goldPricePerGram, 2)
            : $goldRecorded;

        $stmt = $db->prepare(
            'SELECT COALESCE(SUM(quantity * COALESCE(NULLIF(current_price, 0), purchase_price)), 0)
             FROM investments WHERE user_id = ? AND asset_type <> \'gold\''
        );
        $stmt->execute([$userId]);
        $investments = (float)$stmt->fetchColumn();

        $stmt = $db->prepare(
            'SELECT COALESCE(SUM(GREATEST(d.amount - COALESCE((
                        SELECT SUM(p.amount) FROM debt_payments p WHERE p.debt_id = d.id
                    ), 0), 0)), 0)
             FROM debts d WHERE d.user_id = ? AND d.direction = \'lent_to\''
        );
        $stmt->execute([$userId]);
        $receivables = (float)$stmt->fetchColumn();

        $stmt = $db->prepare(
            'SELECT COALESCE(SUM(GREATEST(d.amount - COALESCE((
                        SELECT SUM(p.amount) FROM debt_payments p WHERE p.debt_id = d.id
                    ), 0), 0)), 0)
             FROM debts d WHERE d.user_id = ? AND d.direction = \'borrowed_from\''
        );
        $stmt->execute([$userId]);
        $liabilities = (float)$stmt->fetchColumn();

        $net = round($cash + $goldValue + $investments + $receivables - $liabilities, 2);

        return [
            'cash' => round($cash, 2),
            'gold_grams' => round($goldGrams, 3),
            'gold_value' => round($goldValue, 2),
            'investments_value' => round($investments, 2),
            'receivables' => round($receivables, 2),
            'liabilities' => round($liabilities, 2),
            'net_wealth' => max(0, $net),
        ];
    }

    /**
     * Insert a snapshot. All numeric fields come from getWealthBreakdown()
     * — the caller passes only user_id, date and notes.
     */
    public static function saveSnapshot(int $userId, array $breakdown, array $meta): int
    {
        $stmt = Database::getConnection()->prepare(
            'INSERT INTO zakat_snapshots
                (user_id, snapshot_date, cash, gold_value, investments_value, receivables,
                 liabilities, net_wealth, nisab_value, nisab_grams, zakat_due, gold_price_dzd_gram, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $userId,
            $meta['snapshot_date'],
            $breakdown['cash'],
            $breakdown['gold_value'],
            $breakdown['investments_value'],
            $breakdown['receivables'],
            $breakdown['liabilities'],
            $breakdown['net_wealth'],
            $meta['nisab_value'],
            $meta['nisab_grams'],
            $meta['zakat_due'],
            $meta['gold_price_dzd_gram'],
            $meta['notes'] ?? null,
        ]);
        return (int)Database::getConnection()->lastInsertId();
    }

    /** @return array<int, array<string, mixed>> */
    public static function listSnapshots(int $userId, int $limit = 12): array
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT * FROM zakat_snapshots WHERE user_id = ? ORDER BY snapshot_date DESC, id DESC LIMIT ' . (int)$limit
        );
        $stmt->execute([$userId]);
        return $stmt->fetchAll() ?: [];
    }

    public static function latestSnapshot(int $userId): ?array
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT * FROM zakat_snapshots WHERE user_id = ? ORDER BY snapshot_date DESC, id DESC LIMIT 1'
        );
        $stmt->execute([$userId]);
        $row = $stmt->fetch();
        return $row ?: null;
    }
}
