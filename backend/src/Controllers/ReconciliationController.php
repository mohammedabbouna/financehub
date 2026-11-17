<?php

namespace FinanceHub\Controllers;

use FinanceHub\Config\Database;
use FinanceHub\Models\Action;
use FinanceHub\Models\Reconciliation;
use FinanceHub\Models\Wallet;
use FinanceHub\Support\Validator;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class ReconciliationController
{
    public function index(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        return $this->json($response, ['sessions' => Reconciliation::listSessions($userId)]);
    }

    public function create(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $data = $request->getParsedBody() ?: [];
        $rows = $data['rows'] ?? null;
        if (!is_array($rows) || count($rows) === 0) {
            return $this->json($response, ['error' => 'لا توجد صفوف'], 422);
        }
        if (count($rows) > 5000) {
            return $this->json($response, ['error' => 'الحد الأقصى 5000 صف'], 422);
        }

        $normalized = [];
        foreach ($rows as $r) {
            if (!is_array($r)) continue;
            $date = (string)($r['date'] ?? '');
            if (!Validator::isDate($date)) {
                // try dd/mm/yyyy
                if (preg_match('/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/', $date, $m)) {
                    $date = sprintf('%s-%s-%s', $m[3], str_pad($m[2], 2, '0', STR_PAD_LEFT), str_pad($m[1], 2, '0', STR_PAD_LEFT));
                } else {
                    continue;
                }
            }
            $amount = (float)str_replace([',', ' '], ['.', ''], (string)($r['amount'] ?? '0'));
            if ($amount == 0) continue;
            $normalized[] = [
                'date' => $date,
                'description' => mb_substr(trim((string)($r['description'] ?? '')), 0, 500),
                'amount' => round(abs($amount), 2),
                'direction' => $amount < 0 ? 'out' : 'in',
            ];
        }
        if ($normalized === []) {
            return $this->json($response, ['error' => 'لا توجد صفوف صالحة'], 422);
        }

        $sessionId = Reconciliation::createSession($userId, $data['filename'] ?? null);
        Reconciliation::addRows($sessionId, $normalized);
        $this->autoMatch($userId, $sessionId);

        return $this->json($response, [
            'session_id' => $sessionId,
            'rows' => Reconciliation::getRows($sessionId),
            'message' => 'تم إنشاء جلسة مطابقة',
        ], 201);
    }

    public function show(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $session = Reconciliation::findSession((int)$args['id'], $userId);
        if (!$session) {
            return $this->json($response, ['error' => 'الجلسة غير موجودة'], 404);
        }
        return $this->json($response, [
            'session' => $session,
            'rows' => Reconciliation::getRows((int)$args['id']),
        ]);
    }

    public function autoMatchEndpoint(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $session = Reconciliation::findSession((int)$args['id'], $userId);
        if (!$session) {
            return $this->json($response, ['error' => 'الجلسة غير موجودة'], 404);
        }
        $matched = $this->autoMatch($userId, (int)$args['id']);
        return $this->json($response, [
            'matched' => $matched,
            'rows' => Reconciliation::getRows((int)$args['id']),
        ]);
    }

    /**
     * Heuristic matching: amount (exact, abs) + date (±3 days) + description
     * token overlap. Single candidate → matched; multiple → ambiguous.
     */
    private function autoMatch(int $userId, int $sessionId): int
    {
        $rows = Reconciliation::getRows($sessionId);
        $actions = Action::findAllByUser($userId);
        $matched = 0;

        foreach ($rows as $row) {
            if ($row['status'] !== 'unmatched') continue;
            $candidates = [];
            foreach ($actions as $a) {
                $actionAmount = (float)$a['amount'];
                if (abs($actionAmount - (float)$row['amount']) > 0.005) continue;
                $dateDiff = abs(strtotime($a['date']) - strtotime($row['row_date'])) / 86400;
                if ($dateDiff > 3) continue;
                // description similarity
                $sim = $this->textSimilarity((string)$row['description'], (string)($a['description'] ?? ''));
                $score = (3 - $dateDiff) + ($sim * 2);
                $candidates[] = ['action' => $a, 'score' => $score, 'sim' => $sim];
            }
            if (count($candidates) === 0) continue;
            usort($candidates, static fn (array $x, array $y): int => $y['score'] <=> $x['score']);
            if (count($candidates) === 1 || ($candidates[0]['score'] - ($candidates[1]['score'] ?? 0)) >= 1.5) {
                Reconciliation::setMatch((int)$row['id'], (int)$candidates[0]['action']['id'], 'matched');
                $matched++;
            } else {
                Reconciliation::setMatch((int)$row['id'], null, 'ambiguous');
            }
        }
        return $matched;
    }

    private function textSimilarity(string $a, string $b): float
    {
        $a = mb_strtolower(trim($a));
        $b = mb_strtolower(trim($b));
        if ($a === '' || $b === '') return 0.0;
        // token overlap (Jaccard-ish)
        $ta = preg_split('/\s+/u', $a) ?: [];
        $tb = preg_split('/\s+/u', $b) ?: [];
        $ta = array_filter($ta);
        $tb = array_filter($tb);
        if ($ta === [] || $tb === []) return 0.0;
        $inter = count(array_intersect($ta, $tb));
        $union = count(array_unique(array_merge($ta, $tb)));
        return $union > 0 ? $inter / $union : 0.0;
    }

    public function match(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $sessionId = (int)$args['id'];
        $session = Reconciliation::findSession($sessionId, $userId);
        if (!$session) {
            return $this->json($response, ['error' => 'الجلسة غير موجودة'], 404);
        }
        $data = $request->getParsedBody() ?: [];
        $rowId = (int)($data['row_id'] ?? 0);
        $actionId = isset($data['action_id']) ? (int)$data['action_id'] : null;
        $row = Reconciliation::getRow($rowId, $sessionId);
        if (!$row) {
            return $this->json($response, ['error' => 'الصف غير موجود'], 404);
        }
        if ($actionId !== null) {
            $action = Action::findUserAction($actionId, $userId);
            if (!$action) {
                return $this->json($response, ['error' => 'العملية غير موجودة'], 404);
            }
        }
        Reconciliation::setMatch($rowId, $actionId, $actionId !== null ? 'matched' : 'unmatched');
        return $this->json($response, ['message' => 'تمت المطابقة', 'rows' => Reconciliation::getRows($sessionId)]);
    }

    public function ignore(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $session = Reconciliation::findSession((int)$args['id'], $userId);
        if (!$session) {
            return $this->json($response, ['error' => 'الجلسة غير موجودة'], 404);
        }
        $data = $request->getParsedBody() ?: [];
        $rowId = (int)($data['row_id'] ?? 0);
        $row = Reconciliation::getRow($rowId, (int)$args['id']);
        if (!$row) {
            return $this->json($response, ['error' => 'الصف غير موجود'], 404);
        }
        Reconciliation::setMatch($rowId, null, 'ignored');
        return $this->json($response, ['message' => 'تم تجاهل الصف', 'rows' => Reconciliation::getRows((int)$args['id'])]);
    }

    public function createAction(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $sessionId = (int)$args['id'];
        $session = Reconciliation::findSession($sessionId, $userId);
        if (!$session) {
            return $this->json($response, ['error' => 'الجلسة غير موجودة'], 404);
        }
        $data = $request->getParsedBody() ?: [];
        $rowId = (int)($data['row_id'] ?? 0);
        $row = Reconciliation::getRow($rowId, $sessionId);
        if (!$row) {
            return $this->json($response, ['error' => 'الصف غير موجود'], 404);
        }
        $walletId = (int)($data['wallet_id'] ?? 0);
        $wallet = Wallet::findUserWallet($walletId, $userId);
        if (!$wallet) {
            return $this->json($response, ['error' => 'المحفظة غير موجودة'], 404);
        }
        $type = $row['direction'] === 'in' ? 'deposit' : 'withdraw';
        $amount = (float)$row['amount'];
        // insufficient balance check for withdraws
        if ($type === 'withdraw' && (float)$wallet['balance'] < $amount) {
            return $this->json($response, ['error' => 'الرصيد غير كافٍ'], 422);
        }

        $db = Database::getConnection();
        \FinanceHub\Support\Transaction::run(function () use ($db, $userId, $walletId, $type, $amount, $row, $rowId) {
            $db->prepare(
                'INSERT INTO actions (user_id, wallet_id, type, amount, category_id, description, date, tag)
                 VALUES (?, ?, ?, ?, NULL, ?, ?, ?)'
            )->execute([
                $userId, $walletId, $type, $amount, $row['description'], $row['row_date'], 'reconciliation',
            ]);
            $actionId = (int)$db->lastInsertId();
            $sign = $type === 'deposit' ? 1 : -1;
            $db->prepare('UPDATE wallets SET balance = balance + ? WHERE id = ? AND user_id = ?')
                ->execute([$sign * $amount, $walletId, $userId]);
            Reconciliation::setMatch($rowId, $actionId, 'created');
        });

        return $this->json($response, ['message' => 'تم إنشاء العملية', 'rows' => Reconciliation::getRows($sessionId)]);
    }

    public function complete(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $session = Reconciliation::findSession((int)$args['id'], $userId);
        if (!$session) {
            return $this->json($response, ['error' => 'الجلسة غير موجودة'], 404);
        }
        Reconciliation::setStatus((int)$args['id'], 'completed');
        return $this->json($response, ['message' => 'تم إكمال المطابقة']);
    }

    public function delete(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        if (!Reconciliation::deleteSession((int)$args['id'], $userId)) {
            return $this->json($response, ['error' => 'الجلسة غير موجودة'], 404);
        }
        return $this->json($response, ['message' => 'تم حذف الجلسة']);
    }

    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}