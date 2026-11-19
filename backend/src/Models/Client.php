<?php
namespace FinanceHub\Models;

use FinanceHub\Config\Database;

class Client
{
    public static function findAllByUser(int $userId): array
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT * FROM clients WHERE user_id = ? ORDER BY name ASC'
        );
        $stmt->execute([$userId]);
        return $stmt->fetchAll();
    }

    public static function findById(int $id): ?array
    {
        $stmt = Database::getConnection()->prepare('SELECT * FROM clients WHERE id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public static function findUserClient(int $id, int $userId): ?array
    {
        $stmt = Database::getConnection()->prepare('SELECT * FROM clients WHERE id = ? AND user_id = ?');
        $stmt->execute([$id, $userId]);
        return $stmt->fetch() ?: null;
    }

    public static function create(array $data): int
    {
        $stmt = Database::getConnection()->prepare(
            'INSERT INTO clients (user_id, name, email, phone, address, tax_id, is_supplier, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $data['user_id'],
            $data['name'],
            $data['email'] ?? null,
            $data['phone'] ?? null,
            $data['address'] ?? null,
            $data['tax_id'] ?? null,
            !empty($data['is_supplier']) ? 1 : 0,
            $data['notes'] ?? null,
        ]);
        return (int)Database::getConnection()->lastInsertId();
    }

    public static function update(int $id, int $userId, array $data): bool
    {
        $existing = self::findUserClient($id, $userId);
        if (!$existing) return false;
        $sets = []; $params = [];
        foreach (['name', 'email', 'phone', 'address', 'tax_id', 'is_supplier', 'notes'] as $f) {
            if (array_key_exists($f, $data)) {
                $sets[] = "{$f} = ?";
                $params[] = is_bool($data[$f]) ? (int)$data[$f] : $data[$f];
            }
        }
        if ($sets === []) return true;
        $params[] = $id; $params[] = $userId;
        Database::getConnection()->prepare('UPDATE clients SET ' . implode(', ', $sets) . ' WHERE id = ? AND user_id = ?')->execute($params);
        return true;
    }

    public static function delete(int $id, int $userId): bool
    {
        $stmt = Database::getConnection()->prepare('DELETE FROM clients WHERE id = ? AND user_id = ?');
        $stmt->execute([$id, $userId]);
        return $stmt->rowCount() > 0;
    }
}
