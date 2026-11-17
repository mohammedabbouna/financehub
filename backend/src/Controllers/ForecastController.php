<?php

namespace FinanceHub\Controllers;

use FinanceHub\Services\AIAdvisorService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class ForecastController
{
    public function index(Request $request, Response $response): Response
    {
        $userId = $request->getAttribute('user_id');
        $ai = new AIAdvisorService();
        $forecast = $ai->generateForecast($userId);
        return $this->json($response, $forecast);
    }

    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}
