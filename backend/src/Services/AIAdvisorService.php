<?php

namespace FinanceHub\Services;

use FinanceHub\Config\AppConfig;
use FinanceHub\Models\Action;
use FinanceHub\Models\Budget;
use FinanceHub\Models\Wallet;
use FinanceHub\Models\Goal;
use FinanceHub\Models\Category;
use FinanceHub\Models\Contact;
use FinanceHub\Models\Insight;
use FinanceHub\Models\Anomaly;

class AIAdvisorService
{
    private ?string $apiKey = null;
    private ?int $userId = null;
    private string $provider = 'anthropic';
    private ?string $baseUrl = null;
    private string $model;

    public function __construct(?int $userId = null)
    {
        $this->userId = $userId;
        $this->apiKey = $this->resolveApiKey();
        $this->provider = $this->resolveProvider();
        $this->baseUrl = $this->resolveBaseUrl();
        $this->model = $this->resolveModel();
    }

    private function resolveApiKey(): string
    {
        if ($this->userId !== null) {
            try {
                $userKey = \FinanceHub\Models\User::getAiApiKey($this->userId);
                if ($userKey !== null && $userKey !== '') {
                    return $userKey;
                }
            } catch (\Throwable $e) {
            }
        }
        return (string)AppConfig::getAnthropicApiKey();
    }

    private function resolveProvider(): string
    {
        if ($this->userId !== null) {
            try {
                $p = \FinanceHub\Models\User::getAiProvider($this->userId);
                if ($p !== '') return $p;
            } catch (\Throwable $e) {
            }
        }
        return 'anthropic';
    }

    private function resolveBaseUrl(): ?string
    {
        if ($this->userId !== null) {
            try {
                $u = \FinanceHub\Models\User::getAiBaseUrl($this->userId);
                if ($u !== null && $u !== '') return $u;
            } catch (\Throwable $e) {
            }
        }
        if ($this->provider === 'openai') return 'https://api.openai.com/v1';
        if ($this->provider === 'groq') return 'https://api.groq.com/openai/v1';
        return null;
    }

    private function resolveModel(): string
    {
        if ($this->userId !== null) {
            try {
                $m = \FinanceHub\Models\User::getAiModel($this->userId);
                if ($m !== null && $m !== '') return $m;
            } catch (\Throwable $e) {
            }
        }
        if ($this->provider === 'openai') return 'gpt-4o-mini';
        if ($this->provider === 'groq') return 'llama-3.3-70b-versatile';
        if ($this->provider === 'openai-compatible') return 'gpt-3.5-turbo';
        return AppConfig::getAnthropicModel();
    }

    public function forUser(int $userId): self
    {
        $this->userId = $userId;
        $this->apiKey = $this->resolveApiKey();
        $this->provider = $this->resolveProvider();
        $this->baseUrl = $this->resolveBaseUrl();
        $this->model = $this->resolveModel();
        return $this;
    }

    /**
     * Parse free-text Arabic input into a structured action.
     *
     * Enriches the model prompt with the user's contacts, the last wallet and
     * category they actually used (so "دفعت 500 دج" reuses last wallet without
     * being spelled out), and today's date for relative expressions.
     * The result is always normalized locally — valid IDs, a concrete date,
     * an in-enum type — regardless of whether it came from Claude or from the
     * built-in rule-based parser (used when no API key is configured).
     */
    public function parseActionFromText(int $userId, string $text): array
    {
        $this->forUser($userId);
        $categories = Category::findAllByUser($userId);
        $wallets = Wallet::findAllByUser($userId);
        $contacts = Contact::findAllByUser($userId);
        $lastUsed = $this->getLastUsedReferences($userId);
        $relativeDate = $this->resolveRelativeDate($text);

        if ($wallets === []) {
            return [
                'type' => 'withdraw',
                'amount' => null,
                'category_id' => null,
                'wallet_id' => null,
                'target_wallet_id' => null,
                'description' => $text,
                'date' => date('Y-m-d'),
                'tag' => null,
                'confidence' => 0.0,
                'error' => 'أنشئ محفظة أولاً قبل تسجيل العمليات',
            ];
        }

        // No API key → deterministic local parser keeps the feature usable.
        if (empty($this->apiKey) || $this->apiKey === 'sk-ant-dummy') {
            return $this->normalizeParsedAction(
                $userId,
                $this->localParseAction($text, $wallets, $categories, $contacts, $lastUsed, $relativeDate),
                $wallets,
                $categories,
                $contacts,
                $lastUsed,
                $relativeDate
            );
        }

        $systemPrompt = "أنت مساعد تحليل مالي متخصص. مهمتك تحويل النص الحر إلى عملية مالية منظمة.
المرجع الزمني: اليوم هو " . date('Y-m-d') . " (ولكن اعتمد التاريخ المحلول المرفق إن وجد).
استخرج المعلومات التالية من النص:
1. نوع العملية (deposit, withdraw, transfer, invest, borrow, repay)
2. المبلغ (رقم فقط)
3. الفئة (اختر من القائمة المتاحة)
4. المحفظة المصدر (إن لم يذكر، استخدم آخر محفظة مستخدمة)
5. المحفظة الهدف (في حالة التحويل)
6. الوصف
7. التاريخ: إن كان نسبياً (أمس، غداً، بعد أسبوع...) حوّله إلى YYYY-MM-DD بناءً على المرجع الزمني
8. وسم اختياري
9. الشخص المذكور في النص إن وجد (contact_id من قائمة الأشخاص)

أعد الرد بصيغة JSON فقط بهذا الهيكل:
{
  \"type\": \"...\",
  \"amount\": رقم,
  \"category_id\": رقم أو null,
  \"category_name\": \"...\",
  \"wallet_id\": رقم,
  \"wallet_name\": \"...\",
  \"target_wallet_id\": رقم أو null,
  \"description\": \"...\",
  \"date\": \"YYYY-MM-DD\",
  \"tag\": \"...\" أو null,
  \"contact_id\": رقم أو null,
  \"contact_name\": \"...\" أو null,
  \"confidence\": 0.0 إلى 1.0
}";

        $context = "النص: {$text}\n\n";

        if ($relativeDate !== null) {
            $context .= "التاريخ المحلول من النص (أمس/غداً/...): {$relativeDate}\n\n";
        }

        $context .= "الفئات المتاحة:\n";
        foreach ($categories as $cat) {
            $context .= "- {$cat['id']}: {$cat['name']} ({$cat['type']})\n";
        }

        $context .= "\nالمحافظ المتاحة:\n";
        foreach ($wallets as $w) {
            $marker = ((int)$w['id'] === (int)($lastUsed['wallet_id'] ?? 0)) ? ' [آخر محفظة مستخدمة]' : '';
            $context .= "- {$w['id']}: {$w['name']} ({$w['type']}, الرصيد: {$w['balance']}){$marker}\n";
        }

        if ($lastUsed['category_id'] !== null) {
            $context .= "\nآخر فئة مستخدمة: {$lastUsed['category_id']} ({$lastUsed['category_name']})\n";
        }

        if ($contacts !== []) {
            $context .= "\nالأشخاص (جهات الاتصال):\n";
            foreach ($contacts as $c) {
                $context .= "- {$c['id']}: {$c['name']}\n";
            }
        }

        $result = $this->callAI($systemPrompt, $context);

        // The fallback payload carries a `note` — switch to the local parser so
        // the caller still receives a usable structured action.
        if (isset($result['note'])) {
            $result = $this->localParseAction($text, $wallets, $categories, $contacts, $lastUsed, $relativeDate);
        }

        return $this->normalizeParsedAction($userId, $result, $wallets, $categories, $contacts, $lastUsed, $relativeDate);
    }

    /**
     * Most recent wallet/category the user actually recorded — used as the
     * default target when the text doesn't mention one explicitly.
     *
     * @return array{wallet_id: int|null, wallet_name: string|null, category_id: int|null, category_name: string|null}
     */
    private function getLastUsedReferences(int $userId): array
    {
        $stmt = \FinanceHub\Config\Database::getConnection()->prepare(
            'SELECT wallet_id, category_id FROM actions
             WHERE user_id = ? ORDER BY date DESC, created_at DESC LIMIT 1'
        );
        $stmt->execute([$userId]);
        $last = $stmt->fetch();

        $refs = [
            'wallet_id' => null,
            'wallet_name' => null,
            'category_id' => null,
            'category_name' => null,
        ];

        if ($last) {
            if (!empty($last['wallet_id'])) {
                $wallet = Wallet::findUserWallet((int)$last['wallet_id'], $userId);
                if ($wallet) {
                    $refs['wallet_id'] = (int)$wallet['id'];
                    $refs['wallet_name'] = $wallet['name'];
                }
            }
            if (!empty($last['category_id'])) {
                $cat = Category::findById((int)$last['category_id']);
                if ($cat && ($cat['user_id'] === null || (int)$cat['user_id'] === $userId)) {
                    $refs['category_id'] = (int)$cat['id'];
                    $refs['category_name'] = $cat['name'];
                }
            }
        }

        return $refs;
    }

