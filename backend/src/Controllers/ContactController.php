<?php

namespace FinanceHub\Controllers;

use FinanceHub\Models\Contact;
use FinanceHub\Support\JsonResponse;
use FinanceHub\Support\Validator;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class ContactController
{
    use JsonResponse;

    public function index(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        return $this->json($response, ['contacts' => Contact::findAllByUser($userId)]);
    }

    public function show(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $contact = Contact::findUserContact((int)$args['id'], $userId);
        if (!$contact) {
            return $this->json($response, ['error' => 'الشخص غير موجود'], 404);
        }
        return $this->json($response, ['contact' => $contact]);
    }

    public function create(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $data = $request->getParsedBody() ?: [];

        $error = Validator::required($data, ['name']);
        if ($error !== null) {
            return $this->json($response, ['error' => 'الاسم مطلوب'], 400);
        }

        if (!is_string($data['name']) || trim($data['name']) === '') {
            return $this->json($response, ['error' => 'الاسم غير صالح'], 422);
        }

        $name = trim($data['name']);
        if (mb_strlen($name) > 100) {
            return $this->json($response, ['error' => 'الاسم طويل جداً (100 حرف كحد أقصى)'], 422);
        }

        if (array_key_exists('phone', $data) && $data['phone'] !== null && $data['phone'] !== ''
            && !preg_match('/^[0-9+\-\s()]{5,30}$/', (string)$data['phone'])) {
            return $this->json($response, ['error' => 'رقم الهاتف غير صالح'], 422);
        }

        if (array_key_exists('notes', $data) && $data['notes'] !== null && !Validator::maxLength($data['notes'], 500)) {
            return $this->json($response, ['error' => 'الملاحظات طويلة جداً'], 422);
        }

        if (Contact::findByName($userId, $name)) {
            return $this->json($response, ['error' => 'هذا الشخص موجود مسبقاً في قائمتك'], 409);
        }

        $id = Contact::create([
            'user_id' => $userId,
            'name' => $name,
            'phone' => isset($data['phone']) && $data['phone'] !== '' ? trim((string)$data['phone']) : null,
            'notes' => isset($data['notes']) && $data['notes'] !== '' ? trim((string)$data['notes']) : null,
        ]);

        return $this->json($response, [
            'contact' => Contact::findById($id),
            'message' => 'تمت إضافة الشخص بنجاح',
        ], 201);
    }

    public function update(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $contact = Contact::findUserContact((int)$args['id'], $userId);
        if (!$contact) {
            return $this->json($response, ['error' => 'الشخص غير موجود'], 404);
        }

        $data = $request->getParsedBody() ?: [];
        $payload = [];

        if (array_key_exists('name', $data)) {
            if (!is_string($data['name']) || trim($data['name']) === '') {
                return $this->json($response, ['error' => 'الاسم غير صالح'], 422);
            }
            $name = trim($data['name']);
            if (mb_strlen($name) > 100) {
                return $this->json($response, ['error' => 'الاسم طويل جداً'], 422);
            }
            if ($name !== $contact['name'] && Contact::findByName($userId, $name)) {
                return $this->json($response, ['error' => 'هذا الشخص موجود مسبقاً في قائمتك'], 409);
            }
            $payload['name'] = $name;
        }

        if (array_key_exists('phone', $data)) {
            $phone = $data['phone'];
            if ($phone !== null && $phone !== '' && !preg_match('/^[0-9+\-\s()]{5,30}$/', (string)$phone)) {
                return $this->json($response, ['error' => 'رقم الهاتف غير صالح'], 422);
            }
            $payload['phone'] = $phone !== null && $phone !== '' ? trim((string)$phone) : null;
        }

        if (array_key_exists('notes', $data)) {
            if ($data['notes'] !== null && !Validator::maxLength($data['notes'], 500)) {
                return $this->json($response, ['error' => 'الملاحظات طويلة جداً'], 422);
            }
            $payload['notes'] = $data['notes'] !== null && $data['notes'] !== '' ? trim((string)$data['notes']) : null;
        }

        if ($payload === []) {
            return $this->json($response, ['error' => 'لا توجد بيانات للتحديث'], 400);
        }

        Contact::update((int)$args['id'], $payload);

        return $this->json($response, [
            'contact' => Contact::findUserContact((int)$args['id'], $userId),
            'message' => 'تم تحديث البيانات بنجاح',
        ]);
    }

    public function delete(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $contact = Contact::findUserContact((int)$args['id'], $userId);
        if (!$contact) {
            return $this->json($response, ['error' => 'الشخص غير موجود'], 404);
        }

        // Deleting a contact cascades to its debts — refuse while money is owed.
        if (Contact::hasOpenDebts((int)$args['id'])) {
            return $this->json($response, [
                'error' => 'لا يمكن الحذف: لهذا الشخص ديون غير مسددة. سدد الأرصدة أولاً أو احذف الديون.',
            ], 409);
        }

        Contact::delete((int)$args['id']);
        return $this->json($response, ['message' => 'تم حذف الشخص']);
    }
}
