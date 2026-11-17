<?php

namespace FinanceHub\Controllers;

use FinanceHub\Models\Tontine;
use FinanceHub\Models\Wallet;
use FinanceHub\Models\Action;
use FinanceHub\Support\Transaction;
use FinanceHub\Support\Validator;
use FinanceHub\Support\JsonResponse;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Tontine (العمّارية) API: circles, members, contributions and cycles.
 * A contribution optionally moves real money: my share leaves my wallet
 * (withdraw), someone else's share entering the pot I hold comes in (deposit).
 */
class TontineController
{
    use JsonResponse;

    /** GET /tontines */
    public function index(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $rows = Tontine::findAllByUser($userId);
        $today = date('Y-m-d');

        $tontines = array_map(function (array $row) use ($today): array {
            $members = Tontine::members((int)$row['id']);
            $cycles = Tontine::cycles($row, $members, $today);
            $current = null;
            foreach ($cycles as $cycle) {
                if ($cycle['is_current']) {
                    $current = $cycle;
                }
            }
            return $this->shapeTontine($row, $members, $cycles, $current);
        }, $rows);

        return $this->json($response, ['tontines' => $tontines]);
    }

    /** GET /tontines/{id} */
    public function show(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $tontine = Tontine::findUserTontine((int)$args['id'], $userId);
        if (!$tontine) {
            return $this->json($response, ['error' => 'العمّارية غير موجودة'], 404);
        }

        $members = Tontine::members((int)$tontine['id']);
        $cycles = Tontine::cycles($tontine, $members, date('Y-m-d'));
        $current = null;
        foreach ($cycles as $cycle) {
            if ($cycle['is_current']) {
                $current = $cycle;
            }
        }

        $data = $this->shapeTontine($tontine, $members, $cycles, $current);
        $data['payments'] = array_map(static function (array $p): array {
            return [
                'id' => (int)$p['id'],
                'member_id' => (int)$p['member_id'],
                'member_name' => $p['member_name'],
                'is_self' => (bool)$p['is_self'],
                'due_date' => $p['due_date'],
                'amount' => (float)$p['amount'],
                'wallet_id' => $p['wallet_id'] !== null ? (int)$p['wallet_id'] : null,
                'action_id' => $p['action_id'] !== null ? (int)$p['action_id'] : null,
                'notes' => $p['notes'],
                'created_at' => $p['created_at'],
            ];
        }, Tontine::payments((int)$tontine['id']));

        return $this->json($response, ['tontine' => $data]);
    }

    /** POST /tontines */
    public function create(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $data = $request->getParsedBody() ?: [];

        $error = Validator::required($data, ['name', 'amount', 'frequency', 'start_date']);
        if ($error !== null) {
            return $this->json($response, ['error' => 'الاسم والمبلغ والتكرار وتاريخ البداية مطلوبة'], 400);
        }
        if (!Validator::isPositiveAmount($data['amount'])) {
            return $this->json($response, ['error' => 'المبلغ يجب أن يكون أكبر من صفر'], 422);
        }
        if (!Validator::inEnum($data['frequency'], 'tontine_frequency')) {
            return $this->json($response, ['error' => 'التكرار يجب أن يكون أسبوعي أو شهري'], 422);
        }
        if (!Validator::isDate($data['start_date'])) {
            return $this->json($response, ['error' => 'تاريخ البداية غير صالح (الصيغة: YYYY-MM-DD)'], 422);
        }
        if (!Validator::maxLength($data['name'], 200)) {
            return $this->json($response, ['error' => 'الاسم طويل جداً'], 422);
        }

        $id = Tontine::create($userId, [
            'name' => trim((string)$data['name']),
            'amount' => round((float)$data['amount'], 2),
            'frequency' => (string)$data['frequency'],
            'start_date' => (string)$data['start_date'],
            'manager_name' => !empty($data['manager_name']) ? trim((string)$data['manager_name']) : null,
            'notes' => !empty($data['notes']) ? mb_substr(trim((string)$data['notes']), 0, 500) : null,
        ]);

        $tontine = Tontine::findUserTontine($id, $userId);
        $members = Tontine::members($id);
        $cycles = Tontine::cycles($tontine, $members, date('Y-m-d'));
        $current = null;
        foreach ($cycles as $cycle) {
            if ($cycle['is_current']) {
                $current = $cycle;
            }
        }

        return $this->json($response, [
            'message' => 'تم إنشاء العمّارية',
            'tontine' => $this->shapeTontine($tontine, $members, $cycles, $current),
        ], 201);
    }

