<?php

namespace FinanceHub\Controllers;

use FinanceHub\Models\HealthScore;
use FinanceHub\Services\AIAdvisorService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class HealthController
{
    private AIAdvisorService $ai;

    public function __construct()
    {
        $this->ai = new AIAdvisorService();
    }

    public function index(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $result = $this->ai->calculateHealthScore($userId);

        // Persist at most one snapshot per day per user — GET must stay
        // idempotent so a page refresh doesn't flood the history table.
        // (The same guard the background worker uses via HealthScore::persist.)
        HealthScore::persist($userId, $result);

        return $this->json($response, $result);
    }

    public function history(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        return $this->json($response, ['history' => HealthScore::history($userId)]);
    }

    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}
