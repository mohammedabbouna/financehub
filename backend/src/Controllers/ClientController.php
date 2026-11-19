<?php
namespace FinanceHub\Controllers;

use FinanceHub\Models\Client;
use FinanceHub\Support\Validator;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class ClientController
{
    public function index(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        return $this->json($response, ['clients' => Client::findAllByUser($userId)]);
    }

    public function show(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $c = Client::findUserClient((int)$args['id'], $userId);
        if (!$c) return $this->json($response, ['error' => 'العميل غير موجود'], 404);
        return $this->json($response, ['client' => $c]);
    }

    public function create(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $data = $request->getParsedBody() ?: [];
        if (empty($data['name'])) {
            return $this->json($response, ['error' => 'اسم العميل مطلوب'], 400);
        }
        if (!is_string($data['name']) || mb_strlen(trim($data['name'])) > 200) {
            return $this->json($response, ['error' => 'اسم غير صالح'], 422);
        }
        $id = Client::create([
            'user_id' => $userId,
            'name' => trim($data['name']),
            'email' => $data['email'] ?? null,
            'phone' => $data['phone'] ?? null,
            'address' => $data['address'] ?? null,
            'tax_id' => $data['tax_id'] ?? null,
            'is_supplier' => !empty($data['is_supplier']),
            'notes' => $data['notes'] ?? null,
        ]);
        return $this->json($response, ['client' => Client::findById($id), 'message' => 'تم إنشاء العميل'], 201);
    }

    public function update(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $id = (int)$args['id'];
        $existing = Client::findUserClient($id, $userId);
        if (!$existing) return $this->json($response, ['error' => 'العميل غير موجود'], 404);
        $data = $request->getParsedBody() ?: [];
        $ok = Client::update($id, $userId, $data);
        if (!$ok) return $this->json($response, ['error' => 'تعذر التحديث'], 400);
        return $this->json($response, ['client' => Client::findById($id), 'message' => 'تم التحديث']);
    }

    public function delete(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        if (!Client::delete((int)$args['id'], $userId)) {
            return $this->json($response, ['error' => 'العميل غير موجود'], 404);
        }
        return $this->json($response, ['message' => 'تم الحذف']);
    }

    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}
