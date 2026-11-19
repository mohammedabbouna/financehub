<?php
namespace FinanceHub\Controllers;

use FinanceHub\Models\AuditLog;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class AuditController
{
    public function index(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $logs = AuditLog::listByUser($userId, 200);
        return $this->json($response, ['logs' => $logs]);
    }

    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}
