<?php

namespace FinanceHub\Controllers;

use FinanceHub\Config\Database;
use FinanceHub\Models\Insight;
use FinanceHub\Services\AIAdvisorService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class InsightController
{
    public function index(Request $request, Response $response): Response
    {
        $userId = $request->getAttribute('user_id');
        $insights = Insight::findAllByUser($userId);
        return $this->json($response, ['insights' => $insights]);
    }

    public function generate(Request $request, Response $response): Response
    {
        $userId = $request->getAttribute('user_id');
        $ai = new AIAdvisorService();
        $result = $ai->generateMonthlyInsights($userId);

        // Store generated insights — skip ones identical to the last 24h so
        // repeated generation never floods the feed with duplicates.
        foreach ($result['insights'] as $insight) {
            if (Insight::existsRecent($userId, $insight['type'], $insight['message'])) {
                continue;
            }
            Insight::create([
                'user_id' => $userId,
                'type' => $insight['type'],
                'message' => $insight['message'],
                'supporting_data' => $insight['data'] ?? [],
            ]);
        }

        return $this->json($response, $result);
    }

    public function dismiss(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        Insight::dismiss((int)$args['id'], $userId);
        return $this->json($response, ['message' => 'تم تجاهل الرؤية']);
    }

    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}