    /** PUT /tontines/{id} */
    public function update(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $tontine = Tontine::findUserTontine((int)$args['id'], $userId);
        if (!$tontine) {
            return $this->json($response, ['error' => 'العمّارية غير موجودة'], 404);
        }

        $data = $request->getParsedBody() ?: [];
        $updates = [];
        if (array_key_exists('name', $data)) {
            if (!Validator::maxLength($data['name'], 200) || trim((string)$data['name']) === '') {
                return $this->json($response, ['error' => 'الاسم غير صالح'], 422);
            }
            $updates['name'] = trim((string)$data['name']);
        }
        if (array_key_exists('amount', $data)) {
            if (!Validator::isPositiveAmount($data['amount'])) {
                return $this->json($response, ['error' => 'المبلغ يجب أن يكون أكبر من صفر'], 422);
            }
            $updates['amount'] = round((float)$data['amount'], 2);
        }
        if (array_key_exists('frequency', $data)) {
            if (!Validator::inEnum($data['frequency'], 'tontine_frequency')) {
                return $this->json($response, ['error' => 'التكرار يجب أن يكون أسبوعي أو شهري'], 422);
            }
            $updates['frequency'] = (string)$data['frequency'];
        }
        if (array_key_exists('start_date', $data)) {
            if (!Validator::isDate($data['start_date'])) {
                return $this->json($response, ['error' => 'تاريخ البداية غير صالح'], 422);
            }
            $updates['start_date'] = (string)$data['start_date'];
        }
        if (array_key_exists('status', $data)) {
            if (!Validator::inEnum($data['status'], 'tontine_status')) {
                return $this->json($response, ['error' => 'الحالة غير صالحة'], 422);
            }
            $updates['status'] = (string)$data['status'];
        }
        if (array_key_exists('manager_name', $data)) {
            $updates['manager_name'] = $data['manager_name'] !== null && $data['manager_name'] !== ''
                ? mb_substr(trim((string)$data['manager_name']), 0, 100) : null;
        }
        if (array_key_exists('notes', $data)) {
            $updates['notes'] = $data['notes'] !== null && $data['notes'] !== ''
                ? mb_substr(trim((string)$data['notes']), 0, 500) : null;
        }

        if ($updates === []) {
            return $this->json($response, ['error' => 'لا توجد حقول للتعديل'], 400);
        }

        Tontine::update((int)$tontine['id'], $updates);
        $fresh = Tontine::findUserTontine((int)$tontine['id'], $userId);
        $members = Tontine::members((int)$tontine['id']);
        $cycles = Tontine::cycles($fresh, $members, date('Y-m-d'));
        $current = null;
        foreach ($cycles as $cycle) {
            if ($cycle['is_current']) {
                $current = $cycle;
            }
        }

        return $this->json($response, [
            'message' => 'تم تحديث العمّارية',
            'tontine' => $this->shapeTontine($fresh, $members, $cycles, $current),
        ]);
    }

    /** DELETE /tontines/{id} */
    public function delete(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $tontine = Tontine::findUserTontine((int)$args['id'], $userId);
        if (!$tontine) {
            return $this->json($response, ['error' => 'العمّارية غير موجودة'], 404);
        }

        Tontine::delete((int)$tontine['id']);
        return $this->json($response, ['message' => 'تم حذف العمّارية']);
    }

    // ─── Members ──────────────────────────────────────────────────────────────

