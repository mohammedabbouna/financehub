<?php

namespace FinanceHub\Controllers;

use FinanceHub\Exceptions\InsufficientBalanceException;
use FinanceHub\Models\Action;
use FinanceHub\Models\Contact;
use FinanceHub\Models\Debt;
use FinanceHub\Models\Wallet;
use FinanceHub\Support\JsonResponse;
use FinanceHub\Support\Transaction;
use FinanceHub\Support\Validator;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class DebtController
{
    use JsonResponse;

    public function index(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $params = $request->getQueryParams();

        $filters = [];
        if (!empty($params['direction'])) {
            if (!Validator::inEnum($params['direction'], 'debt_direction')) {
                return $this->json($response, ['error' => 'اتجاه غير صالح'], 422);
            }
            $filters['direction'] = $params['direction'];
        }
        if (!empty($params['status'])) {
            if (!Validator::inEnum($params['status'], 'debt_status')) {
                return $this->json($response, ['error' => 'حالة غير صالحة'], 422);
            }
            $filters['status'] = $params['status'];
        }
        if (!empty($params['contact_id'])) {
            if (!is_numeric($params['contact_id']) || !Contact::findUserContact((int)$params['contact_id'], $userId)) {
                return $this->json($response, ['error' => 'الشخص غير موجود'], 404);
            }
            $filters['contact_id'] = (int)$params['contact_id'];
        }

        return $this->json($response, [
            'debts' => Debt::findAllByUser($userId, $filters),
            'summary' => Debt::getSummary($userId),
        ]);
    }

    public function summary(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        return $this->json($response, ['summary' => Debt::getSummary($userId)]);
    }

    public function show(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $debt = Debt::findUserDebt((int)$args['id'], $userId);
        if (!$debt) {
            return $this->json($response, ['error' => 'الدَين غير موجود'], 404);
        }

        return $this->json($response, [
            'debt' => $debt,
            'payments' => Debt::getPayments((int)$args['id']),
        ]);
    }

    public function create(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $data = $request->getParsedBody() ?: [];

        $error = Validator::required($data, ['contact_id', 'direction', 'amount']);
        if ($error !== null) {
            return $this->json($response, ['error' => 'الشخص والاتجاه والمبلغ مطلوبة'], 400);
        }

        if (!Validator::inEnum($data['direction'], 'debt_direction')) {
            return $this->json($response, ['error' => 'اتجاه الدَين غير صالح'], 422);
        }

        $amountError = $this->validateAmount($data['amount']);
        if ($amountError !== null) {
            return $this->json($response, ['error' => $amountError], 422);
        }

        $contact = Contact::findUserContact((int)$data['contact_id'], $userId);
        if (!$contact) {
            return $this->json($response, ['error' => 'الشخص غير موجود'], 404);
        }

        if (array_key_exists('due_date', $data) && $data['due_date'] !== null && $data['due_date'] !== ''
            && !Validator::isDate($data['due_date'])) {
            return $this->json($response, ['error' => 'تاريخ الاستحقاق غير صالح (YYYY-MM-DD)'], 422);
        }

        if (array_key_exists('notes', $data) && $data['notes'] !== null && !Validator::maxLength($data['notes'], 500)) {
            return $this->json($response, ['error' => 'الملاحظات طويلة جداً'], 422);
        }

        $walletId = null;
        if (!empty($data['wallet_id'])) {
            if (!Validator::ownsWallet($userId, $data['wallet_id'])) {
                return $this->json($response, ['error' => 'المحفظة غير موجودة أو لا تخصك'], 422);
            }
            $walletId = (int)$data['wallet_id'];
        }

        $amount = round((float)$data['amount'], 2);
        $direction = $data['direction'];

        // Creating a debt with a wallet records the actual money movement:
        //   lent_to       → withdraw (cash left my wallet to the other party)
        //   borrowed_from → borrow   (cash arrived in my wallet)
        $actionId = null;
        if ($walletId !== null) {
            $actionId = $this->recordWalletMovement($userId, $walletId, $direction, $amount, $data, $contact['name']);
        }

        $debtId = Debt::create([
            'user_id' => $userId,
            'contact_id' => (int)$contact['id'],
            'direction' => $direction,
            'amount' => $amount,
            'due_date' => !empty($data['due_date']) ? $data['due_date'] : null,
            'notes' => isset($data['notes']) && $data['notes'] !== '' ? trim((string)$data['notes']) : null,
            'action_id' => $actionId,
        ]);

        return $this->json($response, [
            'debt' => Debt::findUserDebt($debtId, $userId),
            'message' => $direction === 'lent_to'
                ? 'تم تسجيل السلفة بنجاح'
                : 'تم تسجيل الاستلاف بنجاح',
        ], 201);
    }

    public function update(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $debt = Debt::findUserDebt((int)$args['id'], $userId);
        if (!$debt) {
            return $this->json($response, ['error' => 'الدَين غير موجود'], 404);
        }

        $data = $request->getParsedBody() ?: [];
        $payload = [];

        if (array_key_exists('direction', $data)) {
            if (!Validator::inEnum($data['direction'], 'debt_direction')) {
                return $this->json($response, ['error' => 'اتجاه الدَين غير صالح'], 422);
            }
            $payload['direction'] = $data['direction'];
        }

        if (array_key_exists('amount', $data)) {
            $amountError = $this->validateAmount($data['amount']);
            if ($amountError !== null) {
                return $this->json($response, ['error' => $amountError], 422);
            }
            $alreadyPaid = (float)$debt['paid_amount'];
            if (round((float)$data['amount'], 2) < $alreadyPaid) {
                return $this->json($response, [
                    'error' => 'لا يمكن أن يكون المبلغ الأصلي أقل من إجمالي المدفوع (' . number_format($alreadyPaid, 2) . ')',
                ], 422);
            }
            $payload['amount'] = round((float)$data['amount'], 2);
        }

        if (array_key_exists('due_date', $data)) {
            if ($data['due_date'] !== null && $data['due_date'] !== '' && !Validator::isDate($data['due_date'])) {
                return $this->json($response, ['error' => 'تاريخ الاستحقاق غير صالح'], 422);
            }
            $payload['due_date'] = $data['due_date'] !== '' ? $data['due_date'] : null;
        }

        if (array_key_exists('notes', $data)) {
            if ($data['notes'] !== null && !Validator::maxLength($data['notes'], 500)) {
                return $this->json($response, ['error' => 'الملاحظات طويلة جداً'], 422);
            }
            $payload['notes'] = $data['notes'] !== null && $data['notes'] !== '' ? trim((string)$data['notes']) : null;
        }

        if (array_key_exists('contact_id', $data)) {
            if (!Contact::findUserContact((int)$data['contact_id'], $userId)) {
                return $this->json($response, ['error' => 'الشخص غير موجود'], 404);
            }
            $payload['contact_id'] = (int)$data['contact_id'];
        }

        if ($payload === []) {
            return $this->json($response, ['error' => 'لا توجد بيانات للتحديث'], 400);
        }

        Debt::update((int)$args['id'], $payload);

        return $this->json($response, [
            'debt' => Debt::findUserDebt((int)$args['id'], $userId),
            'message' => 'تم تحديث الدَين بنجاح',
        ]);
    }

    public function delete(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $debt = Debt::findUserDebt((int)$args['id'], $userId);
        if (!$debt) {
            return $this->json($response, ['error' => 'الدَين غير موجود'], 404);
        }

        $remaining = (float)$debt['remaining'];
        if ($remaining > 0) {
            $confirmed = $request->getQueryParams()['confirm'] ?? '';
            if ($confirmed !== '1') {
                return $this->json($response, [
                    'error' => 'ما زال هناك مبلغ غير مسدَّد (' . number_format($remaining, 2) . '). أعد الطلب مع confirm=1 لتأكيد الحذف.',
                    'requires_confirmation' => true,
                    'remaining' => $remaining,
                ], 409);
            }
        }

        Debt::delete((int)$args['id']);
        return $this->json($response, ['message' => 'تم حذف الدَين']);
    }

    public function addPayment(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $debt = Debt::findUserDebt((int)$args['id'], $userId);
        if (!$debt) {
            return $this->json($response, ['error' => 'الدَين غير موجود'], 404);
        }

        $data = $request->getParsedBody() ?: [];
        if (!array_key_exists('amount', $data)) {
            return $this->json($response, ['error' => 'المبلغ مطلوب'], 400);
        }

        $amountError = $this->validateAmount($data['amount']);
        if ($amountError !== null) {
            return $this->json($response, ['error' => $amountError], 422);
        }

        $amount = round((float)$data['amount'], 2);
        $remaining = (float)$debt['remaining'];

        // Manual payments must not overshoot the balance (auto-linked repayments
        // from ActionController may exceed it — real money already moved).
        if ($amount > $remaining) {
            return $this->json($response, [
                'error' => 'المبلغ أكبر من المتبقي (' . number_format($remaining, 2) . ')',
            ], 422);
        }

        $paymentDate = $data['payment_date'] ?? date('Y-m-d');
        if (!Validator::isDate($paymentDate)) {
            return $this->json($response, ['error' => 'تاريخ الدفع غير صالح (YYYY-MM-DD)'], 422);
        }

        if (array_key_exists('notes', $data) && $data['notes'] !== null && !Validator::maxLength($data['notes'], 255)) {
            return $this->json($response, ['error' => 'الملاحظات طويلة جداً'], 422);
        }

        $walletId = null;
        if (!empty($data['wallet_id'])) {
            if (!Validator::ownsWallet($userId, $data['wallet_id'])) {
                return $this->json($response, ['error' => 'المحفظة غير موجودة أو لا تخصك'], 422);
            }
            $walletId = (int)$data['wallet_id'];
        }

        // Money movement for the settlement:
        //   lent_to       → deposit  (the other party paid me back)
        //   borrowed_from → repay    (I paid back what I owe)
        $actionId = null;
        if ($walletId !== null) {
            $actionId = $this->recordPaymentMovement(
                $userId,
                $walletId,
                $debt['direction'],
                $amount,
                $paymentDate,
                $data['notes'] ?? null,
                $debt['contact_name']
            );
        }

        Debt::addPayment([
            'user_id' => $userId,
            'debt_id' => (int)$args['id'],
            'amount' => $amount,
            'payment_date' => $paymentDate,
            'notes' => isset($data['notes']) && $data['notes'] !== '' ? trim((string)$data['notes']) : null,
            'action_id' => $actionId,
        ]);

        $fresh = Debt::findUserDebt((int)$args['id'], $userId);

        return $this->json($response, [
            'debt' => $fresh,
            'payments' => Debt::getPayments((int)$args['id']),
            'message' => (float)$fresh['remaining'] <= 0
                ? 'تم تسديد الدَين بالكامل 🎉'
                : 'تم تسجيل الدفعة بنجاح',
        ], 201);
    }

    public function deletePayment(Request $request, Response $response, array $args): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $debt = Debt::findUserDebt((int)$args['id'], $userId);
        if (!$debt) {
            return $this->json($response, ['error' => 'الدَين غير موجود'], 404);
        }

        $payments = Debt::getPayments((int)$args['id']);
        $payment = null;
        foreach ($payments as $p) {
            if ((int)$p['id'] === (int)$args['payment_id']) {
                $payment = $p;
                break;
            }
        }
        if (!$payment) {
            return $this->json($response, ['error' => 'الدفعة غير موجودة'], 404);
        }

        // Reverse the wallet movement (if any) so balances stay consistent,
        // then remove the payment row — both inside one transaction.
        try {
            Transaction::run(function () use ($userId, $payment, $debt) {
                if (!empty($payment['action_id'])) {
                    $action = Action::findUserAction((int)$payment['action_id'], $userId);
                    if ($action) {
                        $wallet = Transaction::lockWallet((int)$action['wallet_id']);
                        if ($wallet) {
                            // Reverse the original sign: deposit/borrow were +, withdraw/repay were -.
                            $sign = in_array($action['type'], ['deposit', 'borrow'], true) ? 1 : -1;
                            if ($sign < 0 && (float)$wallet['balance'] < (float)$action['amount']) {
                                // Re-adding the money is always safe; subtracting back may not be.
                                Transaction::adjustBalance((int)$action['wallet_id'], (float)$action['amount']);
                            } else {
                                Transaction::adjustBalance((int)$action['wallet_id'], -$sign * (float)$action['amount']);
                            }
                        }
                        Action::delete((int)$action['id']);
                    }
                }
                Debt::deletePayment((int)$payment['id'], $userId);
            });
        } catch (InsufficientBalanceException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 400);
        }

        return $this->json($response, [
            'debt' => Debt::findUserDebt((int)$args['id'], $userId),
            'payments' => Debt::getPayments((int)$args['id']),
            'message' => 'تم حذف الدفعة',
        ]);
    }

    /**
     * Validate a monetary amount against DECIMAL(15,2) limits.
     */
    private function validateAmount(mixed $value): ?string
    {
        if (!Validator::isPositiveAmount($value)) {
            return 'المبلغ يجب أن يكون أكبر من صفر';
        }
        if ((float)$value > 999999999999.99) {
            return 'المبلغ كبير جداً';
        }
        return null;
    }

    /**
     * Create the wallet action that represents money moving for a NEW debt.
     * Runs in a transaction with a wallet lock; throws on insufficient funds.
     */
    private function recordWalletMovement(int $userId, int $walletId, string $direction, float $amount, array $data, string $contactName): int
    {
        return Transaction::run(function () use ($userId, $walletId, $direction, $amount, $data, $contactName) {
            $locked = Transaction::lockWallet($walletId);
            if (!$locked) {
                throw new \RuntimeException('المحفظة غير موجودة');
            }

            $type = $direction === 'lent_to' ? 'withdraw' : 'borrow';
            $isOutflow = $type === 'withdraw';

            if ($isOutflow && (float)$locked['balance'] < $amount) {
                throw new InsufficientBalanceException('الرصيد غير كافٍ في المحفظة');
            }

            Transaction::adjustBalance($walletId, $isOutflow ? -$amount : $amount);

            $description = $direction === 'lent_to'
                ? 'سلف إلى ' . $contactName
                : 'استلف من ' . $contactName;

            return Action::create([
                'user_id' => $userId,
                'wallet_id' => $walletId,
                'type' => $type,
                'amount' => $amount,
                'category_id' => null,
                'description' => $data['notes'] ?? $description,
                'date' => date('Y-m-d'),
                'tag' => 'debt',
            ]);
        });
    }

    /**
     * Create the wallet action that represents money moving for a PAYMENT.
     * Runs in a transaction with a wallet lock; throws on insufficient funds.
     */
    private function recordPaymentMovement(
        int $userId,
        int $walletId,
        string $direction,
        float $amount,
        string $paymentDate,
        mixed $notes,
        string $contactName
    ): int {
        return Transaction::run(function () use ($userId, $walletId, $direction, $amount, $paymentDate, $notes, $contactName) {
            $locked = Transaction::lockWallet($walletId);
            if (!$locked) {
                throw new \RuntimeException('المحفظة غير موجودة');
            }

            $type = $direction === 'lent_to' ? 'deposit' : 'repay';
            $isOutflow = $type === 'repay';

            if ($isOutflow && (float)$locked['balance'] < $amount) {
                throw new InsufficientBalanceException('الرصيد غير كافٍ في المحفظة');
            }

            Transaction::adjustBalance($walletId, $isOutflow ? -$amount : $amount);

            $description = is_string($notes) && $notes !== ''
                ? $notes
                : ($direction === 'lent_to'
                    ? 'تسديد سلفة من ' . $contactName
                    : 'سداد دَين إلى ' . $contactName);

            return Action::create([
                'user_id' => $userId,
                'wallet_id' => $walletId,
                'type' => $type,
                'amount' => $amount,
                'category_id' => null,
                'description' => $description,
                'date' => $paymentDate,
                'tag' => 'debt',
            ]);
        });
    }
}
