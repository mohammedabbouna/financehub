<?php

namespace FinanceHub\Controllers;

use FinanceHub\Config\Database;
use FinanceHub\Services\AIAdvisorService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class AIChatController
{
    private AIAdvisorService $ai;

    public function __construct()
    {
        $this->ai = new AIAdvisorService();
    }

    public function chat(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $data = $request->getParsedBody() ?: [];

        if (empty($data['message']) || !is_string($data['message'])) {
            return $this->json($response, ['error' => 'الرسالة مطلوبة'], 400);
        }

        $message = trim($data['message']);
        if ($message === '' || mb_strlen($message) > 2000) {
            return $this->json($response, ['error' => 'الرسالة مطلوبة (بحد أقصى 2000 حرف)'], 422);
        }

        // History is read BEFORE inserting the current message so the model
        // doesn't receive the same message twice (history + explicit prompt).
        $historyStmt = Database::getConnection()->prepare(
            'SELECT role, message FROM ai_chat_history WHERE user_id = ? ORDER BY id DESC LIMIT 20'
        );
        $historyStmt->execute([$userId]);
        $history = array_reverse($historyStmt->fetchAll());

        // Phase 4: «هل أ semiclass؟» — a structured local analysis with real
        // numbers (forecast + reserve + obligations). It answers even when
        // no AI key is configured, so it never falls through to a generic
        // model reply that can't run the math.
        $analysis = null;
        $result = []; // the structured branch never calls the model
        if ($this->ai->isAffordabilityQuestion($message)) {
            $analysis = $this->ai->affordabilityAnalysis($userId, $message);
            $responseText = $this->ai->formatAffordabilityText($analysis);
        } else {
            $result = $this->ai->chat($userId, $message, $history);
            $responseText = $result['response'] ?? $result['raw'] ?? '';

            if (!is_string($responseText) || $responseText === '') {
                $responseText = json_encode($result, JSON_UNESCAPED_UNICODE);
            }
        }

        $stmt = Database::getConnection()->prepare(
            'INSERT INTO ai_chat_history (user_id, role, message) VALUES (?, ?, ?)'
        );
        $stmt->execute([$userId, 'user', $message]);
        $stmt->execute([$userId, 'assistant', $responseText]);

        $aiAvailable = $analysis !== null || empty($result['note']);

        return $this->json($response, [
            'response' => $responseText,
            'ai_available' => $aiAvailable,
            'analysis' => $analysis,
        ]);
    }

    public function history(Request $request, Response $response): Response
    {
        $userId = $request->getAttribute('user_id');
        $stmt = Database::getConnection()->prepare(
            'SELECT id, role, message, created_at FROM ai_chat_history WHERE user_id = ? ORDER BY created_at ASC LIMIT 100'
        );
        $stmt->execute([$userId]);
        return $this->json($response, ['history' => $stmt->fetchAll()]);
    }

    public function clearHistory(Request $request, Response $response): Response
    {
        $userId = $request->getAttribute('user_id');
        Database::getConnection()->prepare('DELETE FROM ai_chat_history WHERE user_id = ?')->execute([$userId]);
        return $this->json($response, ['message' => 'تم مسح سجل المحادثة']);
    }

    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}
