<?php

namespace FinanceHub\Controllers;

use FinanceHub\Models\Notification;
use FinanceHub\Support\JsonResponse;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class NotificationController
{
    use JsonResponse;

    public function index(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        return $this->json($response, [
            'notifications' => Notification::findAllByUser($userId),
            'unread_count' => Notification::unreadCount($userId),
        ]);
    }

    public function unreadCount(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        return $this->json($response, ['unread_count' => Notification::unreadCount($userId)]);
    }

    public function markRead(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $updated = Notification::markAsRead((int)$args['id'], $userId);
        if (!$updated) {
            // Either it does not belong to this user or it was already read —
            // both are safe no-ops for the client (idempotent endpoint).
            $stmt = \FinanceHub\Config\Database::getConnection()->prepare(
                'SELECT id FROM notifications WHERE id = ? AND user_id = ?'
            );
            $stmt->execute([(int)$args['id'], $userId]);
            if (!$stmt->fetch()) {
                return $this->json($response, ['error' => 'الإشعار غير موجود'], 404);
            }
        }

        return $this->json($response, ['unread_count' => Notification::unreadCount($userId)]);
    }

    public function markAllRead(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        Notification::markAllAsRead($userId);
        return $this->json($response, ['unread_count' => 0, 'message' => 'تم تعليم الكل كمقروء']);
    }
}
