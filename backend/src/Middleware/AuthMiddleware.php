<?php

namespace FinanceHub\Middleware;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use FinanceHub\Config\AppConfig;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Psr7\Response;

class AuthMiddleware implements MiddlewareInterface
{
    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $authHeader = $request->getHeaderLine('Authorization');

        if (empty($authHeader) || !str_starts_with($authHeader, 'Bearer ')) {
            $response = new Response();
            $response->getBody()->write(json_encode(['error' => 'Authentication required']));
            return $response->withStatus(401)->withHeader('Content-Type', 'application/json');
        }

        $token = substr($authHeader, 7);

        try {
            $decoded = JWT::decode($token, new Key(AppConfig::getJwtSecret(), 'HS256'));
            if (($decoded->type ?? 'access') !== 'access') {
                $response = new Response();
                $response->getBody()->write(json_encode(['error' => 'Invalid or expired token']));
                return $response->withStatus(401)->withHeader('Content-Type', 'application/json');
            }
            $request = $request->withAttribute('user_id', $decoded->sub);
            $request = $request->withAttribute('user_name', $decoded->name ?? '');
        } catch (\Exception $e) {
            $response = new Response();
            $response->getBody()->write(json_encode(['error' => 'Invalid or expired token']));
            return $response->withStatus(401)->withHeader('Content-Type', 'application/json');
        }

        return $handler->handle($request);
    }
}
