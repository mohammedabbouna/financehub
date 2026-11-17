<?php

namespace FinanceHub\Controllers;

use FinanceHub\Config\Database;
use FinanceHub\Models\Action;
use FinanceHub\Models\Wallet;
use FinanceHub\Services\AIAdvisorService;
use FinanceHub\Support\Validator;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class AllocationController
{
    private AIAdvisorService $ai;

    public function __construct()
    {
        $this->ai = new AIAdvisorService();
    }

    public function getRules(Request $request, Response $response): Response
    {
        $userId = $request->getAttribute('user_id');
        $stmt = Database::getConnection()->prepare(
            'SELECT * FROM income_allocation_rules WHERE user_id = ? AND is_active = TRUE ORDER BY priority ASC'
        );
        $stmt->execute([$userId]);
        return $this->json($response, ['rules' => $stmt->fetchAll()]);
    }

    public function createRule(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $data = $request->getParsedBody() ?: [];

        $error = Validator::required($data, ['target_type', 'target_id', 'allocation_value']);
        if ($error !== null) {
            return $this->json($response, ['error' => 'نوع الهدف والمعرف وقيمة التوزيع مطلوبة'], 400);
        }

        $error = Validator::validateEnums($data, [
            'target_type' => 'allocation_target_type',
            'allocation_type' => 'allocation_type',
        ]);
        if ($error !== null) {
            return $this->json($response, ['error' => $error], 422);
        }

        if (!is_numeric($data['allocation_value']) || (float)$data['allocation_value'] <= 0) {
            return $this->json($response, ['error' => 'قيمة التوزيع يجب أن تكون أكبر من صفر'], 422);
        }

        $allocationType = $data['allocation_type'] ?? 'percentage';
        $value = (float)$data['allocation_value'];
        if ($allocationType === 'percentage' && $value > 100) {
            return $this->json($response, ['error' => 'النسبة لا يمكن أن تتجاوز 100%'], 422);
        }

        // The target_id is polymorphic — verify it really belongs to this user.
        $targetType = $data['target_type'];
        if ($targetType === 'wallet' && !Validator::ownsWallet($userId, $data['target_id'])) {
            return $this->json($response, ['error' => 'المحفظة غير موجودة أو لا تخصك'], 422);
        }
        if ($targetType === 'category' && !Validator::ownsCategory($userId, $data['target_id'])) {
            return $this->json($response, ['error' => 'الفئة غير موجودة أو لا تخصك'], 422);
        }

        // One rule per target per user (schema has no UNIQUE constraint — enforce it here).
        $exists = Database::getConnection()->prepare(
            'SELECT id FROM income_allocation_rules
             WHERE user_id = ? AND target_type = ? AND target_id = ? AND is_active = TRUE'
        );
        $exists->execute([$userId, $targetType, (int)$data['target_id']]);
        if ($exists->fetch()) {
            return $this->json($response, ['error' => 'توجد قاعدة توزيع لهذا الهدف مسبقاً'], 409);
        }

        $stmt = Database::getConnection()->prepare(
            'INSERT INTO income_allocation_rules (user_id, target_type, target_id, allocation_type, allocation_value, priority)
             VALUES (?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $userId,
            $targetType,
            (int)$data['target_id'],
            $allocationType,
            $value,
            (int)($data['priority'] ?? 0),
        ]);

        return $this->json($response, ['message' => 'تم إنشاء قاعدة التوزيع بنجاح'], 201);
    }

    public function deleteRule(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $stmt = Database::getConnection()->prepare(
            'DELETE FROM income_allocation_rules WHERE id = ? AND user_id = ?'
        );
        $stmt->execute([(int)$args['id'], $userId]);

        if ($stmt->rowCount() === 0) {
            return $this->json($response, ['error' => 'القاعدة غير موجودة'], 404);
        }

        return $this->json($response, ['message' => 'تم حذف القاعدة']);
    }

    public function proposeAllocation(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $data = $request->getParsedBody() ?: [];

        if (empty($data['amount']) || empty($data['description'])) {
            return $this->json($response, ['error' => 'المبلغ والوصف مطلوبان'], 400);
        }

        if (!Validator::isPositiveAmount($data['amount'])) {
            return $this->json($response, ['error' => 'المبلغ يجب أن يكون أكبر من صفر'], 422);
        }

        $amount = round((float)$data['amount'], 2);

        // Get active rules
        $stmt = Database::getConnection()->prepare(
            'SELECT * FROM income_allocation_rules WHERE user_id = ? AND is_active = TRUE ORDER BY priority ASC'
        );
        $stmt->execute([$userId]);
        $rules = $stmt->fetchAll();

        if (empty($rules)) {
            // Ask AI for suggestions
            $aiResult = $this->ai->suggestIncomeAllocation($userId, $amount, $data['description']);
            return $this->json($response, [
                'proposal' => $aiResult,
                'source' => 'ai',
                'has_rules' => false,
                'message' => 'لا توجد قواعد توزيع محفوظة. تم إنشاء اقتراح ذكي.',
            ]);
        }

        // Apply rules
        $allocations = [];
        $allocatedTotal = 0;

        foreach ($rules as $rule) {
            $ruleAmount = $rule['allocation_type'] === 'percentage'
                ? $amount * ($rule['allocation_value'] / 100)
                : $rule['allocation_value'];

            $targetName = '';
            if ($rule['target_type'] === 'wallet') {
                $wallet = Wallet::findUserWallet((int)$rule['target_id'], $userId);
                $targetName = $wallet['name'] ?? 'غير معروف';
            } else {
                $catStmt = Database::getConnection()->prepare(
                    'SELECT name FROM categories WHERE id = ? AND (user_id IS NULL OR user_id = ?)'
                );
                $catStmt->execute([(int)$rule['target_id'], $userId]);
                $cat = $catStmt->fetch();
                $targetName = $cat['name'] ?? 'غير معروف';
            }

            $allocations[] = [
                'target_type' => $rule['target_type'],
                'target_id' => (int)$rule['target_id'],
                'target_name' => $targetName,
                'allocation_type' => $rule['allocation_type'],
                'percentage' => $rule['allocation_type'] === 'percentage' ? (float)$rule['allocation_value'] : null,
                'amount' => round($ruleAmount, 2),
            ];
            $allocatedTotal += $ruleAmount;
        }

        // Add remaining to general spending
        $remaining = $amount - $allocatedTotal;
        if ($remaining > 0) {
            $allocations[] = [
                'target_type' => 'category',
                'target_id' => null,
                'target_name' => 'المصاريف اليومية',
                'allocation_type' => 'fixed',
                'percentage' => round(($remaining / $amount) * 100, 1),
                'amount' => round($remaining, 2),
            ];
        }

        // Get AI suggestion for adaptive adjustment
        $aiResult = $this->ai->suggestIncomeAllocation($userId, $amount, $data['description']);

        // Log the proposed allocation
        $stmt = Database::getConnection()->prepare(
            'INSERT INTO allocation_decisions_log (user_id, proposed_allocation, status) VALUES (?, ?, ?)'
        );
        $stmt->execute([$userId, json_encode($allocations), 'pending']);
        $logId = (int)Database::getConnection()->lastInsertId();

        return $this->json($response, [
            'proposal' => [
                'allocations' => $allocations,
                'total' => $amount,
                'allocated' => round($allocatedTotal, 2),
                'remaining' => round($remaining, 2),
            ],
            'ai_suggestion' => $aiResult,
            'source' => 'rules',
            'log_id' => $logId,
            'has_rules' => true,
        ]);
    }

    public function approveAllocation(Request $request, Response $response, array $args): Response
    {
        $userId = $request->getAttribute('user_id');

        $stmt = Database::getConnection()->prepare(
            'SELECT * FROM allocation_decisions_log WHERE id = ? AND user_id = ?'
        );
        $stmt->execute([(int)$args['id'], $userId]);
        $log = $stmt->fetch();

        if (!$log) {
            return $this->json($response, ['error' => 'السجل غير موجود'], 404);
        }

        $data = $request->getParsedBody();
        $status = $data['status'] ?? 'approved';

        if (!in_array($status, ['approved', 'rejected', 'modified'])) {
            return $this->json($response, ['error' => 'حالة غير صحيحة'], 400);
        }

        Database::getConnection()->prepare(
            'UPDATE allocation_decisions_log SET status = ?, user_feedback = ? WHERE id = ?'
        )->execute([$status, $data['feedback'] ?? null, (int)$args['id']]);

        if ($status === 'approved' && !empty($data['source_action_id'])) {
            // Link back to the income action — must belong to this user.
            $actionStmt = Database::getConnection()->prepare(
                'SELECT id FROM actions WHERE id = ? AND user_id = ?'
            );
            $actionStmt->execute([(int)$data['source_action_id'], $userId]);
            if ($actionStmt->fetch()) {
                Database::getConnection()->prepare(
                    'UPDATE allocation_decisions_log SET action_id = ? WHERE id = ?'
                )->execute([(int)$data['source_action_id'], (int)$args['id']]);
            }
        }

        return $this->json($response, ['message' => 'تم تحديث حالة التوزيع']);
    }

    public function logHistory(Request $request, Response $response): Response
    {
        $userId = $request->getAttribute('user_id');
        $stmt = Database::getConnection()->prepare(
            'SELECT * FROM allocation_decisions_log WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
        );
        $stmt->execute([$userId]);
        return $this->json($response, ['history' => $stmt->fetchAll()]);
    }

    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}
