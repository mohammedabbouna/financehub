<?php

namespace FinanceHub\Controllers;

use FinanceHub\Exceptions\InsufficientBalanceException;
use FinanceHub\Config\Database;
use FinanceHub\Models\Action;
use FinanceHub\Models\Wallet;
use FinanceHub\Models\Anomaly;
use FinanceHub\Services\AIAdvisorService;
use FinanceHub\Support\JsonResponse;
use FinanceHub\Support\Transaction;
use FinanceHub\Support\Uuid;
use FinanceHub\Support\Validator;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class ActionController
{
    use JsonResponse;

    private AIAdvisorService $ai;

    public function __construct()
    {
        $this->ai = new AIAdvisorService();
    }

    public function index(Request $request, Response $response): Response
    {
        $userId = $request->getAttribute('user_id');
        $params = $request->getQueryParams();
        $actions = Action::findAllByUser((int)$userId, $params);
        return $this->json($response, ['actions' => $actions]);
    }

    /**
     * GET /actions/duplicates — groups of potential duplicate movements.
     */
    public function duplicates(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $actions = Action::findAllByUser($userId);
        $groups = [];
        $used = [];
        for ($i = 0; $i < count($actions); $i++) {
            if (isset($used[$i])) continue;
            $cluster = [$actions[$i]];
            $used[$i] = true;
            for ($j = $i + 1; $j < count($actions); $j++) {
                if (isset($used[$j])) continue;
                $a = $actions[$i]; $b = $actions[$j];
                if ($a['type'] !== $b['type']) continue;
                if (abs((float)$a['amount'] - (float)$b['amount']) > 0.005) continue;
                if (abs(strtotime($a['date']) - strtotime($b['date'])) / 86400 > 1) continue;
                // description similarity
                $sa = mb_strtolower(trim((string)($a['description'] ?? '')));
                $sb = mb_strtolower(trim((string)($b['description'] ?? '')));
                if ($sa !== '' && $sb !== '' && $sa !== $sb) {
                    // require some token overlap
                    $ta = array_filter(preg_split('/\s+/u', $sa) ?: []);
                    $tb = array_filter(preg_split('/\s+/u', $sb) ?: []);
                    if (count(array_intersect($ta, $tb)) === 0) continue;
                }
                $cluster[] = $b;
                $used[$j] = true;
            }
            if (count($cluster) > 1) {
                $groups[] = $cluster;
            }
        }
        return $this->json($response, ['groups' => $groups, 'count' => count($groups)]);
    }

    public function show(Request $request, Response $response, array $args): Response
    {
        $action = Action::findById((int)$args['id']);
        if (!$action || (int)$action['user_id'] !== (int)$request->getAttribute('user_id')) {
            return $this->json($response, ['error' => 'العملية غير موجودة'], 404);
        }
        return $this->json($response, ['action' => $action]);
    }

    /**
     * PUT /actions/{id} — edit a movement.
     *
     * Only the safe, balance-neutral fields are editable here (category,
     * description, date, tag). Amount/type/wallet are intentionally NOT
     * editable through this endpoint: changing them would require reversing
     * the original balance impact, which is handled separately (e.g. via a
     * régularisation) to keep the audit trail honest.
     */
    public function update(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $actionId = (int)$args['id'];
        $existing = Action::findUserAction($actionId, $userId);
        if (!$existing) {
            return $this->json($response, ['error' => 'العملية غير موجودة'], 404);
        }

        $data = $request->getParsedBody() ?: [];
        $update = [];

        if (array_key_exists('category_id', $data)) {
            $cid = $data['category_id'];
            if ($cid !== null && $cid !== '') {
                if (!is_numeric($cid)) {
                    return $this->json($response, ['error' => 'فئة غير صالحة'], 422);
                }
                $cid = (int)$cid;
                // Verify ownership/existence (system or user's own category).
                $catStmt = Database::getConnection()->prepare(
                    'SELECT id FROM categories WHERE id = ? AND (user_id IS NULL OR user_id = ?)'
                );
                $catStmt->execute([$cid, $userId]);
                if (!$catStmt->fetch()) {
                    return $this->json($response, ['error' => 'الفئة غير موجودة'], 404);
                }
                $update['category_id'] = $cid;
            } else {
                $update['category_id'] = null;
            }
        }

        if (array_key_exists('description', $data)) {
            $desc = $data['description'];
            if ($desc !== null && !is_string($desc)) {
                return $this->json($response, ['error' => 'الوصف غير صالح'], 422);
            }
            if (is_string($desc) && mb_strlen($desc) > 1000) {
                return $this->json($response, ['error' => 'الوصف طويل جداً'], 422);
            }
            $update['description'] = $desc === null ? null : trim($desc);
        }

        if (array_key_exists('date', $data)) {
            if (!Validator::isDate($data['date'])) {
                return $this->json($response, ['error' => 'التاريخ غير صالح (الصيغة: YYYY-MM-DD)'], 422);
            }
            $update['date'] = $data['date'];
        }

        if (array_key_exists('tag', $data)) {
            $tag = $data['tag'];
            if ($tag !== null && (!is_string($tag) || mb_strlen($tag) > 50)) {
                return $this->json($response, ['error' => 'الوسم غير صالح'], 422);
            }
            $update['tag'] = $tag === null ? null : trim($tag);
        }

        if ($update === []) {
            return $this->json($response, ['error' => 'لا توجد حقول للتحديث'], 422);
        }

        Action::update($actionId, $userId, $update);

        $updated = Action::findById($actionId);
        return $this->json($response, ['message' => 'تم تحديث العملية بنجاح', 'action' => $updated]);
    }

    public function create(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $data = $request->getParsedBody() ?: [];

        $error = Validator::required($data, ['wallet_id', 'type', 'amount', 'date']);
        if ($error !== null) {
            return $this->json($response, ['error' => $error], 400);
        }

        if (!Validator::inEnum($data['type'], 'action_type')) {
            return $this->json($response, ['error' => 'نوع العملية غير صالح'], 422);
        }

        if (!Validator::isPositiveAmount($data['amount'])) {
            return $this->json($response, ['error' => 'المبلغ يجب أن يكون أكبر من صفر'], 422);
        }

        if (!Validator::isDate($data['date'])) {
            return $this->json($response, ['error' => 'التاريخ غير صالح (الصيغة: YYYY-MM-DD)'], 422);
        }

        if (array_key_exists('tag', $data) && $data['tag'] !== null && !Validator::maxLength($data['tag'], 50)) {
            return $this->json($response, ['error' => 'الوسم طويل جداً'], 422);
        }

        if (array_key_exists('description', $data) && $data['description'] !== null && !Validator::maxLength($data['description'], 1000)) {
            return $this->json($response, ['error' => 'الوصف طويل جداً'], 422);
        }

        $refError = Validator::validateReferences($userId, $data, [
            'category_id' => 'category',
            'wallet_id' => 'wallet',
            'target_wallet_id' => 'wallet',
        ]);
        if ($refError !== null) {
            return $this->json($response, ['error' => $refError], 422);
        }

        $type = $data['type'];
        $amount = round((float)$data['amount'], 2);
        $date = $data['date'];

        // Optional contact for borrow/repay — resolved before the write so a
        // bad contact_id fails fast (404) without touching any balance.
        $contact = null;
        if (in_array($type, ['borrow', 'repay'], true)) {
            $contact = $this->resolveContact($userId, $data);
            if ($contact === false) {
                return $this->json($response, ['error' => 'الشخص غير موجود'], 404);
            }
        }

        $sourceWallet = Wallet::findUserWallet((int)$data['wallet_id'], $userId);
        if (!$sourceWallet) {
            return $this->json($response, ['error' => 'المحفظة المصدر غير موجودة'], 404);
        }

        $targetWallet = null;
        if ($type === 'transfer') {
            if (empty($data['target_wallet_id'])) {
                return $this->json($response, ['error' => 'المحفظة الهدف مطلوبة للتحويل'], 400);
            }
            $targetWallet = Wallet::findUserWallet((int)$data['target_wallet_id'], $userId);
            if (!$targetWallet) {
                return $this->json($response, ['error' => 'المحفظة الهدف غير موجودة'], 404);
            }
            if ((int)$targetWallet['id'] === (int)$sourceWallet['id']) {
                return $this->json($response, ['error' => 'لا يمكن التحويل إلى نفس المحفظة'], 400);
            }
        }

        $transferGroupId = ($type === 'transfer') ? Uuid::v4() : null;

        // Sign convention (matches the UI labels):
        //   deposit  (إيداع)   → +
        //   borrow   (اقتراض)  → +   (money received)
        //   withdraw (سحب)    → -
        //   invest   (استثمار) → -   (money committed)
        //   repay    (سداد دين) → -  (money paid back)
        $sign = in_array($type, ['deposit', 'borrow'], true) ? 1 : -1;
        $outflow = $sign < 0;

        // Lock the source wallet and verify funds before mutating anything.
        $actionId = Transaction::run(function () use (
            $userId, $data, $type, $amount, $date, $sourceWallet, $targetWallet, $transferGroupId, $sign, $outflow
        ) {
            $locked = Transaction::lockWallet((int)$sourceWallet['id']);
            if (!$locked) {
                throw new \RuntimeException('المحفظة المصدر غير موجودة');
            }

            if ($outflow && (float)$locked['balance'] < $amount) {
                throw new InsufficientBalanceException('الرصيد غير كافٍ في المحفظة المصدر');
            }

            $actionId = 0;

            if ($type === 'transfer') {
                $targetLocked = Transaction::lockWallet((int)$targetWallet['id']);
                if (!$targetLocked) {
                    throw new \RuntimeException('المحفظة الهدف غير موجودة');
                }

                Transaction::adjustBalance((int)$sourceWallet['id'], -$amount);
                Transaction::adjustBalance((int)$targetWallet['id'], $amount);

                // Paired incoming record so both wallets show the movement.
                $actionId = Action::create([
                    'user_id' => $userId,
                    'wallet_id' => (int)$targetWallet['id'],
                    'target_wallet_id' => (int)$sourceWallet['id'],
                    'type' => 'transfer',
                    'amount' => $amount,
                    'category_id' => $data['category_id'] ?? null,
                    'description' => 'تحويل وارد - ' . ($data['description'] ?? ''),
                    'date' => $date,
                    'tag' => $data['tag'] ?? 'transfer',
                    'transfer_group_id' => $transferGroupId,
                ]);
            } else {
                Transaction::adjustBalance((int)$sourceWallet['id'], $sign * $amount);
            }

            return Action::create([
                'user_id' => $userId,
                'wallet_id' => (int)$sourceWallet['id'],
                'target_wallet_id' => $type === 'transfer' ? (int)$targetWallet['id'] : ($data['target_wallet_id'] ?? null),
                'type' => $type,
                'amount' => $amount,
                'category_id' => $data['category_id'] ?? null,
                'description' => $data['description'] ?? '',
                'date' => $date,
                'tag' => $data['tag'] ?? null,
                'transfer_group_id' => $transferGroupId,
            ]);
        });

        // Anomaly detection (outside the write transaction — read-only).
        $createdAction = Action::findById($actionId);
        if ($createdAction) {
            $anomaly = $this->ai->detectAnomaly($userId, $createdAction);
            if ($anomaly) {
                $anomaly['action_id'] = $actionId;
                $anomaly['user_id'] = $userId;
                Anomaly::create($anomaly);
            }
        }

        // Auto-link borrow/repay to the debt ledger (Phase 1):
        //   borrow → open a "borrowed_from" debt for that contact
        //   repay  → settle against their oldest open debt (or record a
        //            fully-paid ledger row when none exists, for audit)
        $debtLink = null;
        if ($contact !== null && in_array($type, ['borrow', 'repay'], true)) {
            $debtLink = $this->linkActionToDebt($userId, $contact, $type, $amount, $date, $actionId, $data['description'] ?? null);
        }

        $action = Action::findById($actionId);
        return $this->json($response, [
            'action' => $action,
            'debt' => $debtLink,
            'message' => 'تم تسجيل العملية بنجاح',
        ], 201);
    }

    /**
     * Resolve the contact referenced by a borrow/repay payload.
     * Accepts either `contact_id` (must exist) or `contact_name`
     * (created on first use so smart entry works in one step).
     *
     * @return array|false|null contact row, null when none referenced, false when invalid
     */
    private function resolveContact(int $userId, array $data): array|false|null
    {
        if (!empty($data['contact_id'])) {
            if (!is_numeric($data['contact_id'])) {
                return false;
            }
            $contact = \FinanceHub\Models\Contact::findUserContact((int)$data['contact_id'], $userId);
            return $contact ?: false;
        }

        $name = $data['contact_name'] ?? null;
        if (!is_string($name) || trim($name) === '') {
            return null;
        }
        $name = trim($name);
        if (mb_strlen($name) > 100) {
            return false;
        }

        $existing = \FinanceHub\Models\Contact::findByName($userId, $name);
        if ($existing) {
            return $existing;
        }

        $id = \FinanceHub\Models\Contact::create(['user_id' => $userId, 'name' => $name]);
        return \FinanceHub\Models\Contact::findById($id);
    }

    /**
     * Create/update the debt ledger entry that corresponds to a borrow/repay
     * action. Runs in its own transaction (the wallet movement already
     * committed); returns the affected debt array, or null on no-op.
     */
    private function linkActionToDebt(
        int $userId,
        array $contact,
        string $type,
        float $amount,
        string $date,
        int $actionId,
        ?string $description
    ): ?array {
        return Transaction::run(function () use ($userId, $contact, $type, $amount, $date, $actionId, $description) {
            if ($type === 'borrow') {
                // Money received → a new "I owe them" record.
                $debtId = \FinanceHub\Models\Debt::create([
                    'user_id' => $userId,
                    'contact_id' => (int)$contact['id'],
                    'direction' => 'borrowed_from',
                    'amount' => $amount,
                    'due_date' => null,
                    'notes' => $description !== null && $description !== '' ? mb_substr($description, 0, 500) : null,
                    'action_id' => $actionId,
                ]);
                return \FinanceHub\Models\Debt::findUserDebt($debtId, $userId);
            }

            // repay → settle against the oldest open debt of this contact.
            $open = \FinanceHub\Models\Debt::findOpenDebt($userId, (int)$contact['id'], 'borrowed_from');
            if (!$open) {
                // No tracked loan: record a fully settled row so the repayment
                // still shows up in the contact's history.
                $debtId = \FinanceHub\Models\Debt::create([
                    'user_id' => $userId,
                    'contact_id' => (int)$contact['id'],
                    'direction' => 'borrowed_from',
                    'amount' => $amount,
                    'due_date' => null,
                    'notes' => $description !== null && $description !== '' ? mb_substr($description, 0, 500) : null,
                    'action_id' => $actionId,
                ]);
                \FinanceHub\Models\Debt::addPayment([
                    'user_id' => $userId,
                    'debt_id' => $debtId,
                    'amount' => $amount,
                    'payment_date' => $date,
                    'notes' => 'سداد مرتبط بالعملية #' . $actionId,
                    'action_id' => $actionId,
                ]);
                return \FinanceHub\Models\Debt::findUserDebt($debtId, $userId);
            }

            // Overpayment is allowed: real money left the wallet, and the
            // remaining balance floors at 0 in the shared SELECT.
            \FinanceHub\Models\Debt::addPayment([
                'user_id' => $userId,
                'debt_id' => (int)$open['id'],
                'amount' => $amount,
                'payment_date' => $date,
                'notes' => 'سداد مرتبط بالعملية #' . $actionId,
                'action_id' => $actionId,
            ]);
            return \FinanceHub\Models\Debt::findUserDebt((int)$open['id'], $userId);
        });
    }

    public function parseAi(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $data = $request->getParsedBody() ?: [];

        if (empty($data['text']) || !is_string($data['text'])) {
            return $this->json($response, ['error' => 'النص مطلوب'], 400);
        }

        $text = trim($data['text']);
        if ($text === '' || mb_strlen($text) > 500) {
            return $this->json($response, ['error' => 'النص مطلوب (بحد أقصى 500 حرف)'], 422);
        }

        $parsed = $this->ai->parseActionFromText($userId, $text);
        return $this->json($response, ['parsed_action' => $parsed]);
    }
}
