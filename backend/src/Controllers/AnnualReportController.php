<?php

namespace FinanceHub\Controllers;

use FinanceHub\Config\Database;
use FinanceHub\Config\TaxDz;
use FinanceHub\Models\Action;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class AnnualReportController
{
    public function annual(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $year = (int)($args['year'] ?? 0);
        if ($year < 2000 || $year > (int)date('Y') + 1) {
            return $this->json($response, ['error' => 'سنة غير صالحة'], 422);
        }

        $db = Database::getConnection();
        // Income by category
        $stmt = $db->prepare(
            "SELECT COALESCE(c.name, 'أخرى') AS name, COALESCE(c.icon, '📁') AS icon,
                    COALESCE(c.color, '#6b7280') AS color,
                    SUM(a.amount) AS total, COUNT(*) AS cnt
             FROM actions a
             LEFT JOIN categories c ON a.category_id = c.id
             WHERE a.user_id = ? AND YEAR(a.date) = ? AND a.type IN ('deposit','borrow')
             GROUP BY c.id, c.name, c.icon, c.color
             ORDER BY total DESC"
        );
        $stmt->execute([$userId, $year]);
        $incomeBySource = $stmt->fetchAll();

        // Expenses by category
        $stmt = $db->prepare(
            "SELECT COALESCE(c.name, 'أخرى') AS name, COALESCE(c.icon, '📁') AS icon,
                    COALESCE(c.color, '#6b7280') AS color,
                    SUM(a.amount) AS total, COUNT(*) AS cnt
             FROM actions a
             LEFT JOIN categories c ON a.category_id = c.id
             WHERE a.user_id = ? AND YEAR(a.date) = ? AND a.type IN ('withdraw','invest','repay')
             GROUP BY c.id, c.name, c.icon, c.color
             ORDER BY total DESC"
        );
        $stmt->execute([$userId, $year]);
        $expenseByCategory = $stmt->fetchAll();

        $totalIncome = array_sum(array_column($incomeBySource, 'total'));
        $totalExpense = array_sum(array_column($expenseByCategory, 'total'));
        $net = $totalIncome - $totalExpense;

        // Monthly breakdown
        $stmt = $db->prepare(
            "SELECT DATE_FORMAT(date, '%Y-%m') AS ym,
                    SUM(CASE WHEN type IN ('deposit','borrow') THEN amount ELSE 0 END) AS income,
                    SUM(CASE WHEN type IN ('withdraw','invest','repay') THEN amount ELSE 0 END) AS expense
             FROM actions
             WHERE user_id = ? AND YEAR(date) = ?
             GROUP BY ym ORDER BY ym"
        );
        $stmt->execute([$userId, $year]);
        $monthly = $stmt->fetchAll();

        $tax = TaxDz::computeTax((float)$totalIncome);

        return $this->json($response, [
            'year' => $year,
            'total_income' => round($totalIncome, 2),
            'total_expense' => round($totalExpense, 2),
            'net' => round($net, 2),
            'savings_rate' => $totalIncome > 0 ? round($net / $totalIncome * 100, 1) : 0,
            'income_by_source' => $incomeBySource,
            'expense_by_category' => $expenseByCategory,
            'monthly' => $monthly,
            'tax' => $tax,
        ]);
    }

    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}