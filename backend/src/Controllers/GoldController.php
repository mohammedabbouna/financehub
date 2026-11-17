<?php

namespace FinanceHub\Controllers;

use FinanceHub\Models\Investment;
use FinanceHub\Services\GoldPriceService;
use FinanceHub\Support\JsonResponse;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Gold (الذهب): live DZD price per gram (cached daily) + the user's own
 * gold holdings valued at that price, plus a simple savings projection.
 */
class GoldController
{
    use JsonResponse;

    private GoldPriceService $gold;

    public function __construct()
    {
        $this->gold = new GoldPriceService();
    }

    /** GET /gold/price — cached daily, refreshed on demand. */
    public function price(Request $request, Response $response): Response
    {
        $refresh = isset($_GET['refresh']) && $_GET['refresh'] === '1';
        $price = $this->gold->currentPrice($refresh);

        if ($price === null) {
            return $this->json($response, [
                'error' => 'تعذّر جلب سعر الذهب (لا يوجد اتصال ولا سعر محفوظ)',
            ], 503);
        }

        return $this->json($response, [
            'price_usd_oz' => $price['price_usd_oz'],
            'usd_dzd' => $price['usd_dzd'],
            'price_dzd_gram' => $price['price_dzd_gram'],
            'price_dzd_gram_display' => number_format($price['price_dzd_gram'], 2),
            'price_date' => $price['price_date'],
            'source' => $price['source'],
            'is_stale' => $price['is_stale'],
            'fetched_at' => date('c'),
        ]);
    }

    /**
     * GET /gold/holdings — the user's gold investments in grams, valued at
     * the current price, plus a projection of what a target number of grams
     * costs to reach (ادخار الخطة).
     */
    public function holdings(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $price = $this->gold->currentPrice();
        $pricePerGram = $price !== null ? (float)$price['price_dzd_gram'] : null;

        $investments = Investment::findAllByUser($userId);
        $goldHoldings = [];
        $totalGrams = 0.0;
        $totalValue = 0.0;
        $totalCost = 0.0;

        foreach ($investments as $inv) {
            if (($inv['asset_type'] ?? '') !== 'gold') {
                continue;
            }
            $grams = (float)$inv['quantity'];
            $recorded = (float)$inv['current_price'];
            $value = ($pricePerGram !== null && $grams > 0) ? $grams * $pricePerGram : $grams * $recorded;
            $totalGrams += $grams;
            $totalValue += $value;
            $totalCost += $grams * (float)$inv['purchase_price'];

            $goldHoldings[] = [
                'id' => (int)$inv['id'],
                'name' => $inv['name'],
                'grams' => round($grams, 3),
                'purchase_price' => (float)$inv['purchase_price'],
                'recorded_price' => $recorded,
                'value_now' => round($value, 2),
                'pnl' => round($value - $grams * (float)$inv['purchase_price'], 2),
            ];
        }

        // Savings plan: how much per month to reach a target weight of gold.
        $targetGrams = 85.0; // nisab
        $missingGrams = max(0, $targetGrams - $totalGrams);
        $months = 12;
        $perMonth = $pricePerGram !== null ? round($missingGrams * $pricePerGram / $months, 2) : null;

        return $this->json($response, [
            'price' => $price,
            'holdings' => $goldHoldings,
            'summary' => [
                'total_grams' => round($totalGrams, 3),
                'total_value' => round($totalValue, 2),
                'total_cost' => round($totalCost, 2),
                'pnl' => round($totalValue - $totalCost, 2),
            ],
            'plan' => [
                'target_grams' => $targetGrams,
                'missing_grams' => round($missingGrams, 3),
                'months' => $months,
                'per_month' => $perMonth,
                'total_to_save' => $pricePerGram !== null ? round($missingGrams * $pricePerGram, 2) : null,
            ],
        ]);
    }
}
