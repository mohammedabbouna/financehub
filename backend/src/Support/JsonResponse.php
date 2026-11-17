<?php

namespace FinanceHub\Support;

use Psr\Http\Message\ResponseInterface as Response;

/**
 * Shared JSON response helper for all controllers.
 * Use as a trait to remove the copy-pasted json() method from each controller.
 */
trait JsonResponse
{
    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(
            json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION)
        );
        return $response
            ->withStatus($status)
            ->withHeader('Content-Type', 'application/json');
    }
}
