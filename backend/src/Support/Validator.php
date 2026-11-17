<?php

namespace FinanceHub\Support;

use FinanceHub\Models\Category;
use FinanceHub\Models\Wallet;

/**
 * Centralized input validation + resource ownership checks.
 *
 * Every controller must validate referenced foreign keys against the
 * current user before inserting/updating — otherwise one user can
 * attach data to another user's wallet or category (IDOR).
 */
class Validator
{
    /** @var array<string, string[]> allowed ENUM values (mirror of 001_schema.sql) */
    public const ENUMS = [
        'wallet_type' => ['cash', 'bank', 'investment', 'savings', 'emergency'],
        'action_type' => ['deposit', 'withdraw', 'transfer', 'invest', 'borrow', 'repay'],
        'category_type' => ['income', 'expense'],
        'budget_period' => ['monthly', 'weekly', 'yearly'],
        'investment_asset_type' => ['stock', 'crypto', 'gold', 'realestate', 'other'],
        'bill_frequency' => ['monthly', 'yearly', 'quarterly'],
        'recurring_frequency' => ['daily', 'weekly', 'monthly', 'yearly'],
        'allocation_target_type' => ['wallet', 'category'],
        'allocation_type' => ['percentage', 'fixed'],
        'severity' => ['low', 'medium', 'high', 'critical'],
        'debt_direction' => ['lent_to', 'borrowed_from'],
        'debt_status' => ['pending', 'partial', 'paid'],
        'tontine_frequency' => ['weekly', 'monthly'],
        'tontine_status' => ['active', 'completed', 'cancelled'],
    ];

    public static function required(array $data, array $fields): ?string
    {
        foreach ($fields as $field) {
            if (!isset($data[$field]) || $data[$field] === '' || $data[$field] === null) {
                return "الحقل {$field} مطلوب";
            }
        }
        return null;
    }

    public static function isPositiveAmount(mixed $value): bool
    {
        if (is_numeric($value)) {
            return (float)$value > 0;
        }
        return false;
    }

    public static function isDate(mixed $value): bool
    {
        if (!is_string($value) || $value === '') {
            return false;
        }
        $d = \DateTime::createFromFormat('Y-m-d', $value);
        return $d !== false && $d->format('Y-m-d') === $value;
    }

    public static function isDateTime(mixed $value): bool
    {
        if (!is_string($value) || $value === '') {
            return false;
        }
        $d = \DateTime::createFromFormat('Y-m-d H:i:s', $value);
        return $d !== false && $d->format('Y-m-d H:i:s') === $value;
    }

    public static function inEnum(mixed $value, string $enumKey): bool
    {
        $allowed = self::ENUMS[$enumKey] ?? [];
        return is_string($value) && in_array($value, $allowed, true);
    }

    public static function maxLength(mixed $value, int $max): bool
    {
        return is_string($value) && mb_strlen($value) <= $max;
    }

    /**
     * True when the category is global (system) or owned by the user.
     * Null/empty category_id is allowed (optional FK).
     */
    public static function ownsCategory(int $userId, mixed $categoryId): bool
    {
        if ($categoryId === null || $categoryId === '' || $categoryId === false) {
            return true;
        }
        if (!is_numeric($categoryId)) {
            return false;
        }
        $category = Category::findById((int)$categoryId);
        if (!$category) {
            return false;
        }
        return $category['user_id'] === null || (int)$category['user_id'] === $userId;
    }

    public static function ownsWallet(int $userId, mixed $walletId): bool
    {
        if ($walletId === null || $walletId === '' || $walletId === false) {
            return true;
        }
        if (!is_numeric($walletId)) {
            return false;
        }
        return Wallet::findUserWallet((int)$walletId, $userId) !== null;
    }

    /**
     * Validate every optional FK reference in one call.
     * Returns an Arabic error string, or null when everything is valid.
     *
     * @param array<string, mixed> $data
     * @param array<string, string> $map field name => 'category'|'wallet'
     */
    public static function validateReferences(int $userId, array $data, array $map): ?string
    {
        foreach ($map as $field => $type) {
            if (!array_key_exists($field, $data)) {
                continue;
            }
            $value = $data[$field];
            if ($value === null || $value === '') {
                continue;
            }
            if ($type === 'category' && !self::ownsCategory($userId, $value)) {
                return 'الفئة غير موجودة أو لا تخصك';
            }
            if ($type === 'wallet' && !self::ownsWallet($userId, $value)) {
                return 'المحفظة غير موجودة أو لا تخصك';
            }
        }
        return null;
    }

    /**
     * @param array<string, mixed> $data
     * @param array<string, string> $map field name => enum key
     */
    public static function validateEnums(array $data, array $map): ?string
    {
        foreach ($map as $field => $enumKey) {
            if (!array_key_exists($field, $data) || $data[$field] === null || $data[$field] === '') {
                continue;
            }
            if (!self::inEnum($data[$field], $enumKey)) {
                return "قيمة غير صالحة للحقل {$field}";
            }
        }
        return null;
    }
}
