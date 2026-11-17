<?php

namespace FinanceHub\Controllers;

use FinanceHub\Models\Anomaly;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class AnomalyController
{
    public function index(Request $request, Response $response): Response
    {
        $userId = $request->getAttribute('user_id');
        $params = $request->getQueryParams();
        $anomalies = Anomaly::findAllByUser($userId, $params['severity'] ?? null);
        return $this->json($response, ['anomalies' => $anomalies]);
    }

    public function markRead(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        Anomaly::markAsRead((int)$args['id'], $userId);
        return $this->json($response, ['message' => 'تم تحديث الحالة']);
    }

    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}
