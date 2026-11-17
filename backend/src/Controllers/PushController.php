<?php

namespace FinanceHub\Controllers;

use FinanceHub\Config\Database;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class PushController
{
    public function vapidPublicKey(Request $request, Response $response): Response
    {
        $key = $_ENV['VAPID_PUBLIC_KEY'] ?? getenv('VAPID_PUBLIC_KEY') ?: '';
        return $this->json($response, ['public_key' => $key]);
    }

    public function subscribe(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $data = $request->getParsedBody() ?: [];
        $endpoint = $data['endpoint'] ?? null;
        $keys = $data['keys'] ?? [];
        $p256dh = $keys['p256dh'] ?? null;
        $auth = $keys['auth'] ?? null;

        if (!is_string($endpoint) || !is_string($p256dh) || !is_string($auth)) {
            return $this->json($response, ['error' => 'بيانات الاشتراك غير صالحة'], 422);
        }

        $db = Database::getConnection();
        // Upsert by endpoint.
        $stmt = $db->prepare('INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh), auth = VALUES(auth)');
        $stmt->execute([$userId, $endpoint, $p256dh, $auth]);
        return $this->json($response, ['message' => 'تم الاشتراك في الإشعارات']);
    }

    public function unsubscribe(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $data = $request->getParsedBody() ?: [];
        $endpoint = $data['endpoint'] ?? null;
        if (is_string($endpoint)) {
            Database::getConnection()->prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?')
                ->execute([$userId, $endpoint]);
        } else {
            Database::getConnection()->prepare('DELETE FROM push_subscriptions WHERE user_id = ?')
                ->execute([$userId]);
        }
        return $this->json($response, ['message' => 'تم إلغاء الاشتراك']);
    }

    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}