    /** POST /tontines/{id}/members */
    public function addMember(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $tontine = Tontine::findUserTontine((int)$args['id'], $userId);
        if (!$tontine) {
            return $this->json($response, ['error' => 'العمّارية غير موجودة'], 404);
        }

        $data = $request->getParsedBody() ?: [];
        $error = Validator::required($data, ['name']);
        if ($error !== null) {
            return $this->json($response, ['error' => 'اسم العضو مطلوب'], 400);
        }
        if (!Validator::maxLength($data['name'], 100)) {
            return $this->json($response, ['error' => 'الاسم طويل جداً'], 422);
        }
        if (isset($data['phone']) && $data['phone'] !== null && !Validator::maxLength($data['phone'], 30)) {
            return $this->json($response, ['error' => 'رقم الهاتف طويل جداً'], 422);
        }

        $memberId = Tontine::addMember((int)$tontine['id'], [
            'name' => trim((string)$data['name']),
            'phone' => !empty($data['phone']) ? trim((string)$data['phone']) : null,
            'position' => isset($data['position']) ? (int)$data['position'] : 0,
            'is_self' => !empty($data['is_self']),
        ]);

        $members = Tontine::members((int)$tontine['id']);
        $member = null;
        foreach ($members as $m) {
            if ((int)$m['id'] === $memberId) {
                $member = $m;
                break;
            }
        }

        return $this->json($response, [
            'message' => 'تمت إضافة العضو',
            'member' => $this->shapeMember($member),
        ], 201);
    }

    /** DELETE /tontines/{id}/members/{member_id} */
    public function deleteMember(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $tontine = Tontine::findUserTontine((int)$args['id'], $userId);
        if (!$tontine) {
            return $this->json($response, ['error' => 'العمّارية غير موجودة'], 404);
        }

        $member = Tontine::findMember((int)$args['member_id'], (int)$tontine['id']);
        if (!$member) {
            return $this->json($response, ['error' => 'العضو غير موجود'], 404);
        }

        Tontine::deleteMember((int)$member['id']);
        return $this->json($response, ['message' => 'تم حذف العضو']);
    }

    // ─── Payments ─────────────────────────────────────────────────────────────

    /**
     * POST /tontines/{id}/payments — record a member's contribution for a cycle.
     * Idempotent: the same (member, due_date) never records twice.
     */
    public function addPayment(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $tontine = Tontine::findUserTontine((int)$args['id'], $userId);
        if (!$tontine) {
            return $this->json($response, ['error' => 'العمّارية غير موجودة'], 404);
        }
        if ($tontine['status'] !== 'active') {
            return $this->json($response, ['error' => 'العمّارية غير نشطة'], 422);
        }

        $data = $request->getParsedBody() ?: [];
        $error = Validator::required($data, ['member_id', 'due_date']);
        if ($error !== null) {
            return $this->json($response, ['error' => 'العضو وتاريخ الدورة مطلوبان'], 400);
        }
        if (!Validator::isDate($data['due_date'])) {
            return $this->json($response, ['error' => 'تاريخ الدورة غير صالح (الصيغة: YYYY-MM-DD)'], 422);
        }

        $member = Tontine::findMember((int)$data['member_id'], (int)$tontine['id']);
        if (!$member) {
            return $this->json($response, ['error' => 'العضو غير موجود'], 404);
        }

        $amount = isset($data['amount']) && $data['amount'] !== null && $data['amount'] !== ''
            ? (float)$data['amount'] : (float)$tontine['amount'];
        if ($amount <= 0) {
            return $this->json($response, ['error' => 'المبلغ يجب أن يكون أكبر من صفر'], 422);
        }

        // Optional wallet movement — only for an owned wallet.
        $walletId = null;
        $actionId = null;
        if (!empty($data['wallet_id'])) {
            $wallet = Wallet::findUserWallet((int)$data['wallet_id'], $userId);
            if (!$wallet) {
                return $this->json($response, ['error' => 'المحفظة غير موجودة'], 404);
            }
            $walletId = (int)$wallet['id'];
        }

        $result = Transaction::run(function () use ($tontine, $member, $data, $amount, $walletId, $userId): array {
            // Uniqueness check FIRST — a retry must not move money again.
            $existing = Tontine::findPayment((int)$tontine['id'], (int)$member['id'], (string)$data['due_date']);
            if ($existing !== null) {
                return ['created' => false, 'payment' => $existing];
            }

            $actionId = null;
            if ($walletId !== null) {
                // My own share leaves my wallet; someone else's share entering
                // the pot I manage comes in.
                $type = !empty($member['is_self']) ? 'withdraw' : 'deposit';
                $actionId = Action::create([
                    'user_id' => $userId,
                    'wallet_id' => $walletId,
                    'type' => $type,
                    'amount' => $amount,
                    'date' => (string)$data['due_date'],
                    'description' => 'قسط عمّارية — ' . $member['name'] . ' (' . $data['due_date'] . ')',
                    'category_id' => null,
                ]);
                Transaction::adjustBalance($walletId, $type === 'deposit' ? $amount : -$amount);
            }

            $payment = Tontine::insertPayment([
                'tontine_id' => (int)$tontine['id'],
                'member_id' => (int)$member['id'],
                'due_date' => (string)$data['due_date'],
                'amount' => $amount,
                'wallet_id' => $walletId,
                'action_id' => $actionId,
                'notes' => !empty($data['notes']) ? mb_substr(trim((string)$data['notes']), 0, 255) : null,
            ]);

            return ['created' => true, 'payment' => $payment];
        });

        if (!$result['created']) {
            return $this->json($response, [
                'message' => 'هذه الدفعة مسجّلة مسبقاً',
                'created' => false,
                'payment' => $this->shapePayment($result['payment']),
            ], 200);
        }

        return $this->json($response, [
            'message' => 'تم تسجيل القسط',
            'created' => true,
            'payment' => $this->shapePayment($result['payment']),
        ], 201);
    }

