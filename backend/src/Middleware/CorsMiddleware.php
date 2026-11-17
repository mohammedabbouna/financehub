<?php

namespace FinanceHub\Middleware;

use FinanceHub\Config\AppConfig;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * Single source of truth for CORS.
 *
 * Handles preflight OPTIONS immediately and sets exactly one
 * Access-Control-Allow-Origin value. The nginx configs must NOT emit
 * their own CORS headers (a reflected origin + credentials combination
 * is both unsafe and produces duplicate headers browsers reject).
 */
class CorsMiddleware implements MiddlewareInterface
{
    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $origin = $this->resolveOrigin($request);

        if ($request->getMethod() === 'OPTIONS') {
            $response = new \Slim\Psr7\Response(204);
        } else {
            $response = $handler->handle($request);
        }

        $response = $response
            ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
            ->withHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Requested-With')
            ->withHeader('Access-Control-Max-Age', '86400');

        if ($origin !== null) {
            $response = $response
                ->withHeader('Access-Control-Allow-Origin', $origin)
                ->withHeader('Vary', 'Origin')
                ->withHeader('Access-Control-Allow-Credentials', 'true');
        }

        return $response;
    }

    /**
     * Allow only origins explicitly configured in BACKEND_CORS_ORIGIN
     * (comma-separated list supported). Returns null when the request
     * is same-origin / has no Origin header.
     */
    private function resolveOrigin(ServerRequestInterface $request): ?string
    {
        $requestOrigin = $request->getHeaderLine('Origin');
        if ($requestOrigin === '') {
            return null;
        }

        $allowed = array_filter(array_map(
            'trim',
            explode(',', (string)AppConfig::getCorsOrigin())
        ));

        if (in_array($requestOrigin, $allowed, true)) {
            return $requestOrigin;
        }

        // Unknown origin: respond without CORS headers so the browser blocks it.
        return null;
    }
}
