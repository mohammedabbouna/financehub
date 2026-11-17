<?php

namespace FinanceHub\Controllers;

use FinanceHub\Models\Investment;
use FinanceHub\Support\Validator;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class InvestmentController
{
    public function index(Request $request, Response $response): Response
    {
        $userId = $request->getAttribute('user_id');
        $investments = Investment::findAllByUser($userId);
        $summary = Investment::getPortfolioSummary($userId);

        $totalValue = 0;
        $totalCost = 0;
        foreach ($summary as $s) {
            $totalValue += $s['current_value'];
            $totalCost += $s['cost_basis'];
        }

        return $this->json($response, [
            'investments' => $investments,
            'portfolio_summary' => $summary,
            'total_value' => $totalValue,
            'total_cost' => $totalCost,
            'total_pnl' => $totalValue - $totalCost,
        ]);
    }

    public function show(Request $request, Response $response, array $args): Response
    {
        $userId = $request->getAttribute('user_id');
        $investment = Investment::findUserInvestment((int)$args['id'], $userId);
        if (!$investment) {
            return $this->json($response, ['error' => 'الاستثمار غير موجود'], 404);
        }
        return $this->json($response, ['investment' => $investment]);
    }

    public function create(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $data = $request->getParsedBody() ?: [];

        $error = Validator::required($data, ['asset_type', 'name', 'quantity', 'purchase_price']);
        if ($error !== null) {
            return $this->json($response, ['error' => 'نوع الأصل والاسم والكمية وسعر الشراء مطلوبة'], 400);
        }

        if (!Validator::inEnum($data['asset_type'], 'investment_asset_type')) {
            return $this->json($response, ['error' => 'نوع الأصل غير صالح'], 422);
        }
        if (!is_numeric($data['quantity']) || (float)$data['quantity'] <= 0) {
            return $this->json($response, ['error' => 'الكمية يجب أن تكون أكبر من صفر'], 422);
        }
        if (!Validator::isPositiveAmount($data['purchase_price'])) {
            return $this->json($response, ['error' => 'سعر الشراء يجب أن يكون أكبر من صفر'], 422);
        }
        if (isset($data['current_price']) && $data['current_price'] !== null && $data['current_price'] !== ''
            && (!is_numeric($data['current_price']) || (float)$data['current_price'] < 0)) {
            return $this->json($response, ['error' => 'السعر الحالي غير صالح'], 422);
        }
        if (!Validator::maxLength($data['name'], 255)) {
            return $this->json($response, ['error' => 'اسم الأصل طويل جداً'], 422);
        }

        if (isset($data['ticker']) && $data['ticker'] !== null && $data['ticker'] !== '' && mb_strlen($data['ticker']) > 64) {
            return $this->json($response, ['error' => 'الرمز (ticker) طويل جداً'], 422);
        }

        $error = Validator::validateReferences($userId, $data, ['wallet_id' => 'wallet']);
        if ($error !== null) {
            return $this->json($response, ['error' => $error], 422);
        }

        $id = Investment::create([
            'user_id' => $userId,
            'wallet_id' => $data['wallet_id'] ?? null,
            'asset_type' => $data['asset_type'],
            'name' => $data['name'],
            'ticker' => isset($data['ticker']) && $data['ticker'] !== '' ? trim((string)$data['ticker']) : null,
            'quantity' => (float)$data['quantity'],
            'purchase_price' => round((float)$data['purchase_price'], 2),
            'current_price' => round((float)($data['current_price'] ?? $data['purchase_price']), 2),
            'currency' => $data['currency'] ?? 'DZD',
            'notes' => $data['notes'] ?? null,
        ]);

        return $this->json($response, ['investment' => Investment::findById($id), 'message' => 'تم إضافة الاستثمار بنجاح'], 201);
    }

    public function update(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $investment = Investment::findUserInvestment((int)$args['id'], $userId);
        if (!$investment) {
            return $this->json($response, ['error' => 'الاستثمار غير موجود'], 404);
        }

        $data = $request->getParsedBody() ?: [];
        $error = Validator::validateEnums($data, ['asset_type' => 'investment_asset_type']);
        if ($error !== null) {
            return $this->json($response, ['error' => $error], 422);
        }
        foreach (['quantity', 'purchase_price', 'current_price'] as $field) {
            if (array_key_exists($field, $data) && $data[$field] !== null && $data[$field] !== ''
                && (!is_numeric($data[$field]) || (float)$data[$field] <= 0)) {
                return $this->json($response, ['error' => "القيمة غير صالحة للحقل {$field}"], 422);
            }
        }
        if (isset($data['ticker']) && $data['ticker'] !== null && $data['ticker'] !== '' && mb_strlen($data['ticker']) > 64) {
            return $this->json($response, ['error' => 'الرمز (ticker) طويل جداً'], 422);
        }

        $error = Validator::validateReferences($userId, $data, ['wallet_id' => 'wallet']);
        if ($error !== null) {
            return $this->json($response, ['error' => $error], 422);
        }
        if (isset($data['ticker']) && $data['ticker'] !== null && $data['ticker'] !== '' && mb_strlen($data['ticker']) > 64) {
            return $this->json($response, ['error' => 'الرمز (ticker) طويل جداً'], 422);
        }

        Investment::update((int)$args['id'], $data);
        return $this->json($response, ['message' => 'تم تحديث الاستثمار بنجاح']);
    }

    /**
     * POST /investments/{id}/refresh-price — fetch live price from Yahoo/CoinGecko.
     */
    public function refreshPrice(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $investment = Investment::findUserInvestment((int)$args['id'], $userId);
        if (!$investment) {
            return $this->json($response, ['error' => 'الاستثمار غير موجود'], 404);
        }
        $ticker = $investment['ticker'] ?? null;
        if ($ticker === null || $ticker === '') {
            return $this->json($response, ['error' => 'لم يتم تحديد رمز (ticker) لهذا الاستثمار'], 422);
        }
        $provider = new \FinanceHub\Services\PriceProvider();
        $price = $provider->fetch((string)$investment['asset_type'], (string)$ticker);
        if ($price === null) {
            return $this->json($response, ['error' => 'تعذر جلب السعر (تحقق من الرمز/الاتصال)'], 502);
        }
        Investment::updatePrice((int)$args['id'], $price);
        $updated = Investment::findById((int)$args['id']);
        return $this->json($response, [
            'message' => 'تم تحديث السعر',
            'current_price' => $price,
            'investment' => $updated,
        ]);
    }

    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}
