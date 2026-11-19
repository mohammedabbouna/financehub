<?php
namespace FinanceHub\Controllers;

use FinanceHub\Config\Database;
use FinanceHub\Models\Invoice;
use FinanceHub\Models\Client;
use FinanceHub\Support\Validator;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class InvoiceController
{
    public function index(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $status = $request->getQueryParams()['status'] ?? null;
        $invoices = Invoice::findAllByUser($userId, $status ?: null);
        return $this->json($response, ['invoices' => $invoices, 'summary' => Invoice::summary($userId)]);
    }

    public function show(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $inv = Invoice::findById((int)$args['id']);
        if (!$inv || (int)$inv['user_id'] !== $userId) {
            return $this->json($response, ['error' => 'الفاتورة غير موجودة'], 404);
        }
        $inv['items'] = Invoice::getItems((int)$args['id']);
        return $this->json($response, ['invoice' => $inv]);
    }

    public function create(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $data = $request->getParsedBody() ?: [];
        $items = $data['items'] ?? [];
        if (empty($data['issue_date']) || !Validator::isDate($data['issue_date'])) {
            return $this->json($response, ['error' => 'تاريخ الإصدار غير صالح'], 422);
        }
        if (!is_array($items) || count($items) === 0) {
            return $this->json($response, ['error' => 'يجب إضافة بند واحد على الأقل'], 422);
        }

        // client validation
        $clientId = null;
        if (!empty($data['client_id'])) {
            $c = Client::findUserClient((int)$data['client_id'], $userId);
            if (!$c) return $this->json($response, ['error' => 'العميل غير موجود'], 404);
            $clientId = (int)$data['client_id'];
        }

        // normalize items + compute totals
        $normItems = [];
        $subtotal = 0.0;
        $vatRate = (float)($data['vat_rate'] ?? 19.0);
        $vatAmount = 0.0;
        foreach ($items as $it) {
            if (!is_array($it) || empty($it['description'])) continue;
            $qty = (float)($it['quantity'] ?? 1);
            $price = (float)($it['unit_price'] ?? 0);
            $lineVat = (float)($it['vat_rate'] ?? $vatRate);
            $lineTotal = round($qty * $price, 2);
            $lineVatAmount = round($lineTotal * $lineVat / 100, 2);
            $normItems[] = [
                'description' => mb_substr(trim((string)$it['description']), 0, 500),
                'quantity' => $qty,
                'unit_price' => $price,
                'vat_rate' => $lineVat,
                'line_total' => $lineTotal,
            ];
            $subtotal += $lineTotal;
            $vatAmount += $lineVatAmount;
        }
        if ($normItems === []) {
            return $this->json($response, ['error' => 'بنود غير صالحة'], 422);
        }
        $subtotal = round($subtotal, 2);
        $vatAmount = round($vatAmount, 2);
        $total = round($subtotal + $vatAmount, 2);

        $number = $data['number'] ?? Invoice::nextNumber($userId);
        // ensure uniqueness
        $dup = Database::getConnection()->prepare('SELECT id FROM invoices WHERE user_id = ? AND number = ?');
        $dup->execute([$userId, $number]);
        if ($dup->fetch()) {
            $number = Invoice::nextNumber($userId);
        }

        $dueDate = null;
        if (!empty($data['due_date'])) {
            if (!Validator::isDate($data['due_date'])) {
                return $this->json($response, ['error' => 'تاريخ الاستحقاق غير صالح'], 422);
            }
            $dueDate = $data['due_date'];
        }

        $id = Invoice::create([
            'user_id' => $userId,
            'client_id' => $clientId,
            'number' => $number,
            'issue_date' => $data['issue_date'],
            'due_date' => $dueDate,
            'status' => $data['status'] ?? 'draft',
            'subtotal' => $subtotal,
            'vat_rate' => $vatRate,
            'vat_amount' => $vatAmount,
            'total' => $total,
            'notes' => $data['notes'] ?? null,
        ], $normItems);

        return $this->json($response, ['invoice' => Invoice::findById($id), 'items' => Invoice::getItems($id), 'message' => 'تم إنشاء الفاتورة'], 201);
    }

    public function updateStatus(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $data = $request->getParsedBody() ?: [];
        $status = $data['status'] ?? null;
        $allowed = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];
        if (!in_array($status, $allowed, true)) {
            return $this->json($response, ['error' => 'حالة غير صالحة'], 422);
        }
        if (!Invoice::updateStatus((int)$args['id'], $userId, $status)) {
            return $this->json($response, ['error' => 'الفاتورة غير موجودة'], 404);
        }
        return $this->json($response, ['message' => 'تم تحديث الحالة']);
    }

    public function delete(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        if (!Invoice::delete((int)$args['id'], $userId)) {
            return $this->json($response, ['error' => 'الفاتورة غير موجودة'], 404);
        }
        return $this->json($response, ['message' => 'تم حذف الفاتورة']);
    }

    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}
