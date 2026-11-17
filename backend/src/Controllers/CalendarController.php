<?php

namespace FinanceHub\Controllers;

use FinanceHub\Config\Database;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class CalendarController
{
    public function index(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $params = $request->getQueryParams();

        $month = $params['month'] ?? date('m');
        $year = $params['year'] ?? date('Y');

        if (!is_numeric($month) || (int)$month < 1 || (int)$month > 12) {
            return $this->json($response, ['error' => 'رقم الشهر يجب أن يكون بين 1 و 12'], 422);
        }
        if (!is_numeric($year) || (int)$year < 1970 || (int)$year > 2200) {
            return $this->json($response, ['error' => 'السنة غير صالحة'], 422);
        }

        $month = (int)$month;
        $year = (int)$year;
        $startDate = sprintf('%04d-%02d-01', $year, $month);
        $endDate = date('Y-m-t', strtotime($startDate));

        // Get actions in date range
        $stmt = Database::getConnection()->prepare(
            "SELECT a.id, a.type, a.amount, a.date, a.description,
                    c.name as category_name, c.icon as category_icon, c.color as category_color,
                    w.name as wallet_name
             FROM actions a
             LEFT JOIN categories c ON a.category_id = c.id
             LEFT JOIN wallets w ON a.wallet_id = w.id
             WHERE a.user_id = ? AND a.date BETWEEN ? AND ?
             ORDER BY a.date ASC, a.created_at ASC"
        );
        $stmt->execute([$userId, $startDate, $endDate]);
        $actions = $stmt->fetchAll();

        // Get bills due this month
        $billsStmt = Database::getConnection()->prepare(
            "SELECT b.*, c.name as category_name, c.icon as category_icon
             FROM bills b
             LEFT JOIN categories c ON b.category_id = c.id
             WHERE b.user_id = ? AND b.due_date BETWEEN ? AND ?
             ORDER BY b.due_date ASC"
        );
        $billsStmt->execute([$userId, $startDate, $endDate]);
        $bills = $billsStmt->fetchAll();

        // Get recurring transactions
        $recurringStmt = Database::getConnection()->prepare(
            "SELECT * FROM recurring_transactions
             WHERE user_id = ? AND is_active = TRUE
             AND next_run_date BETWEEN ? AND ?"
        );
        $recurringStmt->execute([$userId, $startDate, $endDate]);
        $recurring = $recurringStmt->fetchAll();

        // Build calendar days
        $daysInMonth = (int)date('t', strtotime($startDate));
        $days = [];
        for ($day = 1; $day <= $daysInMonth; $day++) {
            $date = sprintf('%04d-%02d-%02d', $year, $month, $day);
            $dayActions = array_filter($actions, fn($a) => $a['date'] === $date);
            $dayBills = array_filter($bills, fn($b) => $b['due_date'] === $date);
            $dayRecurring = array_filter($recurring, fn($r) => $r['next_run_date'] === $date);

            $totalIncome = 0;
            $totalExpense = 0;
            foreach ($dayActions as $a) {
                if (in_array($a['type'], ['deposit', 'income'])) $totalIncome += $a['amount'];
                else $totalExpense += $a['amount'];
            }

            $days[] = [
                'date' => $date,
                'day' => $day,
                'day_of_week' => date('w', strtotime($date)),
                'is_today' => ($date === date('Y-m-d')),
                'actions' => array_values($dayActions),
                'bills' => array_values($dayBills),
                'recurring' => array_values($dayRecurring),
                'total_income' => $totalIncome,
                'total_expense' => $totalExpense,
                'has_events' => !empty($dayActions) || !empty($dayBills) || !empty($dayRecurring),
            ];
        }

        return $this->json($response, [
            'year' => (int)$year,
            'month' => (int)$month,
            'days' => $days,
        ]);
    }

    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}
