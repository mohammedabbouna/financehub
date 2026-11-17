<?php

namespace FinanceHub\Models;

use FinanceHub\Config\Database;
use FinanceHub\Support\Transaction;

/**
 * Tontine (العمّارية): a rotating savings circle. Members contribute a fixed
 * amount every cycle; the pot rotates to a different member each cycle.
 *
 * Cycles are derived from start_date + frequency (weekly/monthly) — no cycle
 * table needed. Payments are unique per (tontine, member, due_date) so the
 * same contribution can never be recorded twice.
 */
class Tontine
{
    public static function create(int $userId, array $data): int
    {
        $stmt = Database::getConnection()->prepare(
            'INSERT INTO tontines (user_id, name, amount, frequency, start_date, manager_name, notes, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, \'active\')'
        );
        $stmt->execute([
            $userId,
            $data['name'],
            $data['amount'],
            $data['frequency'],
            $data['start_date'],
            $data['manager_name'] ?? null,
            $data['notes'] ?? null,
        ]);
        return (int)Database::getConnection()->lastInsertId();
    }

    public static function findUserTontine(int $id, int $userId): ?array
    {
        $stmt = Database::getConnection()->prepare('SELECT * FROM tontines WHERE id = ? AND user_id = ?');
        $stmt->execute([$id, $userId]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /** @return array<int, array<string, mixed>> */
    public static function findAllByUser(int $userId): array
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT t.*,
                    (SELECT COUNT(*) FROM tontine_members m WHERE m.tontine_id = t.id AND m.is_active = 1) AS member_count,
                    (SELECT COALESCE(SUM(p.amount), 0) FROM tontine_payments p WHERE p.tontine_id = t.id) AS total_collected
             FROM tontines t
             WHERE t.user_id = ?
             ORDER BY t.status = \'active\' DESC, t.created_at DESC'
        );
        $stmt->execute([$userId]);
        return $stmt->fetchAll() ?: [];
    }

    public static function update(int $id, array $data): void
    {
        $fields = [];
        $values = [];
        foreach (['name', 'amount', 'frequency', 'start_date', 'manager_name', 'notes', 'status'] as $field) {
            if (array_key_exists($field, $data)) {
                $fields[] = "{$field} = ?";
                $values[] = $data[$field];
            }
        }
        if ($fields === []) {
            return;
        }
        $values[] = $id;
        Database::getConnection()->prepare(
            'UPDATE tontines SET ' . implode(', ', $fields) . ' WHERE id = ?'
        )->execute($values);
    }

    public static function delete(int $id): void
    {
        Database::getConnection()->prepare('DELETE FROM tontines WHERE id = ?')->execute([$id]);
    }

    // ─── Members ──────────────────────────────────────────────────────────────

    public static function addMember(int $tontineId, array $data): int
    {
        $db = Database::getConnection();
        $position = (int)($data['position'] ?? 0);
        if ($position <= 0) {
            $stmt = $db->prepare('SELECT COALESCE(MAX(position), 0) + 1 FROM tontine_members WHERE tontine_id = ?');
            $stmt->execute([$tontineId]);
            $position = (int)$stmt->fetchColumn();
        }
        $stmt = $db->prepare(
            'INSERT INTO tontine_members (tontine_id, name, phone, position, is_self, is_active)
             VALUES (?, ?, ?, ?, ?, 1)'
        );
        $stmt->execute([
            $tontineId,
            $data['name'],
            $data['phone'] ?? null,
            $position,
            !empty($data['is_self']) ? 1 : 0,
        ]);
        return (int)$db->lastInsertId();
    }

    public static function deleteMember(int $memberId): void
    {
        Database::getConnection()->prepare('DELETE FROM tontine_members WHERE id = ?')->execute([$memberId]);
    }

