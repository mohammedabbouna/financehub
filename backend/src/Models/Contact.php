<?php

namespace FinanceHub\Models;

use FinanceHub\Config\Database;

class Contact
{
    public static function findAllByUser(int $userId): array
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT c.*,
                    COALESCE(SUM(CASE WHEN d.direction = \'lent_to\'
                                       AND d.remaining > 0 THEN d.remaining END), 0) as total_lent,
                    COALESCE(SUM(CASE WHEN d.direction = \'borrowed_from\'
                                       AND d.remaining > 0 THEN d.remaining END), 0) as total_borrowed,
                    COUNT(d.id) as debt_count
             FROM contacts c
             LEFT JOIN (
                 SELECT d.*, GREATEST(
                     d.amount - COALESCE((
                         SELECT SUM(p.amount) FROM debt_payments p WHERE p.debt_id = d.id
                     ), 0), 0) as remaining
                 FROM debts d WHERE d.user_id = ?
             ) d ON d.contact_id = c.id
             WHERE c.user_id = ?
             GROUP BY c.id
             ORDER BY c.name ASC'
        );
        $stmt->execute([$userId, $userId]);
        return $stmt->fetchAll();
    }

    public static function findById(int $id): ?array
    {
        $stmt = Database::getConnection()->prepare('SELECT * FROM contacts WHERE id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public static function findUserContact(int $id, int $userId): ?array
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT * FROM contacts WHERE id = ? AND user_id = ?'
        );
        $stmt->execute([$id, $userId]);
        return $stmt->fetch() ?: null;
    }

    public static function findByName(int $userId, string $name): ?array
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT * FROM contacts WHERE user_id = ? AND name = ? LIMIT 1'
        );
        $stmt->execute([$userId, $name]);
        return $stmt->fetch() ?: null;
    }

    public static function create(array $data): int
    {
        $stmt = Database::getConnection()->prepare(
            'INSERT INTO contacts (user_id, name, phone, notes) VALUES (?, ?, ?, ?)'
        );
        $stmt->execute([
            $data['user_id'],
            $data['name'],
            $data['phone'] ?? null,
            $data['notes'] ?? null,
        ]);
        return (int)Database::getConnection()->lastInsertId();
    }

    public static function update(int $id, array $data): void
    {
        $fields = [];
        $params = [];
        foreach (['name', 'phone', 'notes'] as $key) {
            if (array_key_exists($key, $data)) {
                $fields[] = "{$key} = ?";
                $params[] = $data[$key];
            }
        }
        if ($fields === []) {
            return;
        }
        $params[] = $id;
        $stmt = Database::getConnection()->prepare(
            'UPDATE contacts SET ' . implode(', ', $fields) . ' WHERE id = ?'
        );
        $stmt->execute($params);
    }

    public static function delete(int $id): void
    {
        Database::getConnection()->prepare('DELETE FROM contacts WHERE id = ?')->execute([$id]);
    }

    /** True when the contact still has at least one unsettled debt. */
    public static function hasOpenDebts(int $contactId): bool
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT COUNT(*) FROM debts d
             WHERE d.contact_id = ?
               AND GREATEST(d.amount - COALESCE((
                   SELECT SUM(p.amount) FROM debt_payments p WHERE p.debt_id = d.id
               ), 0), 0) > 0'
        );
        $stmt->execute([$contactId]);
        return (int)$stmt->fetchColumn() > 0;
    }
}
