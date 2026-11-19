<?php

namespace FinanceHub\Controllers;

use FinanceHub\Config\Database;
use FinanceHub\Models\Wallet;
use FinanceHub\Support\Validator;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class WalletController
{
    public function index(Request $request, Response $response): Response
    {
        $userId = $request->getAttribute('user_id');
        $wallets = Wallet::findAllByUser($userId);
        $totalAssets = Wallet::getTotalAssets($userId);
        return $this->json($response, ['wallets' => $wallets, 'total_assets' => $totalAssets]);
    }

    public function show(Request $request, Response $response, array $args): Response
    {
        $userId = $request->getAttribute('user_id');
        $wallet = Wallet::findUserWallet((int)$args['id'], $userId);
        if (!$wallet) {
            return $this->json($response, ['error' => 'المحفظة غير موجودة'], 404);
        }
        return $this->json($response, ['wallet' => $wallet]);
    }

    public function create(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $data = $request->getParsedBody() ?: [];

        if (empty($data['name'])) {
            return $this->json($response, ['error' => 'اسم المحفظة مطلوب'], 400);
        }
        if (!is_string($data['name']) || mb_strlen(trim($data['name'])) < 1 || mb_strlen($data['name']) > 100) {
            return $this->json($response, ['error' => 'اسم المحفظة يجب أن يكون بين 1 و 100 حرف'], 422);
        }
        if (isset($data['type']) && !Validator::inEnum($data['type'], 'wallet_type')) {
            return $this->json($response, ['error' => 'نوع المحفظة غير صالح'], 422);
        }
        if (array_key_exists('balance', $data) && $data['balance'] !== null && $data['balance'] !== ''
            && !is_numeric($data['balance'])) {
            return $this->json($response, ['error' => 'الرصيد الافتتاحي غير صالح'], 422);
        }
        if (isset($data['color']) && $data['color'] !== null && !preg_match('/^#[0-9a-fA-F]{6}$/', (string)$data['color'])) {
            return $this->json($response, ['error' => 'اللون غير صالح'], 422);
        }

        $id = Wallet::create([
            'user_id' => $userId,
            'name' => trim($data['name']),
            'type' => $data['type'] ?? 'cash',
            'currency' => $data['currency'] ?? 'DZD',
            'balance' => round((float)($data['balance'] ?? 0), 2),
            'icon' => $data['icon'] ?? '💰',
            'color' => $data['color'] ?? '#3b82f6',
        ]);

        $wallet = Wallet::findById($id);
        \FinanceHub\Models\AuditLog::record($userId, 'create', 'wallet', $id, ['name' => $data['name'] ?? null], $request->getServerParams()['REMOTE_ADDR'] ?? null);
        return $this->json($response, ['wallet' => $wallet, 'message' => 'تم إنشاء المحفظة بنجاح'], 201);
    }

    public function update(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $walletId = (int)$args['id'];
        $wallet = Wallet::findUserWallet($walletId, $userId);
        if (!$wallet) {
            return $this->json($response, ['error' => 'المحفظة غير موجودة'], 404);
        }

        $data = $request->getParsedBody() ?: [];

        if (array_key_exists('name', $data)) {
            if (!is_string($data['name']) || trim($data['name']) === '' || mb_strlen($data['name']) > 100) {
                return $this->json($response, ['error' => 'اسم المحفظة يجب أن يكون بين 1 و 100 حرف'], 422);
            }
            $data['name'] = trim($data['name']);
        }
        if (array_key_exists('type', $data) && !Validator::inEnum($data['type'], 'wallet_type')) {
            return $this->json($response, ['error' => 'نوع المحفظة غير صالح'], 422);
        }
        if (array_key_exists('color', $data) && $data['color'] !== null && !preg_match('/^#[0-9a-fA-F]{6}$/', (string)$data['color'])) {
            return $this->json($response, ['error' => 'اللون غير صالح'], 422);
        }

        // ─── Balance change → régularisation d'un écart de caisse ────────────
        // Instead of silently overwriting the stored balance (which would break
        // the audit trail), record the difference as a movement: a positive
        // difference becomes a deposit, a negative one a withdraw. The wallet
        // balance is then set to the requested value in the same transaction.
        $regularization = null;
        if (array_key_exists('balance', $data)) {
            if (!is_numeric($data['balance'])) {
                return $this->json($response, ['error' => 'الرصيد غير صالح'], 422);
            }
            $newBalance = round((float)$data['balance'], 2);
            $oldBalance = round((float)$wallet['balance'], 2);
            $diff = round($newBalance - $oldBalance, 2);

            if ($diff !== 0.0) {
                \FinanceHub\Support\Transaction::run(function () use (
                    $userId, $walletId, $diff, $newBalance, &$regularization
                ) {
                    $db = Database::getConnection();
                    $type = $diff > 0 ? 'deposit' : 'withdraw';
                    $amount = abs($diff);
                    $db->prepare(
                        'INSERT INTO actions (user_id, wallet_id, type, amount, category_id, description, date, tag)
                         VALUES (?, ?, ?, ?, NULL, ?, ?, ?)'
                    )->execute([
                        $userId,
                        $walletId,
                        $type,
                        $amount,
                        'regularisation d\'un écart de caisse',
                        date('Y-m-d'),
                        'regularization',
                    ]);
                    $actionId = (int)$db->lastInsertId();

                    $db->prepare('UPDATE wallets SET balance = ? WHERE id = ? AND user_id = ?')
                        ->execute([$newBalance, $walletId, $userId]);

                    $regularization = [
                        'action_id' => $actionId,
                        'type' => $type,
                        'amount' => $amount,
                        'difference' => $diff,
                    ];
                    return true;
                });
            } else {
                // No movement, but still allow other field updates below.
            }
            unset($data['balance']);
        }

        // Apply the remaining (non-balance) field updates.
        Wallet::update($walletId, $data);

        $updated = Wallet::findById($walletId);
        $payload = ['message' => 'تم تحديث المحفظة بنجاح', 'wallet' => $updated];
        if ($regularization !== null) {
            $payload['regularization'] = $regularization;
            $payload['message'] = 'تم تحديث المحفظة وتسجيل regularisation d\'un écart de caisse';
        }
        return $this->json($response, $payload);
    }

    public function archive(Request $request, Response $response, array $args): Response
    {
        $userId = $request->getAttribute('user_id');
        $wallet = Wallet::findUserWallet((int)$args['id'], $userId);
        if (!$wallet) {
            return $this->json($response, ['error' => 'المحفظة غير موجودة'], 404);
        }

        Wallet::archive((int)$args['id']);
        return $this->json($response, ['message' => 'تم أرشفة المحفظة بنجاح']);
    }

    /**
     * GET /networth?from=&to= — daily cumulative net worth.
     *
     * Wallet balances are stored as they are today, so each historical point
     * is reconstructed as: current assets − (signed flow after that day).
     * Sign convention mirrors ActionController: deposit/borrow +,
     * withdraw/invest/repay −, transfer nets to zero across both legs.
     */
    public function netWorth(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $query = $request->getQueryParams();
        $to = is_string($query['to'] ?? null) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $query['to'])
            ? $query['to'] : date('Y-m-d');
        $from = is_string($query['from'] ?? null) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $query['from'])
            ? $query['from'] : date('Y-m-d', strtotime('-30 days', strtotime($to)));

        if ($from > $to) {
            return $this->json($response, ['error' => 'تاريخ البداية بعد تاريخ النهاية'], 422);
        }
        // Guard against absurd ranges (daily loop must stay bounded).
        if ((strtotime($to) - strtotime($from)) / 86400 > 1100) {
            return $this->json($response, ['error' => 'النطاق الأقصى 3 سنوات'], 422);
        }

        $totalAssets = round(Wallet::getTotalAssets($userId), 2);

        // Signed daily flows from `from` onward (inclusive).
        $stmt = Database::getConnection()->prepare(
            "SELECT date,
                    SUM(CASE
                        WHEN type IN ('deposit', 'borrow') THEN amount
                        WHEN type IN ('withdraw', 'invest', 'repay') THEN -amount
                        ELSE 0
                    END) AS net
             FROM actions
             WHERE user_id = ? AND date >= ? AND date <= ?
             GROUP BY date
             ORDER BY date"
        );
        $stmt->execute([$userId, $from, $to]);
        $dailyNet = [];
        foreach ($stmt->fetchAll() as $row) {
            $dailyNet[$row['date']] = (float)$row['net'];
        }

        // Balance at end of day (from − 1) = current − everything from `from` on.
        $balance = $totalAssets - array_sum($dailyNet);

        $points = [];
        $cursor = strtotime($from);
        $end = strtotime($to);
        while ($cursor <= $end) {
            $day = date('Y-m-d', $cursor);
            $balance += $dailyNet[$day] ?? 0.0;
            $points[] = ['date' => $day, 'balance' => round($balance, 2)];
            $cursor = strtotime('+1 day', $cursor);
        }

        $first = $points[0]['balance'] ?? $totalAssets;
        $last = $points ? end($points)['balance'] : $totalAssets;

        return $this->json($response, [
            'points' => $points,
            'from' => $from,
            'to' => $to,
            'current' => $totalAssets,
            'start' => $first,
            'end' => $last,
            'change' => round($last - $first, 2),
            'change_percent' => $first > 0 ? round(($last - $first) / $first * 100, 1) : null,
        ]);
    }

    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}
