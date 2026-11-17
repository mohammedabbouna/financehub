<?php

namespace FinanceHub\Controllers;

use FinanceHub\Exceptions\InsufficientBalanceException;
use FinanceHub\Models\Action;
use FinanceHub\Models\Wallet;
use FinanceHub\Support\JsonResponse;
use FinanceHub\Support\Transaction;
use FinanceHub\Support\Uuid;
use FinanceHub\Support\Validator;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class TransferController
{
    use JsonResponse;

    public function create(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $data = $request->getParsedBody() ?: [];

        $error = Validator::required($data, ['from_wallet_id', 'to_wallet_id', 'amount']);
        if ($error !== null) {
            return $this->json($response, ['error' => $error], 400);
        }

        if (!Validator::isPositiveAmount($data['amount'])) {
            return $this->json($response, ['error' => 'المبلغ يجب أن يكون أكبر من صفر'], 422);
        }

        if (isset($data['date']) && $data['date'] !== null && $data['date'] !== '' && !Validator::isDate($data['date'])) {
            return $this->json($response, ['error' => 'التاريخ غير صالح (الصيغة: YYYY-MM-DD)'], 422);
        }

        $fromWallet = Wallet::findUserWallet((int)$data['from_wallet_id'], $userId);
        $toWallet = Wallet::findUserWallet((int)$data['to_wallet_id'], $userId);

        if (!$fromWallet) {
            return $this->json($response, ['error' => 'المحفظة المصدر غير موجودة'], 404);
        }
        if (!$toWallet) {
            return $this->json($response, ['error' => 'المحفظة الهدف غير موجودة'], 404);
        }
        if ((int)$fromWallet['id'] === (int)$toWallet['id']) {
            return $this->json($response, ['error' => 'لا يمكن التحويل إلى نفس المحفظة'], 400);
        }

        $amount = round((float)$data['amount'], 2);
        $date = $data['date'] ?? date('Y-m-d');
        $description = $data['description'] ?? null;
        $transferGroupId = Uuid::v4();

        Transaction::run(function () use ($userId, $fromWallet, $toWallet, $amount, $date, $description, $transferGroupId) {
            $lockedFrom = Transaction::lockWallet((int)$fromWallet['id']);
            $lockedTo = Transaction::lockWallet((int)$toWallet['id']);

            if (!$lockedFrom) {
                throw new \RuntimeException('المحفظة المصدر غير موجودة');
            }
            if (!$lockedTo) {
                throw new \RuntimeException('المحفظة الهدف غير موجودة');
            }
            if ((float)$lockedFrom['balance'] < $amount) {
                throw new InsufficientBalanceException('الرصيد غير كافٍ في المحفظة المصدر');
            }

            Transaction::adjustBalance((int)$fromWallet['id'], -$amount);
            Action::create([
                'user_id' => $userId,
                'wallet_id' => (int)$fromWallet['id'],
                'target_wallet_id' => (int)$toWallet['id'],
                'type' => 'transfer',
                'amount' => $amount,
                'category_id' => null,
                'description' => $description ?? "تحويل إلى {$toWallet['name']}",
                'date' => $date,
                'tag' => 'transfer',
                'transfer_group_id' => $transferGroupId,
            ]);

            Transaction::adjustBalance((int)$toWallet['id'], $amount);
            Action::create([
                'user_id' => $userId,
                'wallet_id' => (int)$toWallet['id'],
                'target_wallet_id' => (int)$fromWallet['id'],
                'type' => 'transfer',
                'amount' => $amount,
                'category_id' => null,
                'description' => $description ?? "تحويل من {$fromWallet['name']}",
                'date' => $date,
                'tag' => 'transfer',
                'transfer_group_id' => $transferGroupId,
            ]);
        });

        return $this->json($response, [
            'message' => 'تم التحويل بنجاح',
            'transfer_group_id' => $transferGroupId,
            'from_wallet' => Wallet::findById((int)$fromWallet['id']),
            'to_wallet' => Wallet::findById((int)$toWallet['id']),
        ]);
    }
}