    /**
     * Resolve an Arabic relative date expression to Y-m-d (or null when the
     * text carries no date signal — caller then falls back to today).
     *
     * Handles: اليوم، أمس/البارحة، غداً/غدا، بعد/قبل N يوم(أيام/أسابيع/أشهر/سنة)،
     * بداية/نهاية الشهر، هذا/الشهر الماضي، بداية/نهاية الأسبوع.
     */
    private function resolveRelativeDate(string $text): ?string
    {
        $normalized = strtr($text, [
            'أ' => 'ا', 'إ' => 'ا', 'آ' => 'ا', 'ة' => 'ه', 'ى' => 'ي',
            '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4',
            '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
        ]);

        $today = new \DateTimeImmutable('today');

        // بعد/قبل + (عدد اختياري) + وحدة زمنية — "يوم" بدون عدد تعني واحداً.
        if (preg_match(
            '/(بعد|قبل)\s*(?:(\d+)\s*)?(يومين|يوم|ايام|أيام|اسبوعين|اسبوع|أسبوع|أسابيع|شهرين|شهر|شهور|سنتين|سنه|سنتان|سنة)?/u',
            $normalized,
            $m
        ) && (($m[2] ?? '') !== '' || ($m[3] ?? '') !== '')) {
            $direction = $m[1] === 'قبل' ? -1 : 1;
            $count = ($m[2] ?? '') !== '' ? (int)$m[2] : 1;
            $unit = $m[3] ?? 'يوم';

            // The dual form (يومين/اسبوعين/شهرين/سنتين) means ×2 when no digit is given.
            $isDual = str_ends_with($unit, 'ين') && ($m[2] ?? '') === '';
            if ($isDual) {
                $count = 2;
            }

            $days = match (true) {
                str_contains($unit, 'اسبوع') || str_contains($unit, 'أسبوع') => $count * 7,
                str_contains($unit, 'شهر') => $count * 30,
                str_contains($unit, 'سنه') || str_contains($unit, 'سنة') || str_contains($unit, 'سنت') => $count * 365,
                default => $count,
            };

            return $today->modify(($direction < 0 ? '-' : '+') . $days . ' days')->format('Y-m-d');
        }

        // كلمات مفردة
        if (preg_match('/\b(اليوم|الان)\b/u', $normalized)) {
            return $today->format('Y-m-d');
        }
        if (preg_match('/\b(امس|البارحه|بارحه)\b/u', $normalized)) {
            return $today->modify('-1 day')->format('Y-m-d');
        }
        if (preg_match('/\b(غدا|غداه|غداً)\b/u', $normalized)) {
            return $today->modify('+1 day')->format('Y-m-d');
        }

        // تواريخ الشهر — "القادم/الجاي" أولاً حتى لا يقع ضمن قاعدة "بداية الشهر".
        if (preg_match('/(بدايه الشهر القادم|بدايه الشهر الجاي|الشهر القادم|الشهر الجاي)/u', $normalized)) {
            return $today->modify('first day of next month')->format('Y-m-d');
        }
        if (preg_match('/(نهايه الشهر|اخر الشهر|اخر ايام الشهر)/u', $normalized)) {
            return $today->format('Y-m-t');
        }
        if (preg_match('/بدايه الشهر/u', $normalized)) {
            return $today->format('Y-m-01');
        }

        // هذا الأسبوع → اليوم (بداية النطاق المرجعي).
        if (preg_match('/(هذا الاسبوع|هذا الأسبوع)/u', $normalized)) {
            return $today->format('Y-m-d');
        }

        // أسماء أيام الأسبوع: أقرب يوم بذلك الاسم (اليوم نفسه أو لاحقاً).
        // Substring match on purpose: attached articles/particles
        // ("الجمعة" → "الجمعه" after normalization) defeat \b boundaries.
        $weekdays = [
            'احد' => 'sunday', 'اثنين' => 'monday', 'ثلاثاء' => 'tuesday',
            'اربعاء' => 'wednesday', 'خميس' => 'thursday',
            'جمعه' => 'friday', 'سبت' => 'saturday',
        ];
        foreach ($weekdays as $arabic => $day) {
            if (str_contains($normalized, $arabic)) {
                $candidate = $today;
                for ($i = 0; $i < 7; $i++) {
                    if (strtolower($candidate->format('l')) === $day) {
                        return $candidate->format('Y-m-d');
                    }
                    $candidate = $candidate->modify('+1 day');
                }
            }
        }

        // صيغة صريحة YYYY-MM-DD داخل النص
        if (preg_match('/\b(\d{4}-\d{2}-\d{2})\b/', $normalized, $m)) {
            $d = \DateTimeImmutable::createFromFormat('Y-m-d', $m[1]);
            if ($d !== false) {
                return $d->format('Y-m-d');
            }
        }

        return null;
    }

    /**
     * Rule-based Arabic parser — the no-API-key path. Extracts the amount with
     * a robust number matcher, classifies the verb keywords into an action
     * type, and pulls wallet/category/contact names found verbatim in the text.
     *
     * @param array<int, array<string, mixed>> $wallets
     * @param array<int, array<string, mixed>> $categories
     * @param array<int, array<string, mixed>> $contacts
     * @param array{wallet_id: int|null, wallet_name: string|null, category_id: int|null, category_name: string|null} $lastUsed
     * @return array<string, mixed>
     */
    private function localParseAction(
        string $text,
        array $wallets,
        array $categories,
        array $contacts,
        array $lastUsed,
        ?string $relativeDate
    ): array {
        $normalized = strtr($text, [
            'أ' => 'ا', 'إ' => 'ا', 'آ' => 'ا', 'ة' => 'ه', 'ى' => 'ي',
            '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4',
            '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
        ]);

        $amount = $this->extractAmount($text);

        // Dialect dictionary hints (set when a local word implies a category).
        $dialCategoryId = null;
        $dialCategoryName = null;

        // Verb-keyword classification (most specific first). Repayment comes
        // before borrowing so a text like "سددت قرض" can't be swallowed by the
        // bare "قرض" dictionary word below.
        $type = 'withdraw';
        $confidence = 0.45;

        if (preg_match('/(سددت|سداد|رددت|قضيت الدين|قضيت|سدّد)/u', $normalized)) {
            $type = 'repay';
            $confidence = 0.8;
        } elseif (preg_match('/(استلفت|استلاف|اقترضت|قرض|اخذت قرض|سلفتني|استلمت قرض)/u', $normalized)) {
            $type = 'borrow';
            $confidence = 0.8;
        } elseif (preg_match('/(تحويل|نقل من|حوّل|حويل)/u', $normalized)) {
            $type = 'transfer';
            $confidence = 0.7;
        } elseif (preg_match('/(استثمار|استثمرت|سهم|اسهم|صندوق|ذهب|عملات|كريبت)/u', $normalized)) {
            $type = 'invest';
            $confidence = 0.75;
        } elseif (preg_match('/(راتب|دخل|دخلت|ايداع|إيداع|بيع|ربح|هدية|منحه|استلمت|وصلني|وصلت|صافي|تحويل وارد|اربح)/u', $normalized)) {
            $type = 'deposit';
            $confidence = 0.75;
        } elseif (preg_match('/(عندي|وصلني|وصلت|صافي)\s*[\d.,]*\s*(ليران|دراهم|فلوس|دينار)/u', $normalized)) {
            // Algerian dialect: "ليران" (from French l'argent) = money in hand —
            // "عندي 5000 ليران" is income, not an expense.
            $type = 'deposit';
            $confidence = 0.75;
        } elseif (preg_match('/(دفعت|اشتريت|شراء|فاتوره|فاتورة|مصاريف|سوبيرات|سوبرماركت|قهوه|قهوة|بنزين|اجره|كراء|مواصلات|صحي|علاج|دواء)/u', $normalized)) {
            $type = 'withdraw';
            $confidence = 0.7;
        }

        // Algerian dialect dictionary (applies after the verb rules but never
        // hijacks an explicit borrow/repay/transfer/invest sentence).
        // Patterns are written in NORMALIZED form (ة→ه): قفة → قفه.
        $dialAllowed = !in_array($type, ['borrow', 'repay', 'transfer', 'invest'], true);
        if ($dialAllowed && preg_match('/قفه|قفات|قفاتي/u', $normalized)) {
            $type = 'withdraw';
            $confidence = max($confidence, 0.75);
            $dialCategoryId = 6;      // طعام ومشروبات
            $dialCategoryName = 'طعام ومشروبات';
        }
        if ($dialAllowed && preg_match('/فاتوره|فاتورة|غاز|كهرباء|فواتير/u', $normalized)) {
            $type = 'withdraw';
            $confidence = max($confidence, 0.75);
            $dialCategoryId = 9;      // فواتير
            $dialCategoryName = 'فواتير';
        }
        if ($dialAllowed && preg_match('/عمّاري|عماري|عمّاريه|عمّارية|العمارية/u', $normalized)) {
            $type = 'withdraw';
            $confidence = max($confidence, 0.75);
        }
        if (($type === 'deposit' || $type === 'withdraw') && preg_match('/(ليران|دراهم|فلوس)/u', $normalized)) {
            $confidence = max($confidence, 0.65);
        }

        // Wallet mentioned by name?
        $walletId = $lastUsed['wallet_id'];
        $walletName = $lastUsed['wallet_name'];
        foreach ($wallets as $w) {
            $name = trim((string)$w['name']);
            if ($name !== '' && mb_strpos($normalized, strtr($name, ['أ' => 'ا', 'إ' => 'ا', 'ة' => 'ه'])) !== false) {
                $walletId = (int)$w['id'];
                $walletName = $w['name'];
                $confidence = min(1.0, $confidence + 0.1);
                break;
            }
        }

        // Category mentioned by name?
        $categoryId = null;
        $categoryName = null;
        foreach ($categories as $c) {
            $name = trim((string)$c['name']);
            if ($name !== '' && mb_strpos($normalized, strtr($name, ['أ' => 'ا', 'إ' => 'ا', 'ة' => 'ه'])) !== false) {
                // Respect the type: expense verbs pair with expense categories and vice versa.
                $catType = (string)$c['type'];
                if (($type === 'deposit' && $catType === 'income') || ($type !== 'deposit' && $catType === 'expense')) {
                    $categoryId = (int)$c['id'];
                    $categoryName = $c['name'];
                    $confidence = min(1.0, $confidence + 0.1);
                    break;
                }
            }
        }
        // The dialect dictionary wins over the "last used" memory
        // (قفة→طعام، فاتورة→فواتير) — an explicit local word is a stronger
        // signal than habit.
        if ($categoryId === null && $dialCategoryId !== null) {
            $categoryId = $dialCategoryId;
            $categoryName = $dialCategoryName;
        }
        if ($categoryId === null && $type !== 'deposit' && $lastUsed['category_id'] !== null) {
            $categoryId = $lastUsed['category_id'];
            $categoryName = $lastUsed['category_name'];
        }

        // Contact mentioned by name?
        $contactId = null;
        $contactName = null;
        foreach ($contacts as $c) {
            $name = trim((string)$c['name']);
            if ($name !== '' && mb_strlen($name) >= 2 && mb_strpos($normalized, strtr($name, ['أ' => 'ا', 'إ' => 'ا', 'ة' => 'ه'])) !== false) {
                $contactId = (int)$c['id'];
                $contactName = $c['name'];
                break;
            }
        }

        // Default wallet: explicit mention → last used → first wallet.
        if ($walletId === null) {
            $walletId = (int)$wallets[0]['id'];
            $walletName = $wallets[0]['name'];
        }

        return [
            'type' => $type,
            'amount' => $amount,
            'category_id' => $categoryId,
            'category_name' => $categoryName,
            'wallet_id' => $walletId,
            'wallet_name' => $walletName,
            'target_wallet_id' => null,
            'description' => trim($text),
            'date' => $relativeDate ?? date('Y-m-d'),
            'tag' => null,
            'contact_id' => $contactId,
            'contact_name' => $contactName,
            'confidence' => round($confidence, 2),
        ];
    }

