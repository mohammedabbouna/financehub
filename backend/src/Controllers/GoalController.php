<?php

namespace FinanceHub\Controllers;

use FinanceHub\Models\Goal;
use FinanceHub\Models\Wallet;
use FinanceHub\Support\Validator;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class GoalController
{
    public function index(Request $request, Response $response): Response
    {
        $userId = $request->getAttribute('user_id');
        $goals = Goal::findAllByUser($userId);
        return $this->json($response, ['goals' => $goals]);
    }

    public function show(Request $request, Response $response, array $args): Response
    {
        $userId = $request->getAttribute('user_id');
        $goal = Goal::findUserGoal((int)$args['id'], $userId);
        if (!$goal) {
            return $this->json($response, ['error' => 'الهدف غير موجود'], 404);
        }
        return $this->json($response, ['goal' => $goal]);
    }

    public function create(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $data = $request->getParsedBody() ?: [];

        $error = Validator::required($data, ['name', 'target_amount']);
        if ($error !== null) {
            return $this->json($response, ['error' => 'اسم الهدف والمبلغ المستهدف مطلوبان'], 400);
        }

        if (!Validator::isPositiveAmount($data['target_amount'])) {
            return $this->json($response, ['error' => 'المبلغ المستهدف يجب أن يكون أكبر من صفر'], 422);
        }
        if (isset($data['current_amount']) && $data['current_amount'] !== null && $data['current_amount'] !== ''
            && (!is_numeric($data['current_amount']) || (float)$data['current_amount'] < 0)) {
            return $this->json($response, ['error' => 'المبلغ الحالي غير صالح'], 422);
        }
        if (!empty($data['target_date']) && !Validator::isDate($data['target_date'])) {
            return $this->json($response, ['error' => 'تاريخ الهدف غير صالح'], 422);
        }
        if (!Validator::maxLength($data['name'], 255)) {
            return $this->json($response, ['error' => 'اسم الهدف طويل جداً'], 422);
        }

        $error = Validator::validateReferences($userId, $data, ['linked_wallet_id' => 'wallet']);
        if ($error !== null) {
            return $this->json($response, ['error' => $error], 422);
        }

        $id = Goal::create([
            'user_id' => $userId,
            'name' => $data['name'],
            'target_amount' => round((float)$data['target_amount'], 2),
            'current_amount' => round((float)($data['current_amount'] ?? 0), 2),
            'target_date' => $data['target_date'] ?? null,
            'linked_wallet_id' => $data['linked_wallet_id'] ?? null,
            'icon' => $data['icon'] ?? '🎯',
            'color' => $data['color'] ?? '#8b5cf6',
        ]);

        return $this->json($response, ['goal' => Goal::findById($id), 'message' => 'تم إنشاء الهدف بنجاح'], 201);
    }

    public function updateProgress(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $goal = Goal::findUserGoal((int)$args['id'], $userId);
        if (!$goal) {
            return $this->json($response, ['error' => 'الهدف غير موجود'], 404);
        }

        $data = $request->getParsedBody() ?: [];
        if (!isset($data['current_amount'])) {
            return $this->json($response, ['error' => 'المبلغ الحالي مطلوب'], 400);
        }
        if (!is_numeric($data['current_amount']) || (float)$data['current_amount'] < 0) {
            return $this->json($response, ['error' => 'المبلغ الحالي غير صالح'], 422);
        }

        Goal::updateProgress((int)$args['id'], (float)$data['current_amount']);
        return $this->json($response, ['goal' => Goal::findById((int)$args['id']), 'message' => 'تم تحديث التقدم']);
    }

    public function update(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $goal = Goal::findUserGoal((int)$args['id'], $userId);
        if (!$goal) {
            return $this->json($response, ['error' => 'الهدف غير موجود'], 404);
        }

        $data = $request->getParsedBody() ?: [];
        if (array_key_exists('target_amount', $data) && !Validator::isPositiveAmount($data['target_amount'])) {
            return $this->json($response, ['error' => 'المبلغ المستهدف يجب أن يكون أكبر من صفر'], 422);
        }
        if (!empty($data['target_date']) && !Validator::isDate($data['target_date'])) {
            return $this->json($response, ['error' => 'تاريخ الهدف غير صالح'], 422);
        }
        $error = Validator::validateReferences($userId, $data, ['linked_wallet_id' => 'wallet']);
        if ($error !== null) {
            return $this->json($response, ['error' => $error], 422);
        }

        Goal::update((int)$args['id'], $data);
        return $this->json($response, ['message' => 'تم تحديث الهدف بنجاح']);
    }

    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}
