<?php

namespace FinanceHub\Controllers;

use FinanceHub\Models\Zakat;
use FinanceHub\Services\GoldPriceService;
use FinanceHub\Support\JsonResponse;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Zakat (الزكاة): live calculation from real balances + dated snapshots.
 * Nisab = 85 grams of gold valued at the current gold price.
 */
class ZakatController
{
    use JsonResponse;

    private const NISAB_GRAMS = 85.0;
    private const RATE = 0.025;

    private GoldPriceService $gold;

    public function __construct()
    {
        $this->gold = new GoldPriceService();
    }

    /** GET /zakat/calculate — compute without saving. */
    public function calculate(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $result = $this->compute($userId);

        return $this->json($response, $result);
    }

    /** GET /zakat/snapshots — saved history (newest first). */
    public function snapshots(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $rows = Zakat::listSnapshots($userId, 24);

        $snapshots = array_map(static function (array $row): array {
            return [
                'id' => (int)$row['id'],
                'snapshot_date' => $row['snapshot_date'],
                'cash' => (float)$row['cash'],
                'gold_value' => (float)$row['gold_value'],
                'investments_value' => (float)$row['investments_value'],
                'receivables' => (float)$row['receivables'],
                'liabilities' => (float)$row['liabilities'],
                'net_wealth' => (float)$row['net_wealth'],
                'nisab_value' => $row['nisab_value'] !== null ? (float)$row['nisab_value'] : null,
                'nisab_grams' => (float)$row['nisab_grams'],
                'zakat_due' => (float)$row['zakat_due'],
                'gold_price_dzd_gram' => $row['gold_price_dzd_gram'] !== null ? (float)$row['gold_price_dzd_gram'] : null,
                'notes' => $row['notes'],
                'created_at' => $row['created_at'],
            ];
        }, $rows);

        return $this->json($response, ['snapshots' => $snapshots]);
    }

    /** POST /zakat/snapshots — recompute and persist (values come from the server). */
    public function saveSnapshot(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $data = $request->getParsedBody() ?: [];
        $notes = isset($data['notes']) && is_string($data['notes'])
            ? mb_substr(trim($data['notes']), 0, 500)
            : null;

        $result = $this->compute($userId);
        $breakdown = $result['breakdown'];

        $id = Zakat::saveSnapshot($userId, $breakdown, [
            'snapshot_date' => $result['as_of'],
            'nisab_value' => $result['nisab']['value'],
            'nisab_grams' => self::NISAB_GRAMS,
            'zakat_due' => $result['zakat_due'],
            'gold_price_dzd_gram' => $result['nisab']['gold_price_dzd_gram'],
            'notes' => $notes,
        ]);

        return $this->json($response, [
            'message' => 'تم حفظ لقطة الزكاة',
            'snapshot' => $result + ['id' => $id],
        ], 201);
    }

    /**
     * @return array<string, mixed>
     */
    private function compute(int $userId): array
    {
        $price = $this->gold->currentPrice();
        $goldPerGram = $price !== null ? (float)$price['price_dzd_gram'] : null;

        $breakdown = Zakat::getWealthBreakdown($userId, $goldPerGram);

        $nisabValue = $goldPerGram !== null ? round(self::NISAB_GRAMS * $goldPerGram, 2) : null;
        $zakatDue = round(max(0, $breakdown['net_wealth']) * self::RATE, 2);
        $isDue = $nisabValue !== null && $breakdown['net_wealth'] >= $nisabValue;

        return [
            'as_of' => date('Y-m-d'),
            'breakdown' => $breakdown,
            'rate' => self::RATE,
            'nisab' => [
                'grams' => self::NISAB_GRAMS,
                'value' => $nisabValue,
                'gold_price_dzd_gram' => $goldPerGram,
                'reached' => $isDue,
            ],
            'zakat_due' => $zakatDue,
            'is_due' => $isDue,
            'gold_price' => $price,
        ];
    }
}
