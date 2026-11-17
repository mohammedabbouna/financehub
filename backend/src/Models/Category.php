<?php

namespace FinanceHub\Models;

use FinanceHub\Config\Database;
use PDO;

class Category
{
    public static function findAllByUser(int $userId): array
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT * FROM categories WHERE user_id IS NULL OR user_id = ? ORDER BY is_system DESC, name ASC'
        );
        $stmt->execute([$userId]);
        return $stmt->fetchAll();
    }

    public static function findById(int $id): ?array
    {
        $stmt = Database::getConnection()->prepare('SELECT * FROM categories WHERE id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public static function create(array $data): int
    {
        $stmt = Database::getConnection()->prepare(
            'INSERT INTO categories (user_id, name, type, parent_id, icon, color) VALUES (?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $data['user_id'],
            $data['name'],
            $data['type'],
            $data['parent_id'] ?? null,
            $data['icon'] ?? '📁',
            $data['color'] ?? '#6b7280',
        ]);
        return (int)Database::getConnection()->lastInsertId();
    }

    public static function update(int $id, int $userId, array $data): bool
    {
        // System categories cannot be edited.
        $existing = self::findById($id);
        if (!$existing || (int)($existing['user_id'] ?? 0) !== $userId) {
            return false;
        }
        $sets = [];
        $params = [];
        foreach (['name', 'type', 'parent_id', 'icon', 'color'] as $field) {
            if (array_key_exists($field, $data)) {
                $sets[] = "{$field} = ?";
                $params[] = $data[$field];
            }
        }
        if ($sets === []) {
            return true;
        }
        $params[] = $id;
        $params[] = $userId;
        Database::getConnection()
            ->prepare('UPDATE categories SET ' . implode(', ', $sets) . ' WHERE id = ? AND user_id = ?')
            ->execute($params);
        return true;
    }

    public static function delete(int $id, int $userId): bool
    {
        $existing = self::findById($id);
        if (!$existing || (int)($existing['user_id'] ?? 0) !== $userId) {
            return false; // system or not owned
        }
        // Move children to root (parent_id = NULL) before deleting.
        Database::getConnection()
            ->prepare('UPDATE categories SET parent_id = NULL WHERE parent_id = ?')
            ->execute([$id]);
        Database::getConnection()
            ->prepare('DELETE FROM categories WHERE id = ? AND user_id = ?')
            ->execute([$id, $userId]);
        return true;
    }
}
