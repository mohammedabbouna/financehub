<?php

namespace FinanceHub\Controllers;

use FinanceHub\Models\Budget;
use FinanceHub\Services\AIAdvisorService;
use FinanceHub\Support\Validator;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class BudgetController
{
    private AIAdvisorService $ai;

    public function __construct()
    {
        $this->ai = new AIAdvisorService();
    }

    public function index(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $params = $request->getQueryParams();

        $month = null;
        $year = null;
        if (isset($params['month']) && $params['month'] !== '') {
            if (!is_numeric($params['month']) || (int)$params['month'] < 1 || (int)$params['month'] > 12) {
                return $this->json($response, ['error' => 'رقم الشهر يجب أن يكون بين 1 و 12'], 422);
            }
            $month = (int)$params['month'];
        }
        if (isset($params['year']) && $params['year'] !== '') {
            if (!is_numeric($params['year']) || (int)$params['year'] < 1970 || (int)$params['year'] > 2200) {
                return $this->json($response, ['error' => 'السنة غير صالحة'], 422);
            }
            $year = (int)$params['year'];
        }

        $budgets = Budget::findAllByUser($userId, $month, $year);
        return $this->json($response, ['budgets' => $budgets]);
    }

    public function show(Request $request, Response $response, array $args): Response
    {
        $userId = $request->getAttribute('user_id');
        $budget = Budget::findUserBudget((int)$args['id'], $userId);
        if (!$budget) {
            return $this->json($response, ['error' => 'الميزانية غير موجودة'], 404);
        }
        return $this->json($response, ['budget' => $budget]);
    }

    public function create(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $data = $request->getParsedBody() ?: [];

        $error = Validator::required($data, ['category_id', 'amount']);
        if ($error !== null) {
            return $this->json($response, ['error' => 'الفئة والمبلغ مطلوبان'], 400);
        }

        if (!Validator::isPositiveAmount($data['amount'])) {
            return $this->json($response, ['error' => 'المبلغ يجب أن يكون أكبر من صفر'], 422);
        }

        $error = Validator::validateEnums($data, ['period' => 'budget_period']);
        if ($error !== null) {
            return $this->json($response, ['error' => $error], 422);
        }

        $error = Validator::validateReferences($userId, $data, ['category_id' => 'category']);
        if ($error !== null) {
            return $this->json($response, ['error' => $error], 422);
        }

        $id = Budget::create([
            'user_id' => $userId,
            'category_id' => (int)$data['category_id'],
            'period' => $data['period'] ?? 'monthly',
            'amount' => round((float)$data['amount'], 2),
            'is_percentage' => (bool)($data['is_percentage'] ?? false),
            'auto_suggested' => (bool)($data['auto_suggested'] ?? false),
        ]);

        return $this->json($response, ['budget' => Budget::findById($id), 'message' => 'تم إنشاء الميزانية بنجاح'], 201);
    }

    public function update(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $budget = Budget::findUserBudget((int)$args['id'], $userId);
        if (!$budget) {
            return $this->json($response, ['error' => 'الميزانية غير موجودة'], 404);
        }

        $data = $request->getParsedBody() ?: [];
        if (array_key_exists('amount', $data) && !Validator::isPositiveAmount($data['amount'])) {
            return $this->json($response, ['error' => 'المبلغ يجب أن يكون أكبر من صفر'], 422);
        }
        $error = Validator::validateReferences($userId, $data, ['category_id' => 'category']);
        if ($error !== null) {
            return $this->json($response, ['error' => $error], 422);
        }

        Budget::update((int)$args['id'], $data);
        return $this->json($response, ['message' => 'تم تحديث الميزانية بنجاح']);
    }

    public function autoSuggest(Request $request, Response $response): Response
    {
        $userId = $request->getAttribute('user_id');
        $suggestions = $this->ai->suggestBudgets($userId);
        return $this->json($response, $suggestions);
    }

    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}
