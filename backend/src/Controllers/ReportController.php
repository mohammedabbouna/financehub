<?php

namespace FinanceHub\Controllers;

use FinanceHub\Services\AIAdvisorService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Monthly report (التقرير الشهري): real numbers + narrative + 3
 * recommendations. Historical months are supported so the user can browse
 * past reports; the period is validated before hitting the data layer.
 */
class ReportController
{
    private AIAdvisorService $ai;

    public function __construct()
    {
        $this->ai = new AIAdvisorService();
    }

    public function monthly(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $year = (int)($args['year'] ?? 0);
        $month = (int)($args['month'] ?? 0);
        $nowYear = (int)date('Y');
        $nowMonth = (int)date('n');

        if ($month < 1 || $month > 12 || $year < 2000 || $year > $nowYear + 1) {
            return $this->json($response, ['error' => 'فترة غير صالحة'], 422);
        }
        if ($year > $nowYear || ($year === $nowYear && $month > $nowMonth)) {
            return $this->json($response, ['error' => 'لا يمكن توليد تقرير لشهر مستقبلي'], 422);
        }

        $report = $this->ai->generateMonthlyReport($userId, $year, $month);
        return $this->json($response, ['report' => $report]);
    }

    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}
