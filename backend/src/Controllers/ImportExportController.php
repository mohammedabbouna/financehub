<?php

namespace FinanceHub\Controllers;

use FinanceHub\Config\Database;
use FinanceHub\Models\Action;
use FinanceHub\Models\Category;
use FinanceHub\Models\Wallet;
use FinanceHub\Support\Validator;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * CSV export (UTF-8 BOM so Excel renders Arabic) and CSV import
 * (browser parses the file → this controller maps rows → batch commit).
 */
class ImportExportController
{
    /**
     * GET /export/actions?from=&to= — every movement of the period as CSV.
     * A UTF-8 BOM prefix is what makes Excel recognize the encoding.
     */
    public function exportActions(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $query = $request->getQueryParams();
        $from = is_string($query['from'] ?? null) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $query['from'])
            ? $query['from'] : null;
        $to = is_string($query['to'] ?? null) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $query['to'])
            ? $query['to'] : null;

        $sql = "SELECT a.date, a.type, a.amount, COALESCE(c.name, '') AS category,
                       COALESCE(w.name, '') AS wallet, COALESCE(t.name, '') AS target_wallet,
                       a.description, COALESCE(a.tag, '') AS tag
                FROM actions a
                LEFT JOIN categories c ON a.category_id = c.id
                LEFT JOIN wallets w ON a.wallet_id = w.id
                LEFT JOIN wallets t ON a.target_wallet_id = t.id
                WHERE a.user_id = ?";
        $params = [$userId];
        if ($from !== null) {
            $sql .= ' AND a.date >= ?';
            $params[] = $from;
        }
        if ($to !== null) {
            $sql .= ' AND a.date <= ?';
            $params[] = $to;
        }
        $sql .= ' ORDER BY a.date ASC, a.id ASC';

        $stmt = Database::getConnection()->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        // Arabic CSV headers — matches what the importer expects back.
        $out = "\xEF\xBB\xBF"; // UTF-8 BOM
        $out .= "التاريخ,النوع,المبلغ,الفئة,المحفظة,المحفظة الهدف,الوصف,الوسم\n";
        foreach ($rows as $row) {
            $out .= implode(',', array_map(
                static fn ($v) => '"' . str_replace('"', '""', (string)$v) . '"',
                [
                    $row['date'],
                    $row['type'],
                    $row['amount'],
                    $row['category'],
                    $row['wallet'],
                    $row['target_wallet'],
                    $row['description'],
                    $row['tag'],
                ]
            )) . "\n";
        }

        $filename = 'financehub_actions_' . ($from ?? 'all') . '_' . ($to ?? date('Y-m-d')) . '.csv';
        $response->getBody()->write($out);
        return $response
            ->withStatus(200)
            ->withHeader('Content-Type', 'text/csv; charset=utf-8')
            ->withHeader('Content-Disposition', 'attachment; filename="' . $filename . '"');
    }

    /**
     * POST /import/analyze — map raw CSV rows to app semantics.
     *
     * Local, deterministic matching: amount sign + income/expense keywords
     * decide the type; category names are matched against the user's
     * categories (exact → contains → French/Arabic keyword dictionary).
     * Claude is never required for the importer to work.
     */
    public function analyze(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $data = $request->getParsedBody() ?: [];
        $rows = $data['rows'] ?? null;

        if (!is_array($rows) || count($rows) === 0) {
            return $this->json($response, ['error' => 'لا توجد صفوف لتحليلها'], 422);
        }
        if (count($rows) > 2000) {
            return $this->json($response, ['error' => 'الحد الأقصى 2000 صف في المرة الواحدة'], 422);
        }

        $categories = Category::findAllByUser($userId);
        $wallets = Wallet::findAllByUser($userId);
        $defaultWalletId = $wallets[0]['id'] ?? null;

        $incomeKeywords = ['دخل', 'راتب', 'مرتب', 'عائد', 'بيع', 'هدية', 'شهرية', 'income', 'salary', 'salaire', 'revenu'];
        $expenseKeywords = ['شراء', 'فاتورة', 'مصاريف', 'ضيافة', 'transport', 'essence', 'depense', 'dépense', 'achat'];

        $mapped = [];
        foreach ($rows as $i => $row) {
            if (!is_array($row)) {
                continue;
            }

            $amountRaw = trim((string)($row['amount'] ?? ''));
            // Accept both "-1200" and "1 200,50" styles.
            $amountRaw = str_replace([' ', "\u{00A0}"], '', $amountRaw);
            $amountRaw = str_replace(',', '.', $amountRaw);
            $amount = (float)$amountRaw;

            $date = (string)($row['date'] ?? '');
            $dateOk = (bool)preg_match('/^\d{4}-\d{2}-\d{2}$/', $date);

            $description = trim((string)($row['description'] ?? ''));
            $lower = mb_strtolower($description . ' ' . (string)($row['category'] ?? ''));

            // Type: explicit column → amount sign → keywords → default expense.
            $type = (string)($row['type'] ?? '');
            if (!in_array($type, ['deposit', 'withdraw', 'borrow', 'repay', 'invest'], true)) {
                $negative = $amount < 0;
                $mentionsIncome = $this->containsAny($lower, $incomeKeywords);
                $mentionsExpense = $this->containsAny($lower, $expenseKeywords);
                if ($mentionsIncome && !$mentionsExpense) {
                    $type = 'deposit';
                } elseif ($negative || $mentionsExpense) {
                    $type = 'withdraw';
                } elseif ($mentionsIncome) {
                    $type = 'deposit';
                } else {
                    $type = 'withdraw';
                }
            }

            $categoryId = $this->matchCategory($categories, (string)($row['category'] ?? ''), $lower, $userId);
            $warnings = [];
            if (!$dateOk) {
                $warnings[] = 'تاريخ غير صالح — سيُستبدل بيوم التحليل';
            }
            if (abs($amount) <= 0) {
                $warnings[] = 'مبلغ صفر أو غير مقروء — صف مرفوض';
            }

            $mapped[] = [
                'row' => (int)$i,
                'date' => $dateOk ? $date : date('Y-m-d'),
                'type' => $type,
                'amount' => round(abs($amount), 2),
                'category_id' => $categoryId,
                'category_name' => $categoryId !== null
                    ? $this->categoryName($categories, $categoryId) : null,
                'wallet_id' => $defaultWalletId,
                'description' => mb_substr($description, 0, 1000),
                'valid' => abs($amount) > 0,
                'warnings' => $warnings,
            ];
        }

        return $this->json($response, [
            'rows' => $mapped,
            'total' => count($mapped),
            'valid' => count(array_filter($mapped, static fn (array $r): bool => $r['valid'])),
            'wallet_id' => $defaultWalletId,
        ]);
    }

    /**
     * POST /import/commit — save the mapped rows in one transaction.
     *
     * Wallet balances move with each row (same sign convention as
     * ActionController), so an import leaves the books consistent.
     */
    public function commit(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $data = $request->getParsedBody() ?: [];
        $rows = $data['rows'] ?? null;

        if (!is_array($rows) || count($rows) === 0) {
            return $this->json($response, ['error' => 'لا توجد صفوف للحفظ'], 422);
        }
        if (count($rows) > 2000) {
            return $this->json($response, ['error' => 'الحد الأقصى 2000 صف في المرة الواحدة'], 422);
        }

        $wallets = Wallet::findAllByUser($userId);
        if ($wallets === []) {
            return $this->json($response, ['error' => 'أنشئ محفظة أولاً قبل استيراد العمليات'], 422);
        }
        $defaultWalletId = (int)$wallets[0]['id'];

        $saved = 0;
        $errors = [];

        $result = \FinanceHub\Support\Transaction::run(function () use (
            $userId, $rows, $defaultWalletId, &$saved, &$errors
        ) {
            $db = Database::getConnection();
            $categoryIds = array_flip(array_map(
                static fn (array $c): int => (int)$c['id'],
                Category::findAllByUser($userId)
            ));
            $walletIds = array_flip(array_map(
                static fn (array $w): int => (int)$w['id'],
                Wallet::findAllByUser($userId)
            ));
            $sign = static fn (string $t): int => in_array($t, ['deposit', 'borrow'], true) ? 1 : -1;

            foreach ($rows as $i => $row) {
                if (!is_array($row)) {
                    $errors[] = ['row' => (int)$i, 'error' => 'صف غير صالح'];
                    continue;
                }

                $type = (string)($row['type'] ?? '');
                $amount = round((float)($row['amount'] ?? 0), 2);
                $date = (string)($row['date'] ?? '');
                $walletId = (int)($row['wallet_id'] ?? $defaultWalletId);

                if (!in_array($type, ['deposit', 'withdraw', 'borrow', 'repay', 'invest'], true)) {
                    $errors[] = ['row' => (int)$i, 'error' => 'نوع غير صالح: ' . $type];
                    continue;
                }
                if ($amount <= 0) {
                    $errors[] = ['row' => (int)$i, 'error' => 'مبلغ غير صالح'];
                    continue;
                }
                if (!Validator::isDate($date)) {
                    $errors[] = ['row' => (int)$i, 'error' => 'تاريخ غير صالح'];
                    continue;
                }
                if (!isset($walletIds[$walletId])) {
                    $walletId = $defaultWalletId;
                }

                $categoryId = isset($row['category_id']) && $row['category_id'] !== null
                    ? (int)$row['category_id'] : null;
                if ($categoryId !== null && !isset($categoryIds[$categoryId])) {
                    $categoryId = null; // never write a foreign category
                }

                $db->prepare(
                    'INSERT INTO actions (user_id, wallet_id, type, amount, category_id, description, date, tag)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
                )->execute([
                    $userId,
                    $walletId,
                    $type,
                    $amount,
                    $categoryId,
                    mb_substr(trim((string)($row['description'] ?? '')), 0, 1000),
                    $date,
                    'import',
                ]);

                $db->prepare(
                    'UPDATE wallets SET balance = balance + ? WHERE id = ? AND user_id = ?'
                )->execute([$sign($type) * $amount, $walletId, $userId]);

                $saved++;
            }

            return true;
        });

        return $this->json($response, [
            'saved' => $saved,
            'errors' => $errors,
            'message' => "تم استيراد {$saved} عملية",
        ], $saved > 0 ? 201 : 422);
    }

    /** @param array<int, array> $haystacks */
    private function containsAny(string $text, array $keywords): bool
    {
        foreach ($keywords as $kw) {
            if ($kw !== '' && mb_strpos($text, $kw) !== false) {
                return true;
            }
        }
        return false;
    }

    /**
     * Category match ladder: exact name → contains either way → keyword
     * dictionary (Algerian French/Arabic spend words) → null.
     *
     * @param array<int, array> $categories
     */
    private function matchCategory(array $categories, string $label, string $lowerText, int $userId = 0): ?int
    {
        if ($userId > 0) {
            $pref = \FinanceHub\Models\CategoryPreference::findForText($userId, $lowerText);
            if ($pref !== null) {
                foreach ($categories as $c) {
                    if ((int)$c['id'] === $pref) return $pref;
                }
            }
        }
        $label = trim($label);
        if ($label !== '') {
            foreach ($categories as $c) {
                if (mb_strtolower((string)$c['name']) === mb_strtolower($label)) {
                    return (int)$c['id'];
                }
            }
            foreach ($categories as $c) {
                $name = mb_strtolower((string)$c['name']);
                if ($name !== '' && (mb_strpos($name, $label) !== false || mb_strpos(mb_strtolower($label), $name) !== false)) {
                    return (int)$c['id'];
                }
            }
        }

        $dict = [
            6 => ['طعام', 'مطعم', 'قهوة', 'قهاوة', 'grocery', 'epicerie', '.superette', 'restaurant', 'sandwich'],
            9 => ['فاتوره', 'فاتورة', 'غاز', 'كهرباء', 'ماء', 'inet', 'إنترنت', 'internet', 'edev', 'telecom'],
            8 => ['بنزين', 'essence', 'carburant', 'transport', 'باص', 'تاكسي', 'دراجة'],
            7 => ['كريدي', 'قرض', 'loan', 'قسط'],
            10 => ['صحي', 'دواء', 'pharmacie', 'medecin', 'طبيب', 'sante'],
            12 => ['تعليم', 'مدرسة', 'frais scolaires', 'cours'],
            13 => ['ملابس', 'chaussure', 'vêtement'],
            14 => ['ترفيه', 'سينما', 'jeux', 'لعبة'],
        ];
        foreach ($dict as $catId => $words) {
            if ($this->containsAny($lowerText, $words)) {
                foreach ($categories as $c) {
                    if ((int)$c['id'] === $catId) {
                        return $catId;
                    }
                }
            }
        }
        return null;
    }

    /** @param array<int, array> $categories */
    private function categoryName(array $categories, int $id): ?string
    {
        foreach ($categories as $c) {
            if ((int)$c['id'] === $id) {
                return (string)$c['name'];
            }
        }
        return null;
    }

    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}
