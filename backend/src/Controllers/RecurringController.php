<?php

namespace FinanceHub\Controllers;

use FinanceHub\Models\Category;
use FinanceHub\Models\RecurringTransaction;
use FinanceHub\Models\Wallet;
use FinanceHub\Services\RecurringExecutor;
use FinanceHub\Support\JsonResponse;
use FinanceHub\Support\Validator;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class RecurringController
{
    use JsonResponse;

    private const FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'];
    private const TYPES = ['deposit', 'withdraw', 'transfer', 'invest', 'borrow', 'repay'];

    public function index(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        return $this->json($response, ['recurring' => RecurringTransaction::findAllByUser($userId)]);
    }

    public function create(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $data = $request->getParsedBody() ?: [];

        $name = $this->validateName($data);
        if ($name === null) {
            return $this->json($response, ['error' => 'الاسم مطلوب (حتى 200 حرف)'], 422);
        }

        $error = $this->validateCommon($data);
        if ($error !== null) {
            return $this->json($response, ['error' => $error], 422);
        }

        // The template may arrive nested under `action_template` (frontend
        // shape) or flattened at the top level — normalize both.
        $template = $this->buildTemplate(array_merge(
            $data,
            is_array($data['action_template'] ?? null) ? $data['action_template'] : []
        ));
        $templateError = $this->validateTemplate($template, $userId);
        if ($templateError !== null) {
            return $this->json($response, ['error' => $templateError], 422);
        }

        $id = RecurringTransaction::create([
            'user_id' => $userId,
            'name' => $name,
            'action_template' => $template,
            'frequency' => $data['frequency'],
            'next_run_date' => $data['next_run_date'],
            'is_active' => $data['is_active'] ?? true,
        ]);

        return $this->json($response, [
            'recurring' => RecurringTransaction::findUserRecurring($id, $userId),
            'message' => 'تم إنشاء العملية المتكررة بنجاح',
        ], 201);
    }

    public function update(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $existing = RecurringTransaction::findUserRecurring((int)$args['id'], $userId);
        if (!$existing) {
            return $this->json($response, ['error' => 'العملية المتكررة غير موجودة'], 404);
        }

        $data = $request->getParsedBody() ?: [];
        $payload = [];

        if (array_key_exists('name', $data)) {
            $name = $this->validateName($data);
            if ($name === null) {
                return $this->json($response, ['error' => 'الاسم غير صالح'], 422);
            }
            $payload['name'] = $name;
        }

        if (array_key_exists('frequency', $data) || array_key_exists('next_run_date', $data)) {
            $error = $this->validateCommon(
                [
                    'frequency' => $data['frequency'] ?? $existing['frequency'],
                    'next_run_date' => $data['next_run_date'] ?? $existing['next_run_date'],
                ]
            );
            if ($error !== null) {
                return $this->json($response, ['error' => $error], 422);
            }
            if (array_key_exists('frequency', $data)) {
                $payload['frequency'] = $data['frequency'];
            }
            if (array_key_exists('next_run_date', $data)) {
                $payload['next_run_date'] = $data['next_run_date'];
            }
        }

        if (array_key_exists('is_active', $data)) {
            $payload['is_active'] = (bool)$data['is_active'];
        }

        // Template patch: merge over the stored one so partial edits work.
        if (array_key_exists('action_template', $data) || $this->templateFieldsPresent($data)) {
            $merged = array_merge(
                $existing['action_template'],
                $this->templateFieldsPresent($data) ? $data : [],
                is_array($data['action_template'] ?? null) ? $data['action_template'] : []
            );
            foreach (['type', 'amount', 'wallet_id', 'target_wallet_id', 'category_id', 'description', 'tag'] as $field) {
                if (array_key_exists($field, $data)) {
                    $merged[$field] = $data[$field];
                }
            }
            $templateError = $this->validateTemplate($merged, $userId);
            if ($templateError !== null) {
                return $this->json($response, ['error' => $templateError], 422);
            }
            $payload['action_template'] = $this->buildTemplate($merged);
        }

        if ($payload === []) {
            return $this->json($response, ['error' => 'لا توجد بيانات للتحديث'], 400);
        }

        RecurringTransaction::update((int)$args['id'], $payload);

        return $this->json($response, [
            'recurring' => RecurringTransaction::findUserRecurring((int)$args['id'], $userId),
            'message' => 'تم تحديث العملية المتكررة',
        ]);
    }

    public function toggle(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $existing = RecurringTransaction::findUserRecurring((int)$args['id'], $userId);
        if (!$existing) {
            return $this->json($response, ['error' => 'العملية المتكررة غير موجودة'], 404);
        }

        $newState = !$existing['is_active'];
        RecurringTransaction::update((int)$args['id'], ['is_active' => $newState]);

        return $this->json($response, [
            'recurring' => RecurringTransaction::findUserRecurring((int)$args['id'], $userId),
            'message' => $newState ? 'تم تفعيل العملية المتكررة' : 'تم إيقاف العملية المتكررة',
        ]);
    }

    /** Run the template right now (money moves immediately) and advance the schedule. */
    public function run(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $existing = RecurringTransaction::findUserRecurring((int)$args['id'], $userId);
        if (!$existing) {
            return $this->json($response, ['error' => 'العملية المتكررة غير موجودة'], 404);
        }

        $result = RecurringExecutor::execute($existing);
        if ($result['error'] !== null) {
            return $this->json($response, ['error' => $result['error']], 422);
        }

        return $this->json($response, [
            'action' => $result['action'],
            'recurring' => RecurringTransaction::findUserRecurring((int)$args['id'], $userId),
            'message' => 'تم تنفيذ العملية المتكررة فوراً',
        ], 201);
    }

    public function delete(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $existing = RecurringTransaction::findUserRecurring((int)$args['id'], $userId);
        if (!$existing) {
            return $this->json($response, ['error' => 'العملية المتكررة غير موجودة'], 404);
        }

        RecurringTransaction::delete((int)$args['id']);
        return $this->json($response, ['message' => 'تم حذف العملية المتكررة']);
    }

    // ─── Validation helpers ───────────────────────────────────────────────────

    private function validateName(array $data): ?string
    {
        if (!isset($data['name']) || !is_string($data['name']) || trim($data['name']) === '') {
            return null;
        }
        $name = trim($data['name']);
        return mb_strlen($name) <= 200 ? $name : null;
    }

    private function validateCommon(array $data): ?string
    {
        if (!isset($data['frequency']) || !in_array($data['frequency'], self::FREQUENCIES, true)) {
            return 'تكرار غير صالح (daily|weekly|monthly|yearly)';
        }
        if (!isset($data['next_run_date']) || !Validator::isDate($data['next_run_date'])) {
            return 'تاريخ التشغيل القادم غير صالح (YYYY-MM-DD)';
        }
        return null;
    }

    /** @param array<string, mixed> $template */
    private function validateTemplate(array $template, int $userId): ?string
    {
        if (!isset($template['type']) || !in_array($template['type'], self::TYPES, true)) {
            return 'نوع العملية غير صالح';
        }
        if (!Validator::isPositiveAmount($template['amount'] ?? null)) {
            return 'المبلغ يجب أن يكون أكبر من صفر';
        }
        if (empty($template['wallet_id']) || !Wallet::findUserWallet((int)$template['wallet_id'], $userId)) {
            return 'المحفظة غير موجودة أو لا تخصك';
        }
        if ($template['type'] === 'transfer') {
            $targetId = (int)($template['target_wallet_id'] ?? 0);
            if ($targetId <= 0 || !Wallet::findUserWallet($targetId, $userId)) {
                return 'المحفظة الهدف غير موجودة أو لا تخصك';
            }
            if ($targetId === (int)$template['wallet_id']) {
                return 'لا يمكن التحويل إلى نفس المحفظة';
            }
        }
        if (!empty($template['category_id'])) {
            $cat = Category::findById((int)$template['category_id']);
            if (!$cat || ($cat['user_id'] !== null && (int)$cat['user_id'] !== $userId)) {
                return 'الفئة غير موجودة أو لا تخصك';
            }
        }
        if (isset($template['description']) && $template['description'] !== null && !Validator::maxLength($template['description'], 1000)) {
            return 'الوصف طويل جداً';
        }
        if (isset($template['tag']) && $template['tag'] !== null && !Validator::maxLength($template['tag'], 50)) {
            return 'الوسم طويل جداً';
        }
        return null;
    }

    private function templateFieldsPresent(array $data): bool
    {
        foreach (['type', 'amount', 'wallet_id', 'target_wallet_id', 'category_id', 'description', 'tag'] as $field) {
            if (array_key_exists($field, $data)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Normalize the incoming payload into the stored template shape.
     * Validation lives in validateTemplate() — call it first.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private function buildTemplate(array $data): array
    {
        return [
            'type' => (string)($data['type'] ?? ''),
            'amount' => isset($data['amount']) && is_numeric($data['amount']) ? round((float)$data['amount'], 2) : null,
            'wallet_id' => !empty($data['wallet_id']) ? (int)$data['wallet_id'] : null,
            'target_wallet_id' => !empty($data['target_wallet_id']) ? (int)$data['target_wallet_id'] : null,
            'category_id' => !empty($data['category_id']) ? (int)$data['category_id'] : null,
            'description' => isset($data['description']) && $data['description'] !== null && $data['description'] !== ''
                ? trim((string)$data['description'])
                : null,
            'tag' => isset($data['tag']) && $data['tag'] !== null && $data['tag'] !== ''
                ? trim((string)$data['tag'])
                : null,
        ];
    }
}