    /**
     * Extract a monetary amount from a (normalized) Arabic string.
     * Handles Latin + Arabic-Indic digits, space/comma/dot grouping
     * ("1 500", "1,500", "1.500.000"), decimal parts ("1500.50", "15,50")
     * and the ألف/الاف (thousand) multiplier.
     */
    private function extractAmount(string $rawText): ?float
    {
        // Idempotent normalization (callers may pass raw or normalized text).
        $candidate = strtr($rawText, [
            'أ' => 'ا', 'إ' => 'ا', 'آ' => 'ا', 'ة' => 'ه', 'ى' => 'ي',
            '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4',
            '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
            "\u{066C}" => ',',  // Arabic thousands separator
            "\u{066B}" => '.',  // Arabic decimal separator
            "\u{00A0}" => ' ',  // non-breaking space
        ]);

        // First token that looks like a number (space-grouped thousands first).
        $token = null;
        if (preg_match('/\d{1,3}(?: \d{3})+(?:[.,]\d{1,2})?/', $candidate, $m)) {
            $token = $m[0];
        } elseif (preg_match('/\d+(?:[.,]\d+)*/', $candidate, $m)) {
            $token = $m[0];
        }

        if ($token === null) {
            // Bare "ألف/الاف" with no digits — assume one thousand.
            return preg_match('/الف|الاف/u', $candidate) ? 1000.0 : null;
        }

        $value = $this->parseNumberString($token);
        if ($value === null) {
            return null;
        }

        // ألف multiplier: "10 الاف" → 10000, "1500 ألف" → 1 500 000.
        if (preg_match('/الف|الاف/u', $candidate)) {
            $value *= 1000;
        }

        if ($value <= 0 || $value > 999999999999.99) {
            return null;
        }

        return round($value, 2);
    }

    /**
     * Decide grouping vs decimal separators in a numeric token.
     *
     * Rules (money-first, DZD context):
     *  - both separators present → the LAST one is decimal, the rest grouping
     *  - single separator, exactly one group of 3 digits after it → grouping
     *    ("1,500" → 1500, "1.500" → 1500)
     *  - otherwise → decimal ("1500.50", "15,50")
     *  - repeated separators → grouping ("1.500.000" → 1500000)
     */
    private function parseNumberString(string $raw): ?float
    {
        $raw = str_replace(' ', '', $raw);

        $lastComma = strrpos($raw, ',');
        $lastDot = strrpos($raw, '.');

        if ($lastComma !== false && $lastDot !== false) {
            $decimalAt = max($lastComma, $lastDot);
            $decimalChar = $decimalAt === $lastComma ? ',' : '.';
            $groupingChar = $decimalChar === ',' ? '.' : ',';
            $raw = str_replace($groupingChar, '', substr($raw, 0, $decimalAt))
                . '.' . substr($raw, $decimalAt + 1);
        } elseif ($lastComma !== false || $lastDot !== false) {
            $sep = $lastComma !== false ? ',' : '.';
            $parts = explode($sep, $raw);
            $after = end($parts);

            if (count($parts) === 2 && strlen($after) === 3) {
                $raw = implode('', $parts);              // grouping: 1,500 → 1500
            } elseif (count($parts) === 2) {
                $raw = $parts[0] . '.' . $after;         // decimal:  15,50 → 15.50
            } else {
                $raw = implode('', $parts);              // repeated: 1.500.000 → 1500000
            }
        }

        if (!is_numeric($raw)) {
            return null;
        }

        return (float)$raw;
    }

    /**
     * Force the parsed payload into a shape the create endpoint accepts:
     * valid enum type, owned wallet/category/contact IDs, concrete date.
     *
     * @param array<int, array<string, mixed>> $wallets
     * @param array<int, array<string, mixed>> $categories
     * @param array<int, array<string, mixed>> $contacts
     * @param array{wallet_id: int|null, wallet_name: string|null, category_id: int|null, category_name: string|null} $lastUsed
     * @return array<string, mixed>
     */
    private function normalizeParsedAction(
        int $userId,
        array $result,
        array $wallets,
        array $categories,
        array $contacts,
        array $lastUsed,
        ?string $relativeDate
    ): array {
        $validTypes = ['deposit', 'withdraw', 'transfer', 'invest', 'borrow', 'repay'];
        $type = isset($result['type']) && in_array($result['type'], $validTypes, true)
            ? $result['type']
            : 'withdraw';

        $amount = null;
        if (isset($result['amount']) && is_numeric($result['amount']) && (float)$result['amount'] > 0) {
            $amount = round((float)$result['amount'], 2);
        }

        // Wallet: trust a valid ID, else match the returned name, else memory.
        $walletId = $lastUsed['wallet_id'];
        $walletName = $lastUsed['wallet_name'];
        if (isset($result['wallet_id']) && is_numeric($result['wallet_id'])) {
            foreach ($wallets as $w) {
                if ((int)$w['id'] === (int)$result['wallet_id']) {
                    $walletId = (int)$w['id'];
                    $walletName = $w['name'];
                    break;
                }
            }
        }
        if ($walletId === null && !empty($result['wallet_name'])) {
            foreach ($wallets as $w) {
                if (trim((string)$w['name']) === trim((string)$result['wallet_name'])) {
                    $walletId = (int)$w['id'];
                    $walletName = $w['name'];
                    break;
                }
            }
        }
        if ($walletId === null && $wallets !== []) {
            $walletId = (int)$wallets[0]['id'];
            $walletName = $wallets[0]['name'];
        }

        // Category: the caller already passed the user's full category list
        // (system + owned) — validate the ID against it instead of a DB round-trip.
        $categoryId = null;
        $categoryName = null;
        if (isset($result['category_id']) && is_numeric($result['category_id'])) {
            foreach ($categories as $c) {
                if ((int)$c['id'] === (int)$result['category_id']) {
                    $categoryId = (int)$c['id'];
                    $categoryName = $c['name'];
                    break;
                }
            }
        }
        if ($categoryId === null && !empty($result['category_name'])) {
            foreach ($categories as $c) {
                if (trim((string)$c['name']) === trim((string)$result['category_name'])) {
                    $categoryId = (int)$c['id'];
                    $categoryName = $c['name'];
                    break;
                }
            }
        }
        if ($categoryId !== null) {
            $catType = null;
            foreach ($categories as $c) {
                if ((int)$c['id'] === $categoryId) {
                    $catType = (string)$c['type'];
                    break;
                }
            }
            // A deposit must not carry an expense category (and vice versa).
            if ($catType !== null && (($type === 'deposit' && $catType === 'expense') || ($type !== 'deposit' && $catType === 'income'))) {
                $categoryId = null;
                $categoryName = null;
            }
        }

        // Date: explicit valid value > resolved relative > today. Never future.
        $date = date('Y-m-d');
        if (isset($result['date']) && is_string($result['date'])) {
            $d = \DateTimeImmutable::createFromFormat('Y-m-d', $result['date']);
            if ($d !== false && $d->format('Y-m-d') === $result['date']) {
                $date = $d->format('Y-m-d');
            }
        } elseif ($relativeDate !== null) {
            $date = $relativeDate;
        }
        if ($date > date('Y-m-d')) {
            $date = date('Y-m-d');
        }

        // Contact: valid ID, else exact name match (never auto-create here —
        // the create endpoint owns contact creation via contact_name).
        $contactId = null;
        $contactName = null;
        if (isset($result['contact_id']) && is_numeric($result['contact_id'])) {
            foreach ($contacts as $c) {
                if ((int)$c['id'] === (int)$result['contact_id']) {
                    $contactId = (int)$c['id'];
                    $contactName = $c['name'];
                    break;
                }
            }
        }
        if ($contactId === null && !empty($result['contact_name'])) {
            foreach ($contacts as $c) {
                if (trim((string)$c['name']) === trim((string)$result['contact_name'])) {
                    $contactId = (int)$c['id'];
                    $contactName = $c['name'];
                    break;
                }
            }
        }
        if ($contactId === null && !empty($result['contact_name'])) {
            $contactName = trim((string)$result['contact_name']);
        }

        $confidence = isset($result['confidence']) && is_numeric($result['confidence'])
            ? max(0.0, min(1.0, (float)$result['confidence']))
            : 0.5;

        $description = isset($result['description']) && is_string($result['description']) && trim($result['description']) !== ''
            ? mb_substr(trim($result['description']), 0, 1000)
            : '';

        $tag = null;
        if (isset($result['tag']) && is_string($result['tag']) && trim($result['tag']) !== '') {
            $tag = mb_substr(trim($result['tag']), 0, 50);
        }

        return [
            'type' => $type,
            'amount' => $amount,
            'category_id' => $categoryId,
            'category_name' => $categoryName,
            'wallet_id' => $walletId,
            'wallet_name' => $walletName,
            'target_wallet_id' => null,
            'description' => $description,
            'date' => $date,
            'tag' => $tag,
            'contact_id' => $contactId,
            'contact_name' => $contactName,
            'confidence' => $confidence,
        ];
    }

