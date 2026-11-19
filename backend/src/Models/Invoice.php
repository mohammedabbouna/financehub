<?php
namespace FinanceHub\Models;

use FinanceHub\Config\Database;

class Invoice
{
    public static function findAllByUser(int $userId, ?string $status = null): array
    {
        $sql = 'SELECT i.*, c.name AS client_name FROM invoices i LEFT JOIN clients c ON i.client_id = c.id WHERE i.user_id = ?';
        $params = [$userId];
        if ($status !== null && $status !== '') {
            $sql .= ' AND i.status = ?';
            $params[] = $status;
        }
        $sql .= ' ORDER BY i.issue_date DESC, i.id DESC';
        $stmt = Database::getConnection()->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public static function findById(int $id): ?array
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT i.*, c.name AS client_name, c.email AS client_email, c.address AS client_address, c.tax_id AS client_tax_id
             FROM invoices i LEFT JOIN clients c ON i.client_id = c.id WHERE i.id = ?'
        );
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public static function findUserInvoice(int $id, int $userId): ?array
    {
        $stmt = Database::getConnection()->prepare('SELECT * FROM invoices WHERE id = ? AND user_id = ?');
        $stmt->execute([$id, $userId]);
        return $stmt->fetch() ?: null;
    }

    public static function getItems(int $invoiceId): array
    {
        $stmt = Database::getConnection()->prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id ASC');
        $stmt->execute([$invoiceId]);
        return $stmt->fetchAll();
    }

    public static function nextNumber(int $userId): string
    {
        $stmt = Database::getConnection()->prepare('SELECT COUNT(*) AS c FROM invoices WHERE user_id = ?');
        $stmt->execute([$userId]);
        $n = (int)$stmt->fetch()['c'] + 1;
        return 'INV-' . date('Y') . '-' . str_pad((string)$n, 4, '0', STR_PAD_LEFT);
    }

    public static function create(array $data, array $items): int
    {
        $db = Database::getConnection();
        $db->beginTransaction();
        try {
            $stmt = $db->prepare(
                'INSERT INTO invoices (user_id, client_id, number, issue_date, due_date, status, subtotal, vat_rate, vat_amount, total, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([
                $data['user_id'],
                $data['client_id'] ?? null,
                $data['number'],
                $data['issue_date'],
                $data['due_date'] ?? null,
                $data['status'] ?? 'draft',
                $data['subtotal'],
                $data['vat_rate'],
                $data['vat_amount'],
                $data['total'],
                $data['notes'] ?? null,
            ]);
            $id = (int)$db->lastInsertId();
            $itemStmt = $db->prepare(
                'INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, vat_rate, line_total) VALUES (?, ?, ?, ?, ?, ?)'
            );
            foreach ($items as $it) {
                $itemStmt->execute([
                    $id,
                    $it['description'],
                    $it['quantity'],
                    $it['unit_price'],
                    $it['vat_rate'],
                    $it['line_total'],
                ]);
            }
            $db->commit();
            return $id;
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
    }

    public static function updateStatus(int $id, int $userId, string $status): bool
    {
        $stmt = Database::getConnection()->prepare('UPDATE invoices SET status = ? WHERE id = ? AND user_id = ?');
        $stmt->execute([$status, $id, $userId]);
        return $stmt->rowCount() > 0;
    }

    public static function delete(int $id, int $userId): bool
    {
        $stmt = Database::getConnection()->prepare('DELETE FROM invoices WHERE id = ? AND user_id = ?');
        $stmt->execute([$id, $userId]);
        return $stmt->rowCount() > 0;
    }

    public static function summary(int $userId): array
    {
        $stmt = Database::getConnection()->prepare(
            "SELECT status, COUNT(*) AS cnt, COALESCE(SUM(total),0) AS total
             FROM invoices WHERE user_id = ? GROUP BY status"
        );
        $stmt->execute([$userId]);
        return $stmt->fetchAll();
    }
}
