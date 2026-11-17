<?php

namespace FinanceHub\Controllers;

use FinanceHub\Models\Bill;
use FinanceHub\Support\Validator;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class BillController
{
    public function index(Request $request, Response $response): Response
    {
        $userId = $request->getAttribute('user_id');
        $bills = Bill::findAllByUser($userId);
        return $this->json($response, ['bills' => $bills]);
    }

    public function upcoming(Request $request, Response $response): Response
    {
        $userId = $request->getAttribute('user_id');
        $params = $request->getQueryParams();
        $days = (int)($params['days'] ?? 7);
        $bills = Bill::findUpcoming($userId, $days);

        $totalDue = array_sum(array_column($bills, 'amount'));

        return $this->json($response, [
            'bills' => $bills,
            'total_due' => $totalDue,
            'count' => count($bills),
        ]);
    }

    public function show(Request $request, Response $response, array $args): Response
    {
        $userId = $request->getAttribute('user_id');
        $bill = Bill::findUserBill((int)$args['id'], $userId);
        if (!$bill) {
            return $this->json($response, ['error' => 'الفاتورة غير موجودة'], 404);
        }
        return $this->json($response, ['bill' => $bill]);
    }

    public function create(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $data = $request->getParsedBody() ?: [];

        $error = Validator::required($data, ['name', 'amount', 'due_date']);
        if ($error !== null) {
            return $this->json($response, ['error' => 'الاسم والمبلغ وتاريخ الاستحقاق مطلوبة'], 400);
        }

        if (!Validator::isPositiveAmount($data['amount'])) {
            return $this->json($response, ['error' => 'المبلغ يجب أن يكون أكبر من صفر'], 422);
        }
        if (!Validator::isDate($data['due_date'])) {
            return $this->json($response, ['error' => 'تاريخ الاستحقاق غير صالح (الصيغة: YYYY-MM-DD)'], 422);
        }
        if (!Validator::maxLength($data['name'], 255)) {
            return $this->json($response, ['error' => 'اسم الفاتورة طويل جداً'], 422);
        }
        if (array_key_exists('recurring_frequency', $data) && $data['recurring_frequency'] !== null && $data['recurring_frequency'] !== ''
            && !Validator::inEnum($data['recurring_frequency'], 'bill_frequency')) {
            return $this->json($response, ['error' => 'تكرار غير صالح'], 422);
        }

        $error = Validator::validateReferences($userId, $data, [
            'category_id' => 'category',
            'wallet_id' => 'wallet',
        ]);
        if ($error !== null) {
            return $this->json($response, ['error' => $error], 422);
        }

        $id = Bill::create([
            'user_id' => $userId,
            'name' => $data['name'],
            'amount' => round((float)$data['amount'], 2),
            'due_date' => $data['due_date'],
            'category_id' => $data['category_id'] ?? null,
            'wallet_id' => $data['wallet_id'] ?? null,
            'reminder_days_before' => max(0, min(30, (int)($data['reminder_days_before'] ?? 3))),
            'is_recurring' => (bool)($data['is_recurring'] ?? false),
            'recurring_frequency' => $data['recurring_frequency'] ?? null,
        ]);

        return $this->json($response, ['bill' => Bill::findById($id), 'message' => 'تم إضافة الفاتورة بنجاح'], 201);
    }

    public function markPaid(Request $request, Response $response, array $args): Response
    {
        $userId = $request->getAttribute('user_id');
        $bill = Bill::findUserBill((int)$args['id'], $userId);
        if (!$bill) {
            return $this->json($response, ['error' => 'الفاتورة غير موجودة'], 404);
        }

        Bill::markAsPaid((int)$args['id']);
        return $this->json($response, ['message' => 'تم تحديث حالة الفاتورة']);
    }

    public function update(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $bill = Bill::findUserBill((int)$args['id'], $userId);
        if (!$bill) {
            return $this->json($response, ['error' => 'الفاتورة غير موجودة'], 404);
        }

        $data = $request->getParsedBody() ?: [];
        if (array_key_exists('amount', $data) && !Validator::isPositiveAmount($data['amount'])) {
            return $this->json($response, ['error' => 'المبلغ يجب أن يكون أكبر من صفر'], 422);
        }
        if (array_key_exists('due_date', $data) && $data['due_date'] !== null && !Validator::isDate($data['due_date'])) {
            return $this->json($response, ['error' => 'تاريخ الاستحقاق غير صالح'], 422);
        }
        $error = Validator::validateReferences($userId, $data, [
            'category_id' => 'category',
            'wallet_id' => 'wallet',
        ]);
        if ($error !== null) {
            return $this->json($response, ['error' => $error], 422);
        }

        Bill::update((int)$args['id'], $data);
        return $this->json($response, ['message' => 'تم تحديث الفاتورة بنجاح']);
    }

    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}