    /**
     * Generate smart budget suggestions based on spending history
     */
    public function suggestBudgets(int $userId): array
    {
        $this->forUser($userId);
        $last3Months = date('Y-m-d', strtotime('-3 months'));
        $now = date('Y-m-d');

        $categoryTotals = Action::getCategoryTotals($userId, $last3Months, $now);
        $totalSpending = array_sum(array_column($categoryTotals, 'total'));

        if ($totalSpending <= 0) {
            return ['suggestions' => [], 'message' => 'لا توجد بيانات إنفاق كافية لاقتراح ميزانيات'];
        }

        $suggestions = [];
        foreach ($categoryTotals as $cat) {
            $monthlyAvg = $cat['total'] / 3;
            $percentage = round(($cat['total'] / $totalSpending) * 100, 1);
            $suggestions[] = [
                'category_id'    => $cat['id'],
                'category_name'  => $cat['name'],
                'category_icon'  => $cat['icon'],
                'suggested_amount' => round($monthlyAvg * 0.9, -2), // 90% of average as target
                'monthly_average' => round($monthlyAvg),
                'percentage'     => $percentage,
            ];
        }

        $prompt = "بناءً على بيانات الإنفاق التالية لآخر 3 أشهر، اقترح ميزانية شهرية مناسبة لكل فئة.
المجموع الشهري المتوسط: " . round($totalSpending / 3) . "
المقترحات:\n" . json_encode($suggestions) . "

أعد JSON بالهيكل نفسه مع إضافة حقل 'reason' (سبب الاقتراح) لكل فئة.";

        // No key → the local math above IS the answer (never an error shape):
        // each suggestion gets a deterministic reason so callers can render
        // a full list either way.
        if (empty($this->apiKey) || $this->apiKey === 'sk-ant-dummy') {
            foreach ($suggestions as &$s) {
                $s['reason'] = sprintf(
                    'متوسط إنفاقك %.0f دج شهرياً في هذه الفئة (%.0f%% من إنفاقك) — الهدف 10%% أقل لدفعك للأفضل.',
                    $s['monthly_average'],
                    $s['percentage']
                );
            }
            unset($s);
            return [
                'suggestions' => $suggestions,
                'ai_used' => false,
                'message' => 'اقتراحات محلية بناءً على آخر 3 أشهر',
            ];
        }

        $ai = $this->callAI("أنت مستشار مالي خبير.", $prompt);
        // Claude must return the same list; if it doesn't, keep local.
        if (isset($ai['suggestions']) && is_array($ai['suggestions']) && $ai['suggestions'] !== []) {
            return ['suggestions' => $ai['suggestions'], 'ai_used' => true];
        }
        foreach ($suggestions as &$s) {
            $s['reason'] = 'متوسط إنفاقك في هذه الفئة خلال آخر 3 أشهر.';
        }
        unset($s);
        return ['suggestions' => $suggestions, 'ai_used' => false];
    }

    /**
     * Generate income allocation suggestions
     */
    public function suggestIncomeAllocation(int $userId, float $incomeAmount, string $incomeSource): array
    {
        $this->forUser($userId);
        $wallets = Wallet::findAllByUser($userId);
        $last3Months = date('Y-m-d', strtotime('-3 months'));
        $now = date('Y-m-d');
        $spending = Action::getCategoryTotals($userId, $last3Months, $now);
        $totalExpenses = array_sum(array_column($spending, 'total'));
        $monthlyAvg = $totalExpenses > 0 ? round($totalExpenses / 3) : 0;

        $systemPrompt = "أنت مستشار مالي خبير في التوزيع الذكي للدخل.
مهمتك اقتراح توزيع مثالي للدخل على المحافظ والفئات بناءً على سلوك المستخدم المالي.";
        $prompt = "مبلغ الدخل: {$incomeAmount}
مصدر الدخل: {$incomeSource}
المحافظ المتاحة:\n" . json_encode($wallets) . "
معدل الإنفاق الشهري: {$monthlyAvg}
\nاقترح توزيعاً ذكياً للدخل بنسب مئوية ومبالغ.
أعد JSON:
{
  \"allocations\": [{\"target_type\": \"wallet\"|\"category\", \"target_id\": رقم, \"target_name\": \"...\", \"percentage\": رقم, \"amount\": رقم, \"reason\": \"...\"}],
  \"summary\": \"ملخص التوزيع\",
  \"risk_notes\": [\"...\"]
}";

        return $this->callAI($systemPrompt, $prompt);
    }

    /**
     * Chat with AI advisor using real user data context
     */
    public function chat(int $userId, string $message, array $history = []): array
    {
        $this->forUser($userId);
        $wallets = Wallet::findAllByUser($userId);
        $totalAssets = Wallet::getTotalAssets($userId);
        $thisMonth = date('Y-m');
        $lastMonth = date('Y-m', strtotime('-1 month'));
        $thisMonthSummary = Action::getMonthlySummary($userId, $thisMonth);
        $lastMonthSummary = Action::getMonthlySummary($userId, $lastMonth);

        $currentMonthStart = date('Y-m-01');
        $currentMonthEnd = date('Y-m-t');
        $categorySpending = Action::getCategoryTotals($userId, $currentMonthStart, $currentMonthEnd);

        $budgets = Budget::findAllByUser($userId);
        $goals = Goal::findAllByUser($userId);
        $upcomingBills = \FinanceHub\Models\Bill::findUpcoming($userId, 30);
        $investments = \FinanceHub\Models\Investment::findAllByUser($userId);

        $contextData = [
            'total_assets' => $totalAssets,
            'wallets' => $wallets,
            'current_month_summary' => $thisMonthSummary,
            'last_month_summary' => $lastMonthSummary,
            'category_spending' => $categorySpending,
            'budgets' => $budgets,
            'goals' => $goals,
            'upcoming_bills' => $upcomingBills,
            'investments' => $investments,
        ];

        $systemPrompt = "أنت المستشار المالي الشخصي للمنصة. لديك صلاحية الوصول إلى بيانات المستخدم الحقيقية التالية:
" . json_encode($contextData, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . "

تعليمات مهمة:
1. استخدم الأرقام الحقيقية من البيانات أعلاه فقط في إجاباتك.
2. إذا سأل عن معلومة غير موجودة، أخبره أنك لا تملك هذه المعلومة بدقة.
3. كن دقيقاً في الأرقام واذكر المصدر (أي محفظة/فئة).
4. قدم نصائح مالية عملية بناءً على البيانات الفعلية.
5. إذا طلب رسم بياني، قم بتوليد وصف للبيانات التي يمكن عرضها.
6. رد بالعربية الفصحى الواضحة.";

        $historyFormatted = [];
        foreach (array_slice($history, -10) as $msg) {
            $historyFormatted[] = ($msg['role'] === 'user' ? 'المستخدم' : 'المستشار') . ': ' . $msg['message'];
        }

        $userPrompt = "تاريخ المحادثة:\n" . implode("\n", $historyFormatted) . "\n\nسؤال المستخدم: {$message}";

        return $this->callAI($systemPrompt, $userPrompt);
    }