    /** DELETE /tontines/{id}/payments/{payment_id} */
    public function deletePayment(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $tontine = Tontine::findUserTontine((int)$args['id'], $userId);
        if (!$tontine) {
            return $this->json($response, ['error' => 'العمّارية غير موجودة'], 404);
        }

        $deleted = Tontine::deletePayment((int)$args['payment_id'], (int)$tontine['id']);
        if (!$deleted) {
            return $this->json($response, ['error' => 'الدفعة غير موجودة'], 404);
        }

        return $this->json($response, ['message' => 'تم حذف الدفعة وعكس حركة المحفظة']);
    }

    // ─── Shaping ──────────────────────────────────────────────────────────────

    private function shapeTontine(array $tontine, array $members, array $cycles, ?array $current): array
    {
        $activeMembers = array_values(array_filter($members, static fn(array $m): bool => (int)$m['is_active'] === 1));
        $memberCount = count($activeMembers);
        $expected = round((float)$tontine['amount'] * max(1, $memberCount), 2);
        $totalCollected = 0.0;
        $nextDue = null;
        foreach ($cycles as $cycle) {
            $totalCollected += (float)$cycle['collected'];
            if ($nextDue === null && $cycle['is_future']) {
                $nextDue = $cycle['due_date'];
            }
        }

        return [
            'id' => (int)$tontine['id'],
            'name' => $tontine['name'],
            'amount' => (float)$tontine['amount'],
            'frequency' => $tontine['frequency'],
            'start_date' => $tontine['start_date'],
            'manager_name' => $tontine['manager_name'],
            'notes' => $tontine['notes'],
            'status' => $tontine['status'],
            'created_at' => $tontine['created_at'],
            'member_count' => $memberCount,
            'expected_per_cycle' => $expected,
            'total_collected' => round($totalCollected, 2),
            'next_due_date' => $nextDue,
            'current_cycle' => $current,
            'members' => array_map(fn(array $m): array => $this->shapeMember($m), $members),
            'cycles' => $cycles,
            'delinquents' => $cycles !== [] ? Tontine::delinquents($tontine, $cycles, $members) : [],
        ];
    }

    private function shapeMember(array $m): array
    {
        return [
            'id' => (int)$m['id'],
            'name' => $m['name'],
            'phone' => $m['phone'],
            'position' => (int)$m['position'],
            'is_self' => (bool)$m['is_self'],
            'is_active' => (bool)$m['is_active'],
        ];
    }

    private function shapePayment(array $p): array
    {
        return [
            'id' => (int)$p['id'],
            'member_id' => (int)$p['member_id'],
            'due_date' => $p['due_date'],
            'amount' => (float)$p['amount'],
            'wallet_id' => $p['wallet_id'] !== null ? (int)$p['wallet_id'] : null,
            'action_id' => $p['action_id'] !== null ? (int)$p['action_id'] : null,
            'notes' => $p['notes'],
        ];
    }
}
