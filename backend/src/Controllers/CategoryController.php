<?php

namespace FinanceHub\Controllers;

use FinanceHub\Models\Category;
use FinanceHub\Support\Validator;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class CategoryController
{
    public function index(Request $request, Response $response): Response
    {
        $userId = $request->getAttribute('user_id');
        $categories = Category::findAllByUser($userId);
        return $this->json($response, ['categories' => $categories]);
    }

    public function create(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $data = $request->getParsedBody() ?: [];

        if (empty($data['name']) || empty($data['type'])) {
            return $this->json($response, ['error' => 'اسم الفئة والنوع مطلوبان'], 400);
        }

        if (!is_string($data['name']) || mb_strlen(trim($data['name'])) < 1 || mb_strlen($data['name']) > 100) {
            return $this->json($response, ['error' => 'اسم الفئة يجب أن يكون بين 1 و 100 حرف'], 422);
        }
        if (!Validator::inEnum($data['type'], 'category_type')) {
            return $this->json($response, ['error' => 'نوع الفئة غير صالح'], 422);
        }
        if (isset($data['color']) && $data['color'] !== null && !preg_match('/^#[0-9a-fA-F]{6}$/', (string)$data['color'])) {
            return $this->json($response, ['error' => 'اللون غير صالح'], 422);
        }

        // parent_id validation (optional; must be owned by the user or system)
        if (isset($data['parent_id']) && $data['parent_id'] !== '' && $data['parent_id'] !== null) {
            if (!is_numeric($data['parent_id'])) {
                return $this->json($response, ['error' => 'الفئة الرئيسية غير صالحة'], 422);
            }
            $parent = Category::findById((int)$data['parent_id']);
            if (!$parent) {
                return $this->json($response, ['error' => 'الفئة الرئيسية غير موجودة'], 404);
            }
            if ($parent['type'] !== $data['type']) {
                return $this->json($response, ['error' => 'يجب أن تتطابق أنواع الفئات (رئيسية/ثانوية)'], 422);
            }
        }

        // Duplicate guard (schema has no UNIQUE(user_id, name, type)).
        $dup = \FinanceHub\Config\Database::getConnection()->prepare(
            'SELECT id FROM categories WHERE user_id = ? AND name = ? AND type = ?'
        );
        $dup->execute([$userId, trim($data['name']), $data['type']]);
        if ($dup->fetch()) {
            return $this->json($response, ['error' => 'الفئة موجودة مسبقاً'], 409);
        }

        $id = Category::create([
            'user_id' => $userId,
            'name' => trim($data['name']),
            'type' => $data['type'],
            'icon' => $data['icon'] ?? '📁',
            'color' => $data['color'] ?? '#6b7280',
            'parent_id' => (isset($data['parent_id']) && $data['parent_id'] !== '' && $data['parent_id'] !== null)
                ? (int)$data['parent_id'] : null,
        ]);

        return $this->json($response, ['category' => Category::findById($id), 'message' => 'تم إنشاء الفئة بنجاح'], 201);
    }

    public function update(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $id = (int)$args['id'];
        $existing = Category::findById($id);
        if (!$existing || (int)($existing['user_id'] ?? 0) !== $userId) {
            return $this->json($response, ['error' => 'لا يمكن تعديل فئة نظام أو غير موجودة'], 403);
        }

        $data = $request->getParsedBody() ?: [];
        $update = [];

        if (array_key_exists('name', $data)) {
            if (!is_string($data['name']) || mb_strlen(trim($data['name'])) < 1 || mb_strlen($data['name']) > 100) {
                return $this->json($response, ['error' => 'اسم الفئة يجب أن يكون بين 1 و 100 حرف'], 422);
            }
            $update['name'] = trim($data['name']);
        }
        if (array_key_exists('type', $data)) {
            if (!Validator::inEnum($data['type'], 'category_type')) {
                return $this->json($response, ['error' => 'نوع الفئة غير صالح'], 422);
            }
            $update['type'] = $data['type'];
        }
        if (array_key_exists('parent_id', $data)) {
            $pid = $data['parent_id'];
            if ($pid === null || $pid === '' ) {
                $update['parent_id'] = null;
            } else {
                if (!is_numeric($pid)) {
                    return $this->json($response, ['error' => 'الفئة الرئيسية غير صالحة'], 422);
                }
                $parent = Category::findById((int)$pid);
                if (!$parent) {
                    return $this->json($response, ['error' => 'الفئة الرئيسية غير موجودة'], 404);
                }
                $effectiveType = $update['type'] ?? $existing['type'];
                if ($parent['type'] !== $effectiveType) {
                    return $this->json($response, ['error' => 'يجب أن تتطابق أنواع الفئات (رئيسية/ثانوية)'], 422);
                }
                if ((int)$pid === $id) {
                    return $this->json($response, ['error' => 'لا يمكن جعل الفئة أبًا لنفسها'], 422);
                }
                $update['parent_id'] = (int)$pid;
            }
        }
        if (array_key_exists('icon', $data)) {
            $update['icon'] = $data['icon'] ?: '📁';
        }
        if (array_key_exists('color', $data)) {
            if ($data['color'] !== null && !preg_match('/^#[0-9a-fA-F]{6}$/', (string)$data['color'])) {
                return $this->json($response, ['error' => 'اللون غير صالح'], 422);
            }
            $update['color'] = $data['color'] ?? '#6b7280';
        }

        if ($update === []) {
            return $this->json($response, ['error' => 'لا توجد حقول للتحديث'], 422);
        }

        $ok = Category::update($id, $userId, $update);
        if (!$ok) {
            return $this->json($response, ['error' => 'لا يمكن تعديل هذه الفئة'], 403);
        }
        return $this->json($response, ['category' => Category::findById($id), 'message' => 'تم تحديث الفئة بنجاح']);
    }

    public function delete(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $id = (int)$args['id'];
        $existing = Category::findById($id);
        if (!$existing || (int)($existing['user_id'] ?? 0) !== $userId) {
            return $this->json($response, ['error' => 'لا يمكن حذف فئة نظام أو غير موجودة'], 403);
        }
        Category::delete($id, $userId);
        return $this->json($response, ['message' => 'تم حذف الفئة بنجاح']);
    }

    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}