    /**
     * Generate financial health score
     */
    public function calculateHealthScore(int $userId): array
    {
        $wallets = Wallet::findAllByUser($userId);
        $totalAssets = Wallet::getTotalAssets($userId);

        $last6Months = date('Y-m-d', strtotime('-6 months'));
        $now = date('Y-m-d');

        $incomeStmt = \FinanceHub\Config\Database::getConnection()->prepare(
            "SELECT COALESCE(SUM(amount), 0) as total FROM actions WHERE user_id = ? AND type IN ('deposit', 'income') AND date BETWEEN ? AND ?"
        );
        $incomeStmt->execute([$userId, $last6Months, $now]);
        $totalIncome = (float)$incomeStmt->fetch()['total'];

        $expenseStmt = \FinanceHub\Config\Database::getConnection()->prepare(
            "SELECT COALESCE(SUM(amount), 0) as total FROM actions WHERE user_id = ? AND type = 'withdraw' AND date BETWEEN ? AND ?"
        );
        $expenseStmt->execute([$userId, $last6Months, $now]);
        $totalExpenses = (float)$expenseStmt->fetch()['total'];

        $debtStmt = \FinanceHub\Config\Database::getConnection()->prepare(
            "SELECT COALESCE(SUM(amount), 0) as total FROM actions WHERE user_id = ? AND type = 'borrow' AND date BETWEEN ? AND ?"
        );
        $debtStmt->execute([$userId, $last6Months, $now]);
        $totalDebt = (float)$debtStmt->fetch()['total'];

        $repayStmt = \FinanceHub\Config\Database::getConnection()->prepare(
            "SELECT COALESCE(SUM(amount), 0) as total FROM actions WHERE user_id = ? AND type = 'repay' AND date BETWEEN ? AND ?"
        );
        $repayStmt->execute([$userId, $last6Months, $now]);
        $totalRepaid = (float)$repayStmt->fetch()['total'];

        // Factor 1: Savings rate (income vs expense)
        $savingsRate = $totalIncome > 0 ? ($totalIncome - $totalExpenses) / $totalIncome : 0;
        $savingsScore = min(100, max(0, $savingsRate * 100));

        // Factor 2: Budget adherence
        $budgets = Budget::findAllByUser($userId);
        $budgetScore = 50;
        if (!empty($budgets)) {
            $onTrack = 0;
            foreach ($budgets as $b) {
                $ratio = $b['amount'] > 0 ? ($b['spent'] / $b['amount']) : 0;
                if ($ratio <= 1.0) $onTrack++;
            }
            $budgetScore = ($onTrack / count($budgets)) * 100;
        }

        // Factor 3: Expense stability
        $expenseScore = $totalIncome > 0 ? max(0, 100 - (($totalExpenses / max($totalIncome, 1)) * 50)) : 50;

        // Factor 4: Debt ratio
        $debtRatio = $totalIncome > 0 ? ($totalDebt - $totalRepaid) / $totalIncome : 0;
        $debtScore = max(0, 100 - ($debtRatio * 100));

        // Factor 5: Liquidity (cash + bank balance)
        $liquidBalance = 0;
        foreach ($wallets as $w) {
            if (in_array($w['type'], ['cash', 'bank'])) {
                $liquidBalance += $w['balance'];
            }
        }
        $monthlyExpense = max(1, $totalExpenses / 6);
        $liquidityRatio = $liquidBalance / $monthlyExpense;
        $liquidityScore = min(100, ($liquidityRatio / 6) * 100);

        $weights = [0.25, 0.20, 0.15, 0.20, 0.20];
        $scores = [$savingsScore, $budgetScore, $expenseScore, $debtScore, $liquidityScore];
        $overallScore = 0;
        $breakdown = [];

        $factorNames = ['نسبة الادخار', 'الالتزام بالميزانية', 'معدل الإنفاق', 'نسبة الديون', 'السيولة المتاحة'];
        $factorKeys = ['savings_rate', 'budget_adherence', 'expense_rate', 'debt_ratio', 'liquidity'];

        for ($i = 0; $i < 5; $i++) {
            $overallScore += $scores[$i] * $weights[$i];
            $breakdown[$factorKeys[$i]] = [
                'score' => round($scores[$i], 1),
                'weight' => $weights[$i],
                'label' => $factorNames[$i],
                'contribution' => round($scores[$i] * $weights[$i], 1),
            ];
        }

        return [
            'score' => round($overallScore),
            'breakdown' => $breakdown,
            'factors' => $scores,
        ];
    }

    /**
     * Generate monthly behavioral insights
     */
    public function generateMonthlyInsights(int $userId): array
    {
        $this->forUser($userId);
        $currentMonth = date('Y-m');
        $lastMonth = date('Y-m', strtotime('-1 month'));

        $currentSummary = Action::getMonthlySummary($userId, $currentMonth);
        $lastSummary = Action::getMonthlySummary($userId, $lastMonth);

        $currentExpenses = 0;
        $lastExpenses = 0;
        $currentIncome = 0;
        $lastIncome = 0;

        foreach ($currentSummary as $s) {
            if ($s['type'] === 'withdraw') $currentExpenses += $s['total'];
            if (in_array($s['type'], ['deposit', 'income'])) $currentIncome += $s['total'];
        }
        foreach ($lastSummary as $s) {
            if ($s['type'] === 'withdraw') $lastExpenses += $s['total'];
            if (in_array($s['type'], ['deposit', 'income'])) $lastIncome += $s['total'];
        }

        $startDate = date('Y-m-01');
        $endDate = date('Y-m-t');
        $categorySpending = Action::getCategoryTotals($userId, $startDate, $endDate);

        $prompts = [];
        $insights = [];

        // Compare month over month
        if ($lastExpenses > 0) {
            $change = (($currentExpenses - $lastExpenses) / $lastExpenses) * 100;
            $direction = $change > 0 ? 'أكثر' : 'أقل';
            $insights[] = [
                'type' => 'spending_trend',
                'message' => "صرفت هذا الشهر " . number_format(abs($change), 1) . "% {$direction} من الشهر الماضي.",
                'data' => ['change_percent' => round($change, 1), 'current' => $currentExpenses, 'previous' => $lastExpenses],
            ];
        }

        // Top spending category
        if (!empty($categorySpending)) {
            $top = $categorySpending[0];
            $insights[] = [
                'type' => 'top_category',
                'message' => "أعلى فئة إنفاق هذا الشهر: {$top['name']} بمبلغ " . number_format($top['total']) . " دج.",
                'data' => $top,
            ];
        }

        // Budget warnings
        $budgets = Budget::findAllByUser($userId);
        foreach ($budgets as $budget) {
            $ratio = $budget['amount'] > 0 ? ($budget['spent'] / $budget['amount']) * 100 : 0;
            if ($ratio > 80) {
                $insights[] = [
                    'type' => 'budget_warning',
                    'message' => "تجاوزت {$ratio}% من ميزانية {$budget['category_name']} (أنفقت " . number_format($budget['spent']) . " من " . number_format($budget['amount']) . " دج).",
                    'data' => $budget,
                ];
            }
        }

        // Savings opportunity
        if (!empty($categorySpending)) {
            foreach ($categorySpending as $cat) {
                if ($cat['total'] > 5000 && !in_array($cat['name'], ['سكن وإيجار', 'فواتير', 'تأمين'])) {
                    $potentialSaving = round($cat['total'] * 0.2);
                    $insights[] = [
                        'type' => 'savings_opportunity',
                        'message' => "يمكنك توفير حوالي {$potentialSaving} دج شهرياً بتقليل الإنفاق على {$cat['name']}.",
                        'data' => $cat,
                    ];
                    break;
                }
            }
        }

        // Run through AI for more contextual insights
        $systemPrompt = "أنت محلل مالي. بناءً على البيانات التالية، أنشئ رؤى مالية ذكية ومفيدة للمستخدم.";
        $prompt = json_encode([
            'current_month_income' => $currentIncome,
            'current_month_expenses' => $currentExpenses,
            'last_month_income' => $lastIncome,
            'last_month_expenses' => $lastExpenses,
            'top_categories' => $categorySpending,
        ], JSON_UNESCAPED_UNICODE);

        $aiResult = $this->callAI($systemPrompt, $prompt . "\n\nأعد JSON: {\"ai_insights\": [{\"type\": \"...\", \"message\": \"...\", \"data\": {...}}]}");

        return [
            'insights' => $insights,
            'ai_insights' => $aiResult['ai_insights'] ?? [],
            'summary' => "دخل هذا الشهر: " . number_format($currentIncome) . " دج، مصروفات: " . number_format($currentExpenses) . " دج",
        ];
    }

    /**
     * Detect anomalies in a new action
     */
    public function detectAnomaly(int $userId, array $action): ?array
    {
        if (empty($action['category_id'])) return null;

        $stmt = \FinanceHub\Config\Database::getConnection()->prepare(
            "SELECT AVG(amount) as avg_amount, STDDEV(amount) as std_amount, COUNT(*) as count
             FROM actions
             WHERE user_id = ? AND category_id = ? AND type = ? AND id != ?
             AND date >= DATE_SUB(NOW(), INTERVAL 6 MONTH)"
        );
        $stmt->execute([$userId, $action['category_id'], $action['type'], $action['id'] ?? 0]);
        $stats = $stmt->fetch();

        if (!$stats || $stats['count'] < 3) return null;

        $avg = (float)$stats['avg_amount'];
        $std = (float)$stats['std_amount'];
        $amount = (float)$action['amount'];
        $count = (int)$stats['count'];

        if ($std == 0 && $avg > 0) {
            $ratio = $amount / $avg;
            if ($ratio > 2) {
                return [
                    'severity' => $ratio > 3 ? 'high' : 'medium',
                    'reason' => "هذه أول مرة يتجاوز فيها مبلغ {$action['description']} مبلغ " . number_format($avg) . " دج بهذا المقدار (" . round($ratio) . " أضعاف المتوسط).",
                    'supporting_data' => ['average' => $avg, 'current' => $amount, 'ratio' => round($ratio, 2), 'sample_count' => $count],
                ];
            }
            return null;
        }

        if ($std > 0) {
            $zScore = abs($amount - $avg) / $std;
            if ($zScore > 2.5) {
                $severity = $zScore > 3.5 ? 'critical' : ($zScore > 3 ? 'high' : 'medium');
                return [
                    'severity' => $severity,
                    'reason' => "هذا المبلغ (" . number_format($amount) . " دج) أكبر من متوسط إنفاقك على هذه الفئة (" . number_format($avg) . " دج) بفارق " . round($zScore, 1) . " انحراف معياري.",
                    'supporting_data' => ['average' => $avg, 'std' => $std, 'current' => $amount, 'z_score' => round($zScore, 2), 'sample_count' => $count],
                ];
            }
        }

        return null;
    }