    /** @return array<int, array<string, mixed>> */
    public static function members(int $tontineId): array
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT m.* FROM tontine_members m WHERE m.tontine_id = ? ORDER BY m.position, m.id'
        );
        $stmt->execute([$tontineId]);
        return $stmt->fetchAll() ?: [];
    }

    /** @return array<string, mixed>|null */
    public static function findMember(int $memberId, int $tontineId): ?array
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT * FROM tontine_members WHERE id = ? AND tontine_id = ?'
        );
        $stmt->execute([$memberId, $tontineId]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    // ─── Payments ─────────────────────────────────────────────────────────────

    /**
     * Look up an existing contribution for a cycle (FOR UPDATE — call inside
     * a transaction so two concurrent submissions can't both pass the check).
     */
    public static function findPayment(int $tontineId, int $memberId, string $dueDate): ?array
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT * FROM tontine_payments
             WHERE tontine_id = ? AND member_id = ? AND due_date = ? FOR UPDATE'
        );
        $stmt->execute([$tontineId, $memberId, $dueDate]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /**
     * Insert a contribution. Must run inside a transaction that already
     * verified findPayment() returned nothing (the unique key is the
     * last line of defence against duplicates).
     *
     * @param array{tontine_id: int, member_id: int, due_date: string, amount: float,
     *              wallet_id: ?int, action_id: ?int, notes: ?string} $payment
     */
    public static function insertPayment(array $payment): array
    {
        $db = Database::getConnection();
        $stmt = $db->prepare(
            'INSERT INTO tontine_payments (tontine_id, member_id, due_date, amount, wallet_id, action_id, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $payment['tontine_id'],
            $payment['member_id'],
            $payment['due_date'],
            $payment['amount'],
            $payment['wallet_id'] ?? null,
            $payment['action_id'] ?? null,
            $payment['notes'] ?? null,
        ]);

        $id = (int)$db->lastInsertId();
        $stmt = $db->prepare('SELECT * FROM tontine_payments WHERE id = ?');
        $stmt->execute([$id]);

        return $stmt->fetch() ?: [];
    }

    /**
     * Remove a contribution and reverse the wallet movement it recorded
     * (real money had already left/entered the wallet).
     */
    public static function deletePayment(int $paymentId, int $tontineId): bool
    {
        return Transaction::run(static function () use ($paymentId, $tontineId): bool {
            $db = Database::getConnection();
            $stmt = $db->prepare('SELECT * FROM tontine_payments WHERE id = ? AND tontine_id = ? FOR UPDATE');
            $stmt->execute([$paymentId, $tontineId]);
            $payment = $stmt->fetch();
            if (!$payment) {
                return false;
            }

            if (!empty($payment['action_id'])) {
                $stmt = $db->prepare('SELECT type, amount, wallet_id FROM actions WHERE id = ?');
                $stmt->execute([(int)$payment['action_id']]);
                $action = $stmt->fetch();
                if ($action && !empty($action['wallet_id'])) {
                    $delta = $action['type'] === 'deposit' ? -(float)$action['amount'] : (float)$action['amount'];
                    Transaction::adjustBalance((int)$action['wallet_id'], $delta);
                }
                $db->prepare('DELETE FROM actions WHERE id = ?')->execute([(int)$payment['action_id']]);
            }

            $db->prepare('DELETE FROM tontine_payments WHERE id = ?')->execute([$paymentId]);
            return true;
        });
    }

    /** @return array<int, array<string, mixed>> */
    public static function payments(int $tontineId): array
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT p.*, m.name AS member_name, m.is_self
             FROM tontine_payments p
             JOIN tontine_members m ON m.id = p.member_id
             WHERE p.tontine_id = ?
             ORDER BY p.due_date DESC, m.position'
        );
        $stmt->execute([$tontineId]);
        return $stmt->fetchAll() ?: [];
    }

    // ─── Cycles ───────────────────────────────────────────────────────────────

    /**
     * Due date of cycle $index (0-based) from the tontine start date.
     * weekly  → start + 7·index days
     * monthly → same day-of-month, +index months (clamped to month end)
     */
    public static function dueDateFor(string $start, string $frequency, int $index): string
    {
        $base = \DateTimeImmutable::createFromFormat('Y-m-d', $start);
        if ($base === false) {
            return $start;
        }
        if ($frequency === 'weekly') {
            return $base->modify('+ ' . (7 * $index) . ' days')->format('Y-m-d');
        }
        $month = (int)$base->format('n') - 1 + $index;
        $year = (int)$base->format('Y') + intdiv($month, 12);
        $month = ($month % 12) + 1;
        $day = min((int)$base->format('j'), (int)(date('t', mktime(0, 0, 0, $month, 1, $year))));
        return sprintf('%04d-%02d-%02d', $year, $month, $day);
    }

    /**
     * Build the cycle schedule: every cycle from the start date up to
     * $horizonDays ahead (capped at $maxCycles).
     *
     * @return array<int, array<string, mixed>>
     */
    public static function cycles(array $tontine, array $members, string $today, int $horizonDays = 120, int $maxCycles = 26): array
    {
        $amount = (float)$tontine['amount'];
        $frequency = (string)$tontine['frequency'];
        $activeMembers = array_values(array_filter($members, static fn(array $m): bool => (int)$m['is_active'] === 1));
        $memberCount = count($activeMembers);
        $expected = round($amount * max(1, $memberCount), 2);
        $horizon = (new \DateTimeImmutable($today))->modify('+ ' . $horizonDays . ' days')->format('Y-m-d');

        $payments = [];
        foreach (self::payments((int)$tontine['id']) as $p) {
            $payments[$p['due_date']][$p['member_id']] = $p;
        }

        $cycles = [];
        for ($i = 0; $i < $maxCycles; $i++) {
            $due = self::dueDateFor((string)$tontine['start_date'], $frequency, $i);
            if ($due > $horizon) {
                break;
            }

            $collected = 0.0;
            $paidMembers = [];
            foreach ($payments[$due] ?? [] as $memberId => $p) {
                $collected += (float)$p['amount'];
                $paidMembers[] = (int)$memberId;
            }

            // The pot rotates: cycle 0 → position 1, cycle 1 → position 2, …
            $receiver = null;
            if ($memberCount > 0) {
                $receiverIndex = $i % $memberCount;
                $receiver = $activeMembers[$receiverIndex] ?? null;
            }

            $status = 'pending';
            if ($due < $today) {
                $status = $collected >= $expected ? 'paid' : ($collected > 0 ? 'overdue' : 'missed');
            } elseif ($due === $today) {
                $status = $collected >= $expected ? 'paid' : 'due';
            } elseif ($collected >= $expected && $expected > 0) {
                $status = 'paid';
            } elseif ($collected > 0) {
                $status = 'partial';
            }

            $cycles[] = [
                'index' => $i,
                'due_date' => $due,
                'expected' => $expected,
                'collected' => round($collected, 2),
                'paid_count' => count($paidMembers),
                'member_count' => $memberCount,
                'receiver' => $receiver !== null ? [
                    'member_id' => (int)$receiver['id'],
                    'name' => $receiver['name'],
                    'position' => (int)$receiver['position'],
                ] : null,
                'status' => $status,
                'is_past' => $due < $today,
                'is_current' => $due <= $today,
                'is_future' => $due > $today,
            ];
        }

        return $cycles;
    }

    /**
     * Members who have not paid the most recent cycle that is already due.
     *
     * @return array<int, array<string, mixed>>
     */
    public static function delinquents(array $tontine, array $cycles, array $members): array
    {
        $currentDue = null;
        foreach ($cycles as $cycle) {
            if ($cycle['is_current']) {
                $currentDue = $cycle['due_date'];
            }
        }
        if ($currentDue === null) {
            return [];
        }

        $stmt = Database::getConnection()->prepare(
            'SELECT member_id FROM tontine_payments WHERE tontine_id = ? AND due_date = ?'
        );
        $stmt->execute([(int)$tontine['id'], $currentDue]);
        $paid = array_map('intval', $stmt->fetchAll(\PDO::FETCH_COLUMN) ?: []);

        $out = [];
        foreach ($members as $m) {
            if ((int)$m['is_active'] !== 1 || in_array((int)$m['id'], $paid, true)) {
                continue;
            }
            $out[] = [
                'member_id' => (int)$m['id'],
                'name' => $m['name'],
                'phone' => $m['phone'],
                'position' => (int)$m['position'],
                'due_date' => $currentDue,
            ];
        }
        return $out;
    }
}
