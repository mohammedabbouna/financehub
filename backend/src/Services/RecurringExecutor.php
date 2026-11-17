<?php

namespace FinanceHub\Services;

use FinanceHub\Exceptions\InsufficientBalanceException;
use FinanceHub\Models\Action;
use FinanceHub\Models\RecurringTransaction;
use FinanceHub\Models\Wallet;
use FinanceHub\Support\Transaction;
use FinanceHub\Support\Uuid;

/**
 * Executes a recurring transaction template against a wallet.
 *
 * Shared by the API ("run now" / worker generation) so the money-movement
 * rules stay identical to ActionController::create: same sign convention,
 * same FOR UPDATE lock, same insufficient-balance refusal.
 */
class RecurringExecutor
{
    /**
     * @param array<string, mixed> $recurring row with decoded action_template
     * @return array{action: array<string, mixed>|null, error: string|null}
     */
    public static function execute(array $recurring): array
    {
        $userId = (int)$recurring['user_id'];
        $template = is_array($recurring['action_template'] ?? null) ? $recurring['action_template'] : [];
        $date = date('Y-m-d');

        $type = (string)($template['type'] ?? '');
        $validTypes = ['deposit', 'withdraw', 'transfer', 'invest', 'borrow', 'repay'];
        if (!in_array($type, $validTypes, true)) {
            return ['action' => null, 'error' => 'نوع العملية في القالب غير صالح'];
        }

        $amount = round((float)($template['amount'] ?? 0), 2);
        if ($amount <= 0) {
            return ['action' => null, 'error' => 'مبلغ القالب غير صالح'];
        }

        $sourceWallet = Wallet::findUserWallet((int)($template['wallet_id'] ?? 0), $userId);
        if (!$sourceWallet) {
            return ['action' => null, 'error' => 'المحفظة في القالب غير موجودة أو تم حذفها'];
        }

        $targetWallet = null;
        if ($type === 'transfer') {
            $targetWallet = Wallet::findUserWallet((int)($template['target_wallet_id'] ?? 0), $userId);
            if (!$targetWallet) {
                return ['action' => null, 'error' => 'المحفظة الهدف في القالب غير موجودة'];
            }
            if ((int)$targetWallet['id'] === (int)$sourceWallet['id']) {
                return ['action' => null, 'error' => 'لا يمكن التحويل إلى نفس المحفظة'];
            }
        }

        // Same sign convention as ActionController::create.
        $sign = in_array($type, ['deposit', 'borrow'], true) ? 1 : -1;
        $outflow = $sign < 0;

        $categoryId = null;
        if (!empty($template['category_id'])) {
            $stmt = \FinanceHub\Config\Database::getConnection()->prepare(
                'SELECT id FROM categories WHERE id = ? AND (user_id IS NULL OR user_id = ?)'
            );
            $stmt->execute([(int)$template['category_id'], $userId]);
            $categoryId = $stmt->fetch() ? (int)$template['category_id'] : null;
        }

        $description = is_string($template['description'] ?? null) && trim($template['description']) !== ''
            ? mb_substr(trim($template['description']), 0, 1000)
            : $recurring['name'];

        $tag = is_string($template['tag'] ?? null) && trim($template['tag']) !== ''
            ? mb_substr(trim($template['tag']), 0, 50)
            : 'recurring';

        try {
            $actionId = Transaction::run(function () use (
                $userId, $type, $amount, $date, $sourceWallet, $targetWallet,
                $sign, $outflow, $categoryId, $description, $tag
            ) {
                $locked = Transaction::lockWallet((int)$sourceWallet['id']);
                if (!$locked) {
                    throw new \RuntimeException('المحفظة المصدر غير موجودة');
                }

                if ($outflow && (float)$locked['balance'] < $amount) {
                    throw new InsufficientBalanceException('الرصيد غير كافٍ في المحفظة');
                }

                if ($type === 'transfer') {
                    $targetLocked = Transaction::lockWallet((int)$targetWallet['id']);
                    if (!$targetLocked) {
                        throw new \RuntimeException('المحفظة الهدف غير موجودة');
                    }

                    Transaction::adjustBalance((int)$sourceWallet['id'], -$amount);
                    Transaction::adjustBalance((int)$targetWallet['id'], $amount);

                    $transferGroupId = Uuid::v4();
                    $incomingId = Action::create([
                        'user_id' => $userId,
                        'wallet_id' => (int)$targetWallet['id'],
                        'target_wallet_id' => (int)$sourceWallet['id'],
                        'type' => 'transfer',
                        'amount' => $amount,
                        'category_id' => $categoryId,
                        'description' => 'تحويل وارد - ' . $description,
                        'date' => $date,
                        'tag' => $tag,
                        'transfer_group_id' => $transferGroupId,
                    ]);

                    return Action::create([
                        'user_id' => $userId,
                        'wallet_id' => (int)$sourceWallet['id'],
                        'target_wallet_id' => (int)$targetWallet['id'],
                        'type' => 'transfer',
                        'amount' => $amount,
                        'category_id' => $categoryId,
                        'description' => $description,
                        'date' => $date,
                        'tag' => $tag,
                        'transfer_group_id' => $transferGroupId,
                    ]) ?: $incomingId;
                }

                Transaction::adjustBalance((int)$sourceWallet['id'], $sign * $amount);

                return Action::create([
                    'user_id' => $userId,
                    'wallet_id' => (int)$sourceWallet['id'],
                    'target_wallet_id' => null,
                    'type' => $type,
                    'amount' => $amount,
                    'category_id' => $categoryId,
                    'description' => $description,
                    'date' => $date,
                    'tag' => $tag,
                ]);
            });
        } catch (InsufficientBalanceException $e) {
            return ['action' => null, 'error' => $e->getMessage()];
        } catch (\Throwable $e) {
            return ['action' => null, 'error' => $e->getMessage() ?: 'تعذر تنفيذ العملية المتكررة'];
        }

        // Advance the schedule only after the money movement succeeded — a
        // failed run stays due so the next worker pass retries it.
        $runBase = max(date('Y-m-d'), (string)$recurring['next_run_date']);
        RecurringTransaction::advanceNextRun((int)$recurring['id'], (string)$recurring['frequency'], $runBase);

        return ['action' => Action::findById($actionId), 'error' => null];
    }
}