    /**
     * Generate forecast data
     */
    public function generateForecast(int $userId): array
    {
        $wallets = Wallet::findAllByUser($userId);
        $totalBalance = Wallet::getTotalAssets($userId);

        $stmt = \FinanceHub\Config\Database::getConnection()->prepare(
            // Net flow averaged over the whole 90-day calendar window (not
            // just the days that have transactions — averaging active days
            // only would inflate quiet months into busy ones).
            "SELECT COALESCE(SUM(CASE WHEN a.type IN ('deposit', 'income') THEN a.amount
                                      WHEN a.type = 'withdraw' THEN -a.amount ELSE 0 END), 0) / 90.0
                    as avg_daily_net
             FROM actions a
             WHERE a.user_id = ? AND a.date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)"
        );
        $stmt->execute([$userId]);
        $avgDailyNet = (float)$stmt->fetch()['avg_daily_net'];

        // Get recurring income/expenses
        $recurringStmt = \FinanceHub\Config\Database::getConnection()->prepare(
            "SELECT * FROM recurring_transactions WHERE user_id = ? AND is_active = TRUE"
        );
        $recurringStmt->execute([$userId]);
        $recurringItems = $recurringStmt->fetchAll();

        $upcomingStmt = \FinanceHub\Config\Database::getConnection()->prepare(
            "SELECT SUM(amount) as total FROM bills WHERE user_id = ? AND is_paid = FALSE AND due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)"
        );
        $upcomingStmt->execute([$userId]);
        $upcomingBillsTotal = (float)$upcomingStmt->fetch()['total'] ?? 0;

        $dailyForecast = [];
        $projected = $totalBalance;
        for ($day = 0; $day < 30; $day++) {
            $date = date('Y-m-d', strtotime("+{$day} days"));
            $projected += $avgDailyNet;

            foreach ($recurringItems as $item) {
                $nextDate = $item['next_run_date'];
                if ($date >= $nextDate) {
                    $template = json_decode($item['action_template'], true);
                    if ($template['type'] === 'deposit' || $template['type'] === 'income') {
                        $projected += $template['amount'];
                    } else {
                        $projected -= $template['amount'];
                    }
                }
            }

            foreach ($recurringItems as &$item) {
                $nextDate = $item['next_run_date'];
                if ($date >= $nextDate) {
                    $freq = $item['frequency'];
                    $item['next_run_date'] = match ($freq) {
                        'daily' => date('Y-m-d', strtotime($nextDate . ' +1 day')),
                        'weekly' => date('Y-m-d', strtotime($nextDate . ' +1 week')),
                        'monthly' => date('Y-m-d', strtotime($nextDate . ' +1 month')),
                        'yearly' => date('Y-m-d', strtotime($nextDate . ' +1 year')),
                        default => date('Y-m-d', strtotime($nextDate . ' +1 month')),
                    };
                }
            }
            unset($item);

            $dailyForecast[] = [
                'date' => $date,
                'projected_balance' => round($projected, 2),
                'lower_bound' => round($projected - ($avgDailyNet * 0.5 * $day), 2),
                'upper_bound' => round($projected + ($avgDailyNet * 0.5 * $day), 2),
            ];
        }

        $zeroCrossDay = null;
        foreach ($dailyForecast as $day) {
            if ($day['projected_balance'] <= 0) {
                $zeroCrossDay = $day['date'];
                break;
            }
        }

        return [
            'forecast' => $dailyForecast,
            'avg_daily_net' => round($avgDailyNet, 2),
            'current_balance' => $totalBalance,
            'upcoming_bills' => $upcomingBillsTotal,
            'estimated_runway' => $avgDailyNet < 0 && $totalBalance > 0
                ? round($totalBalance / abs($avgDailyNet))
                : null,
            'estimated_depletion_date' => $zeroCrossDay,
        ];
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Phase 4 — Monthly report (التقرير الشهري)
    // ═════════════════════════════════════════════════════════════════════════

    /** Algerian month names (جانفي → ديسمبر). */
    private const MONTH_NAMES = [
        1 => 'جانفي', 2 => 'فيفري', 3 => 'مارس', 4 => 'أفريل',
        5 => 'ماي', 6 => 'جوان', 7 => 'جويلية', 8 => 'أوت',
        9 => 'سبتمبر', 10 => 'أكتوبر', 11 => 'نوفمبر', 12 => 'ديسمبر',
    ];

    /**
     * Full monthly report: real numbers + narrative + 3 recommendations.
     * The narrative/recommendations come from Claude when a key is set,
     * otherwise from the local composer below — the feature never degrades
     * into an error state.
     */
    public function generateMonthlyReport(int $userId, int $year, int $month): array
    {
        $this->forUser($userId);
        $start = sprintf('%04d-%02d-01', $year, $month);
        $end = date('Y-m-t', strtotime($start));
        $prevStart = date('Y-m-01', strtotime($start . ' -1 month'));
        $prevEnd = date('Y-m-t', strtotime($prevStart));
        $db = \FinanceHub\Config\Database::getConnection();

        $sumTypes = static function (int $userId, string $from, string $to, array $types) use ($db): array {
            $in = implode(',', array_fill(0, count($types), '?'));
            $stmt = $db->prepare(
                "SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS cnt
                 FROM actions WHERE user_id = ? AND date BETWEEN ? AND ? AND type IN ({$in})"
            );
            $stmt->execute(array_merge([$userId, $from, $to], $types));
            $row = $stmt->fetch();
            return ['total' => round((float)$row['total'], 2), 'count' => (int)$row['cnt']];
        };

        $income = $sumTypes($userId, $start, $end, ['deposit']);
        $expenses = $sumTypes($userId, $start, $end, ['withdraw']);
        $prevIncome = $sumTypes($userId, $prevStart, $prevEnd, ['deposit']);
        $prevExpenses = $sumTypes($userId, $prevStart, $prevEnd, ['withdraw']);
        $borrowed = $sumTypes($userId, $start, $end, ['borrow']);
        $repaid = $sumTypes($userId, $start, $end, ['repay']);

        $net = round($income['total'] - $expenses['total'], 2);
        $savingsRate = $income['total'] > 0 ? round($net / $income['total'] * 100, 1) : 0.0;

        $categories = [];
        foreach (Action::getCategoryTotals($userId, $start, $end) as $row) {
            $categories[] = [
                'id' => (int)$row['id'],
                'name' => $row['name'],
                'icon' => $row['icon'],
                'color' => $row['color'],
                'total' => round((float)$row['total'], 2),
                'count' => (int)$row['count'],
                'percent' => $expenses['total'] > 0
                    ? round((float)$row['total'] / $expenses['total'] * 100, 1) : 0.0,
            ];
        }

        $delta = static function (float $now, float $prev): array {
            return [
                'value' => round($now - $prev, 2),
                'percent' => $prev > 0 ? round(($now - $prev) / $prev * 100, 1) : ($now > 0 ? 100.0 : 0.0),
            ];
        };

        // Budget status only makes sense for the current month (budgets track
        // live spending).
        $budgets = [];
        if ($start === date('Y-m-01')) {
            foreach (Budget::findAllByUser($userId) as $b) {
                $budgets[] = [
                    'name' => $b['category_name'] ?? $b['name'] ?? 'ميزانية',
                    'limit' => round((float)$b['amount'], 2),
                    'spent' => round((float)($b['spent'] ?? 0), 2),
                    'percent' => (float)$b['amount'] > 0
                        ? round((float)($b['spent'] ?? 0) / (float)$b['amount'] * 100, 1) : 0.0,
                ];
            }
        }

        $report = [
            'year' => $year,
            'month' => $month,
            'period_label' => self::MONTH_NAMES[$month] . ' ' . $year,
            'period' => ['from' => $start, 'to' => $end],
            'summary' => [
                'income' => $income['total'],
                'expenses' => $expenses['total'],
                'net' => $net,
                'savings_rate' => $savingsRate,
                'transactions' => $income['count'] + $expenses['count'],
                'borrowed' => $borrowed['total'],
                'repaid' => $repaid['total'],
            ],
            'vs_last_month' => [
                'income' => $delta($income['total'], $prevIncome['total']),
                'expenses' => $delta($expenses['total'], $prevExpenses['total']),
                'label' => self::MONTH_NAMES[(int)date('n', strtotime($prevStart))] . ' ' . date('Y', strtotime($prevStart)),
            ],
            'categories' => array_slice($categories, 0, 8),
            'budgets' => $budgets,
            'assets' => round(Wallet::getTotalAssets($userId), 2),
        ];

        // Narrative: Claude when available, local composer otherwise.
        $aiUsed = false;
        $narrative = null;
        $recommendations = null;
        if (!empty($this->apiKey) && $this->apiKey !== 'sk-ant-dummy') {
            $system = 'أنت محلل مالي محترف تكتب تقارير شهرية بالعربية الفصحى المبسطة للأشخاص العاديين.';
            $prompt = "التقرير الشهري如下 (بيانات فعلية):\n" . json_encode($report, JSON_UNESCAPED_UNICODE)
                . "\n\nأعد JSON بالهيكل:\n{\"narrative\": \"سرد من 3-5 جمل يلخّص الشهر بالأرقام\", \"recommendations\": [\"توصية عملية 1 بأرقام محددة\", \"...2\", \"...3\"]}";
            $ai = $this->callAI($system, $prompt);
            if (empty($ai['note']) && is_array($ai)) {
                $n = $ai['narrative'] ?? null;
                $r = $ai['recommendations'] ?? null;
                if (is_string($n) && trim($n) !== '' && is_array($r) && count($r) >= 3) {
                    $aiUsed = true;
                    $narrative = trim($n);
                    $recommendations = array_slice(array_map('strval', $r), 0, 3);
                }
            }
        }
        if ($narrative === null) {
            $narrative = $this->localReportNarrative($report);
        }
        if ($recommendations === null) {
            $recommendations = $this->localRecommendations($report);
        }

        $report['narrative'] = $narrative;
        $report['recommendations'] = $recommendations;
        $report['ai_used'] = $aiUsed;
        $report['generated_at'] = date('c');

        return $report;
    }

    /** Deterministic Arabic narrative built from the report numbers. */
    private function localReportNarrative(array $r): string
    {
        $s = $r['summary'];
        $parts = [];
        $parts[] = sprintf(
            'في %s سجّلت دخلاً بقيمة %s دج وتخطياً بقيمة %s دج، أي %s بقيمة %s دج%s.',
            $r['period_label'],
            number_format($s['income'], 0, '.', ' '),
            number_format($s['expenses'], 0, '.', ' '),
            $s['net'] >= 0 ? 'فائض' : 'عجز',
            number_format(abs($s['net']), 0, '.', ' '),
            $s['income'] > 0 ? ' (معدل ادخار ' . $s['savings_rate'] . '%)' : ''
        );

        $incomeDelta = $r['vs_last_month']['income'];
        $expenseDelta = $r['vs_last_month']['expenses'];
        $parts[] = sprintf(
            'مقارنة بـ%s: الدخل %s %s%% والإنفاق %s %s%%.',
            $r['vs_last_month']['label'],
            $incomeDelta['value'] >= 0 ? 'ارتفع' : 'انخفض',
            abs($incomeDelta['percent']),
            $expenseDelta['value'] >= 0 ? 'ارتفع' : 'انخفض',
            abs($expenseDelta['percent'])
        );

        if (!empty($r['categories'])) {
            $top = $r['categories'][0];
            $parts[] = sprintf(
                'أكبر فئة إنفاق كانت «%s %s» بـ %s دج (%s%% من الإنفاق).',
                $top['icon'] ?? '',
                $top['name'],
                number_format($top['total'], 0, '.', ' '),
                $top['percent']
            );
        } elseif ($s['transactions'] === 0) {
            $parts[] = 'لم تُسجَّل أي عملية خلال هذا الشهر.';
        }

        if ($s['borrowed'] > 0 || $s['repaid'] > 0) {
            $parts[] = sprintf(
                'حركة الديون: استلفت %s دج وسددت %s دج.',
                number_format($s['borrowed'], 0, '.', ' '),
                number_format($s['repaid'], 0, '.', ' ')
            );
        }

        $parts[] = sprintf('رصيدك الإجمالي الحالي %s دج.', number_format($r['assets'], 0, '.', ' '));

        return implode(' ', $parts);
    }

    /**
     * Three concrete, numeric recommendations (rules over the report data).
     *
     * @return array<int, string>
     */
    private function localRecommendations(array $r): array
    {
        $s = $r['summary'];
        $recs = [];

        if ($s['transactions'] === 0) {
            $recs[] = 'لا توجد عمليات مسجّلة هذا الشهر — ابدأ بتسجيل دخلك ومصاريفك حتى يعمل التحليل والتنبيهات.';
        } elseif ($s['net'] < 0) {
            $top = $r['categories'][0] ?? null;
            $recs[] = sprintf(
                'إنفاقك تجاوز دخلك بمبلغ %s دج — قلّع أولاً من أكبر فئة إنفاق%s.',
                number_format(abs($s['net']), 0, '.', ' '),
                $top !== null ? sprintf(' «%s» (%s دج)', $top['name'], number_format($top['total'], 0, '.', ' ')) : ''
            );
        } elseif ($s['income'] > 0 && $s['savings_rate'] < 10) {
            $recs[] = sprintf(
                'معدل ادخارك %s%% فقط — ادّخر على الأقل %s دج شهرياً (10%% من دخلك).',
                $s['savings_rate'],
                number_format($s['income'] * 0.1, 0, '.', ' ')
            );
        } elseif ($s['net'] > 0) {
            $recs[] = sprintf(
                'فائض %s دج هذا الشهر — وجّه جزءاً منه (مثلاً %s دج) نحو هدف ادخاري أو سداد دين فائدة.',
                number_format($s['net'], 0, '.', ' '),
                number_format($s['net'] * 0.5, 0, '.', ' ')
            );
        }

        foreach ($r['budgets'] as $b) {
            if ($b['percent'] > 100) {
                $recs[] = sprintf(
                    'تجاوزت ميزانية «%s» بـ %s دج — راجع حدك أو عدّل الميزانية.',
                    $b['name'],
                    number_format($b['spent'] - $b['limit'], 0, '.', ' ')
                );
                break;
            }
        }

        if (count($r['categories']) > 0 && $r['categories'][0]['percent'] > 40) {
            $recs[] = sprintf(
                '%s%% من إنفاقك مركز في فئة واحدة («%s») — وسّع اقتصادك أو اضبط سقفها.',
                $r['categories'][0]['percent'],
                $r['categories'][0]['name']
            );
        }

        if ($s['borrowed'] > $s['repaid'] && $s['borrowed'] > 0) {
            $recs[] = sprintf(
                'استلفت %s دج مقابل %s دج مسدّدة — رتّب خطة تسديد قبل تراكم الالتزامات.',
                number_format($s['borrowed'], 0, '.', ' '),
                number_format($s['repaid'], 0, '.', ' ')
            );
        }

        // Always-true numeric fillers so the report ships exactly 3 items.
        $fillers = [
            sprintf('اجمع فواتيرك القادمة (30 يوم) في صفحة الفواتير لتفادي الغرامات — رصيدك %s دج.', number_format($r['assets'], 0, '.', ' ')),
            'فعّل معاملة متكررة للاشتراكات الثابتة حتى لا تنسى سدادها في موعدها.',
            'راجع سجل الديون أسبوعياً: «لقي» المستحق لك و«عليّ» المستحق للآخرين في صفحة الأشخاص والديون.',
        ];
        foreach ($fillers as $f) {
            if (count($recs) >= 3) {
                break;
            }
            $recs[] = $f;
        }

        return array_slice($recs, 0, 3);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Phase 4 — "هل أ semiclass؟" affordability consultation
    // ═════════════════════════════════════════════════════════════════════════

    /** Detect the affordability intent in (dialect) Arabic or English. */
    public function isAffordabilityQuestion(string $message): bool
    {
        $n = strtr($message, [
            'أ' => 'ا', 'إ' => 'ا', 'آ' => 'ا', 'ة' => 'ه', 'ى' => 'ي',
            '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4',
            '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
        ]);
        return (bool)preg_match(
            '/ semiclass|واش نقدر|واش راني|واش نكون|هل استطيع|هل يمكنني|نقدر نشري|نقدر نخلص|نقدر ندير|نقدر نعيش|عندي القدرة|can i afford|can afford/u',
            $n
        );
    }

    /**
     * Structured affordability check combining the 30-day forecast, the
     * emergency reserve, upcoming bills and debts. Pure local math — the
     * answer is numeric even with no AI key configured.
     */
    public function affordabilityAnalysis(int $userId, string $message): array
    {
        $this->forUser($userId);
        $target = $this->extractAmount($message); // optional purchase amount
        $db = \FinanceHub\Config\Database::getConnection();
        $assets = round(Wallet::getTotalAssets($userId), 2);

        // Average monthly spending over the last 90 days (reserve target = 3×).
        $stmt = $db->prepare(
            "SELECT COALESCE(SUM(amount),0)/3 AS avg_month
             FROM actions WHERE user_id = ? AND type = 'withdraw'
             AND date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)"
        );
        $stmt->execute([$userId]);
        $monthlyExpenses = round((float)$stmt->fetch()['avg_month'], 2);
        $reserveTarget = round($monthlyExpenses * 3, 2);

        $forecast = $this->generateForecast($userId);
        $projected30 = $assets;
        if (!empty($forecast['forecast'])) {
            $projected30 = round((float)end($forecast['forecast'])['projected_balance'], 2);
        }
        $bills30 = round((float)$forecast['upcoming_bills'], 2);
        $avgDailyNet = round((float)$forecast['avg_daily_net'], 2);

        // Debt instalments falling due within 30 days.
        $stmt = $db->prepare(
            "SELECT COALESCE(SUM(GREATEST(d.amount - COALESCE((
                        SELECT SUM(p.amount) FROM debt_payments p WHERE p.debt_id = d.id
                    ), 0), 0)), 0)
             FROM debts d
             WHERE d.user_id = ? AND d.direction = 'borrowed_from'
               AND d.due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)"
        );
        $stmt->execute([$userId]);
        $debtsDue30 = round((float)$stmt->fetchColumn(), 2);

        $stmt = $db->prepare(
            "SELECT COALESCE(SUM(GREATEST(d.amount - COALESCE((
                        SELECT SUM(p.amount) FROM debt_payments p WHERE p.debt_id = d.id
                    ), 0), 0)), 0)
             FROM debts d WHERE d.user_id = ? AND d.direction = 'borrowed_from'"
        );
        $stmt->execute([$userId]);
        $liabilities = round((float)$stmt->fetchColumn(), 2);

        $liquid = $target !== null ? round($assets - $target, 2) : $assets;
        $projectedAfter = round($projected30 - ($target ?? 0), 2);
        $obligations30 = round($bills30 + $debtsDue30, 2);

        $checks = [
            [
                'key' => 'reserve',
                'label' => 'الاحتياطي الطارئ (3 أشهر مصروف)',
                'passed' => $monthlyExpenses > 0 ? $liquid >= $reserveTarget : true,
                'detail' => $monthlyExpenses > 0
                    ? sprintf('المتاح %s دج من أصل %s دج', number_format($liquid, 0, '.', ' '), number_format($reserveTarget, 0, '.', ' '))
                    : 'لا بيانات إنفاق كافية (90 يوم) لقياس الاحتياطي',
            ],
            [
                'key' => 'runway',
                'label' => 'الرصيد المتوقع بعد 30 يوم',
                'passed' => $projectedAfter > 0,
                'detail' => sprintf(
                    '%s دج%s',
                    number_format($projectedAfter, 0, '.', ' '),
                    !empty($forecast['estimated_depletion_date'])
                        ? ' — يُتوقع نفاد الرصيد في ' . $forecast['estimated_depletion_date'] : ''
                ),
            ],
            [
                'key' => 'obligations',
                'label' => 'الفواتير والديون خلال 30 يوم',
                'passed' => $obligations30 <= max(0, $liquid),
                'detail' => sprintf(
                    '%s دج مستحقة (فواتير %s + أقساط %s) مقابل %s دج متاحة',
                    number_format($obligations30, 0, '.', ' '),
                    number_format($bills30, 0, '.', ' '),
                    number_format($debtsDue30, 0, '.', ' '),
                    number_format(max(0, $liquid), 0, '.', ' ')
                ),
            ],
        ];

        $failedRunway = !$checks[1]['passed'];
        $failedObligations = !$checks[2]['passed'];
        $failedReserve = !$checks[0]['passed'];
        $verdict = ($failedRunway || $failedObligations) ? 'no' : ($failedReserve ? 'caution' : 'yes');

        return [
            'question' => trim($message),
            'target_amount' => $target,
            'verdict' => $verdict,
            'verdict_label' => $verdict === 'yes' ? 'نعم' : ($verdict === 'caution' ? 'بحسب الاحتياطي' : 'لا'),
            'assets' => $assets,
            'liquid_after' => $liquid,
            'monthly_expenses' => $monthlyExpenses,
            'reserve_target' => $reserveTarget,
            'avg_daily_net' => $avgDailyNet,
            'projected_30d' => $projectedAfter,
            'obligations_30d' => $obligations30,
            'liabilities' => $liabilities,
            'checks' => $checks,
        ];
    }

    /** Render the affordability analysis as a readable chat answer. */
    public function formatAffordabilityText(array $a): string
    {
        $lines = [];
        $lines[] = '💡 استشارة «هل أ semiclass؟»'
            . ($a['target_amount'] !== null
                ? ' — المبلغ المقصود: ' . number_format($a['target_amount'], 0, '.', ' ') . ' دج'
                : '');
        $lines[] = '';
        $lines[] = 'الإجابة: **' . $a['verdict_label'] . '**';
        $lines[] = '';
        $lines[] = sprintf(
            '• المركز: أصولك %s دج%s',
            number_format($a['assets'], 0, '.', ' '),
            $a['target_amount'] !== null
                ? '، وبعد الشراء يبقى ' . number_format($a['liquid_after'], 0, '.', ' ') . ' دج' : ''
        );
        foreach ($a['checks'] as $c) {
            $lines[] = sprintf('• %s %s — %s', $c['passed'] ? '✓' : '✗', $c['label'], $c['detail']);
        }
        $lines[] = sprintf(
            '• صافي التدفق اليومي: %s دج · الالتزامات الكلية عليك: %s دج',
            number_format($a['avg_daily_net'], 0, '.', ' '),
            number_format($a['liabilities'], 0, '.', ' ')
        );

        if ($a['verdict'] === 'no') {
            $lines[] = '';
            $lines[] = 'التوصية: أجّل الشراء حتى تتحسن إحدى النقط المعلّمة ✗ أعلاه.';
        } elseif ($a['verdict'] === 'caution') {
            $lines[] = '';
            $lines[] = 'التوصية: الشراء ممكن، لكن احتفظ بالاحتياطي — قلّل المبلغ أو ادّخر ' .
                number_format(max(0, $a['reserve_target'] - $a['liquid_after']), 0, '.', ' ') . ' دج أولاً.';
        } else {
            $lines[] = '';
            $lines[] = 'التوصية: الوضع يسمح — تأكد من بقاء الفواتير القادمة مغطاة بعد الشراء.';
        }

        return implode("\n", $lines);
    }

    /**
     * Dispatch to the configured provider.
     */
    private function callAI(string $systemPrompt, string $userMessage): array
    {
        if (empty($this->apiKey)) {
            return $this->fallbackResponse($systemPrompt, $userMessage);
        }

        if ($this->provider === 'anthropic') {
            return $this->callAnthropic($systemPrompt, $userMessage);
        }
        return $this->callOpenAI($systemPrompt, $userMessage);
    }

    /**
     * Call OpenAI / OpenAI-compatible API (chat completions).
     */
    private function callOpenAI(string $systemPrompt, string $userMessage): array
    {
        $baseUrl = $this->baseUrl;
        if ($baseUrl === null || $baseUrl === '') {
            if ($this->provider === 'openai') {
                $baseUrl = 'https://api.openai.com/v1';
            } elseif ($this->provider === 'groq') {
                $baseUrl = 'https://api.groq.com/openai/v1';
            } else {
                return $this->errorResponse($systemPrompt, $userMessage);
            }
        }
        $baseUrl = rtrim($baseUrl, '/');
        $url = $baseUrl . '/chat/completions';

        $payload = [
            'model' => $this->model,
            'max_tokens' => 4096,
            'messages' => [
                ['role' => 'system', 'content' => $systemPrompt],
                ['role' => 'user', 'content' => $userMessage],
            ],
        ];

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $this->apiKey,
            ],
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 60,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($httpCode !== 200) {
            $this->logApiError($httpCode, is_string($response) ? $response : (string)$curlError);
            return $this->errorResponse($systemPrompt, $userMessage, $httpCode, is_string($response) ? $response : (string)$curlError);
        }

        $result = json_decode((string)$response, true);
        if (!is_array($result)) {
            $this->logApiError($httpCode, 'Invalid JSON in OpenAI response');
            return $this->errorResponse($systemPrompt, $userMessage);
        }

        $content = $result['choices'][0]['message']['content'] ?? '';
        if (!is_string($content) || trim($content) === '') {
            $this->logApiError($httpCode, 'Empty content in OpenAI response');
            return $this->errorResponse($systemPrompt, $userMessage);
        }

        $json = $this->extractJson($content);
        if ($json !== null) {
            if (!isset($json['response']) && isset($json['raw'])) {
                $json['response'] = $json['raw'];
            }
            if (!isset($json['response'])) {
                $json['response'] = $content;
            }
            return $json;
        }

        return ['response' => $content, 'raw' => $content];
    }

    /**
     * Call Claude API
     */
    private function callAnthropic(string $systemPrompt, string $userMessage): array
    {
        if (empty($this->apiKey) || $this->apiKey === 'sk-ant-dummy') {
            return $this->errorResponse($systemPrompt, $userMessage);
        }

        $url = 'https://api.anthropic.com/v1/messages';

        $payload = [
            'model' => $this->model,
            'max_tokens' => 4096,
            'system' => $systemPrompt,
            'messages' => [
                ['role' => 'user', 'content' => $userMessage],
            ],
        ];

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'x-api-key: ' . $this->apiKey,
                'anthropic-version: 2023-06-01',
            ],
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 60,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($httpCode !== 200) {
            $this->logApiError($httpCode, is_string($response) ? $response : (string)$curlError);
            return $this->errorResponse($systemPrompt, $userMessage, $httpCode, is_string($response) ? $response : (string)$curlError);
        }

        $result = json_decode((string)$response, true);
        if (!is_array($result)) {
            $this->logApiError($httpCode, 'Invalid JSON in Anthropic response');
            return $this->errorResponse($systemPrompt, $userMessage);
        }

        $content = $result['content'][0]['text'] ?? '';
        if (!is_string($content) || trim($content) === '') {
            $this->logApiError($httpCode, 'Empty content in Anthropic response');
            return $this->errorResponse($systemPrompt, $userMessage);
        }

        $json = $this->extractJson($content);
        if ($json !== null) {
            if (!isset($json['response']) && isset($json['raw'])) {
                $json['response'] = $json['raw'];
            }
            if (!isset($json['response'])) {
                $json['response'] = $content;
            }
            return $json;
        }

        return ['response' => $content, 'raw' => $content];
    }

    /**
     * Append an AI API failure to the app log (never exposes the API key).
     */
    private function logApiError(int $httpCode, string $detail): void
    {
        $dir = dirname(__DIR__, 2) . '/storage/logs';
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        $line = sprintf(
            "[%s] %s API error (HTTP %d): %s\n",
            date('Y-m-d H:i:s'),
            ucfirst($this->provider),
            $httpCode,
            mb_substr(preg_replace('/\s+/', ' ', $detail) ?? $detail, 0, 1000)
        );
        @file_put_contents($dir . '/ai.log', $line, FILE_APPEND | LOCK_EX);
    }

    /**
     * Fallback when API key is not set
     */
    private function fallbackResponse(string $systemPrompt, string $userMessage): array
    {
        return [
            'response' => '🧠 المستشار المالي الذكي غير متصل حالياً. يرجى ضبط مفتاح API لمزود الذكاء الاصطناعي من صفحة الإعدادات (Anthropic/OpenAI/...) للاستفادة من التحليل الذكي والاقتراحات.',
            'note' => 'AI service requires an API key configuration',
            'raw' => $userMessage,
        ];
    }

    /**
     * Returned when an API key IS configured but the call failed.
     */
    private function errorResponse(string $systemPrompt, string $userMessage, int $httpCode = 0, string $detail = ''): array
    {
        $hint = 'تحقق من صحة المفتاح، المزود، وBase URL في الإعدادات.';
        if ($httpCode > 0) {
            $hint = "HTTP $httpCode. " . $hint;
        }
        // Try to extract a readable error message from the provider's JSON.
        $decoded = json_decode($detail, true);
        $provMsg = null;
        if (is_array($decoded)) {
            $provMsg = $decoded['error']['message'] ?? $decoded['message'] ?? $decoded['error'] ?? null;
        }
        if (is_string($provMsg) && $provMsg !== '') {
            $hint .= ' تفاصيل: ' . mb_substr($provMsg, 0, 160);
        }
        return [
            'response' => '⚠️ تعذر الاتصال بمزود الذكاء الاصطناعي. ' . $hint,
            'note' => 'AI provider call failed',
            'raw' => $userMessage,
        ];
    }

    /**
     * Extract JSON from text response
     */
    private function extractJson(string $text): ?array
    {
        $text = trim($text);
        if (str_starts_with($text, '{') || str_starts_with($text, '[')) {
            $decoded = json_decode($text, true);
            if (json_last_error() === JSON_ERROR_NONE) {
                return $decoded;
            }
        }

        preg_match('/```(?:json)?\s*([\s\S]*?)```/', $text, $matches);
        if (!empty($matches[1])) {
            $decoded = json_decode(trim($matches[1]), true);
            if (json_last_error() === JSON_ERROR_NONE) {
                return $decoded;
            }
        }

        preg_match('/\{[\s\S]*\}/', $text, $matches);
        if (!empty($matches[0])) {
            $decoded = json_decode($matches[0], true);
            if (json_last_error() === JSON_ERROR_NONE) {
                return $decoded;
            }
        }

        return null;
    }
}
