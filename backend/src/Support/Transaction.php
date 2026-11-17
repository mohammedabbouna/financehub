<?php

namespace FinanceHub\Support;

use FinanceHub\Config\Database;
use Throwable;

/**
 * PDO transaction helper.
 *
 * Balance mutations MUST run inside a transaction with row locks:
 * read-then-write without FOR UPDATE allows double-spending when two
 * requests read the same balance concurrently.
 */
class Transaction
{
    /**
     * @template T
     * @param callable(): T $callback
     * @return T
     */
    public static function run(callable $callback): mixed
    {
        $pdo = Database::getConnection();

        $started = false;
        if (!$pdo->inTransaction()) {
            $pdo->beginTransaction();
            $started = true;
        }

        try {
            $result = $callback();
            if ($started) {
                $pdo->commit();
            }
            return $result;
        } catch (Throwable $e) {
            if ($started && $pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Lock a wallet row and return its fresh balance inside a transaction.
     * Call only from within Transaction::run().
     */
    public static function lockWallet(int $walletId): ?array
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT * FROM wallets WHERE id = ? FOR UPDATE'
        );
        $stmt->execute([$walletId]);
        $wallet = $stmt->fetch();
        return $wallet ?: null;
    }

    /**
     * Atomically add (or subtract) an amount from a wallet balance.
     * Uses a relative UPDATE so it is safe even without an outer lock.
     */
    public static function adjustBalance(int $walletId, float $delta): void
    {
        $stmt = Database::getConnection()->prepare(
            'UPDATE wallets SET balance = balance + ? WHERE id = ?'
        );
        $stmt->execute([$delta, $walletId]);
    }
}
