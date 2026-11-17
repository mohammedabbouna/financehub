<?php

namespace FinanceHub\Services;

use FinanceHub\Config\Database;
use FinanceHub\Models\Anomaly;
use FinanceHub\Models\Budget;
use FinanceHub\Models\HealthScore;
use FinanceHub\Models\Notification;
use FinanceHub\Models\RecurringTransaction;

/**
 * Background jobs executed by bin/worker.php on a cron schedule.
 *
 * Every task is idempotent: notifications dedupe through ref_key, health
 * snapshots persist at most one row per day, and anomalies only record
 * actions that have no anomaly row yet — so overlapping or repeated runs
 * never produce duplicates.
 */
class WorkerService
{
    /** @return array<string, mixed> per-task counters for the log line */
    public function runAll(): array
    {
        return [
            'recurring' => $this->generateRecurring(),
            'bills' => $this->billReminders(),
            'budgets' => $this->budgetWarnings(),
            'debts' => $this->debtDue(),
            'anomalies' => $this->anomalyScan(),
            'health' => $this->healthRecalc(),
            'gold' => $this->goldPrice(),
            'investments' => $this->investmentPrices(),
            'report_alert' => $this->monthlyReportAlert(),
            'push' => $this->pushNotifications(),
            'pruned' => Notification::pruneRead(60),
        ];
    }

    // ─── Gold price ───────────────────────────────────────────────────────────

    /**
     * Refresh today's gold price (one row per day — repeated runs within the
     * same day are a no-op thanks to the cache in GoldPriceService).
     */
    public function goldPrice(): bool
    {
        $price = new GoldPriceService();
        $current = $price->currentPrice();
        return $current !== null && !$current['is_stale'];
    }

    // ─── Recurring transactions ───────────────────────────────────────────────

    /**
     * Generate every due recurring transaction (next_run_date <= today).
     *
     * @return array{generated: int, failed: int}
     */
    public function generateRecurring(): array
    {
        $generated = 0;
        $failed = 0;

        foreach (RecurringTransaction::findDue() as $recurring) {
            $result = RecurringExecutor::execute($recurring);
            if ($result['error'] !== null) {
                $failed++;
                // The schedule is NOT advanced on failure, so the next pass
                // retries — the ref_key keeps the alert to one per due date.
                Notification::createUnique([
                    'user_id' => (int)$recurring['user_id'],
                    'type' => 'recurring_failed',
                    'title' => 'تعذر توليد عملية متكررة',
                    'body' => "«{$recurring['name']}»: {$result['error']}",
                    'link' => '/recurring',
                    'ref_key' => 'recurring_fail:' . $recurring['id'] . ':' . $recurring['next_run_date'],
                ]);
            } else {
                $generated++;
            }
        }

        return ['generated' => $generated, 'failed' => $failed];
    }

    // ─── Bill reminders ───────────────────────────────────────────────────────

    /** Unpaid bills inside their reminder window (past-due included). */
    public function billReminders(): int
    {
        $stmt = Database::getConnection()->prepare(
            "SELECT b.*, c.name as category_name
             FROM bills b
             LEFT JOIN categories c ON b.category_id = c.id
             WHERE b.is_paid = FALSE
               AND b.due_date <= DATE_ADD(CURDATE(), INTERVAL b.reminder_days_before DAY)"
        );
        $stmt->execute();

        $count = 0;
        $today = new \DateTimeImmutable('today');

        foreach ($stmt->fetchAll() as $bill) {
            $due = new \DateTimeImmutable((string)$bill['due_date']);
            $days = (int)$today->diff($due)->days * ($due < $today ? -1 : 1);
            $overdue = $days < 0;

            $id = Notification::createUnique([
                'user_id' => (int)$bill['user_id'],
                'type' => $overdue ? 'bill_overdue' : 'bill_due',
                'title' => $overdue ? 'فاتورة متأخرة' : 'فاتورة مستحقة قريباً',
                'body' => $overdue
                    ? "«{$bill['name']}» بمبلغ " . number_format((float)$bill['amount'], 2) . " دج متأخرة منذ " . abs($days) . " يوم."
                    : "«{$bill['name']}» بمبلغ " . number_format((float)$bill['amount'], 2) . " دج مستحقة خلال {$days} يوم.",
                'link' => '/bills',
                'ref_key' => 'bill:' . $bill['id'] . ':' . $bill['due_date'],
            ]);
            if ($id > 0) {
                $count++;
            }
        }

        return $count;
    }

    // ─── Budget warnings ──────────────────────────────────────────────────────

    /** Notify once per budget per month when spending reaches 80%. */
    public function budgetWarnings(): int
    {
        $count = 0;

        foreach ($this->allUserIds() as $userId) {
            foreach (Budget::findAllByUser($userId) as $budget) {
                $amount = (float)$budget['amount'];
                $spent = (float)$budget['spent'];
                if ($amount <= 0) {
                    continue;
                }

                $ratio = ($spent / $amount) * 100;
                if ($ratio < 80) {
                    continue;
                }

                $id = Notification::createUnique([
                    'user_id' => $userId,
                    'type' => $ratio >= 100 ? 'budget_exceeded' : 'budget_warning',
                    'title' => $ratio >= 100 ? 'تجاوزت الميزانية' : 'اقتربت من حد الميزانية',
                    'body' => "أنفقت " . number_format($spent, 2) . " من " . number_format($amount, 2)
                        . " دج على فئة «{$budget['category_name']}» (" . round($ratio) . "%).",
                    'link' => '/budgets',
                    'ref_key' => 'budget:' . $budget['id'] . ':' . date('Y-m'),
                ]);
                if ($id > 0) {
                    $count++;
                }
            }
        }

        return $count;
    }

    // ─── Debt due dates ───────────────────────────────────────────────────────

    /** Open debts due within 3 days (or already past due). */
    public function debtDue(): int
    {
        $stmt = Database::getConnection()->prepare(
            "SELECT d.id, d.user_id, d.amount, d.due_date, d.direction, c.name as contact_name,
                    GREATEST(d.amount - COALESCE((
                        SELECT SUM(p.amount) FROM debt_payments p WHERE p.debt_id = d.id
                    ), 0), 0) as remaining
             FROM debts d
             JOIN contacts c ON d.contact_id = c.id
             WHERE d.due_date IS NOT NULL
               AND d.due_date <= DATE_ADD(CURDATE(), INTERVAL 3 DAY)
               AND GREATEST(d.amount - COALESCE((
                   SELECT SUM(p.amount) FROM debt_payments p WHERE p.debt_id = d.id
               ), 0), 0) > 0"
        );
        $stmt->execute();

        $count = 0;
        $today = new \DateTimeImmutable('today');

        foreach ($stmt->fetchAll() as $debt) {
            $due = new \DateTimeImmutable((string)$debt['due_date']);
            $days = (int)$today->diff($due)->days * ($due < $today ? -1 : 1);
            $contactName = (string)$debt['contact_name'];
            $amount = number_format((float)$debt['remaining'], 2);

            $body = $days < 0
                ? ($debt['direction'] === 'lent_to'
                    ? "لم يُسدَّد دَينك لدى {$contactName} ({$amount} دج) منذ " . abs($days) . " يوم."
                    : "دَينك على {$contactName} ({$amount} دج) متأخر منذ " . abs($days) . " يوم.")
                : ($debt['direction'] === 'lent_to'
                    ? "استحقاق سلفتك من {$contactName} ({$amount} دج) بعد {$days} يوم."
                    : "موعد سداد دَينك لـ{$contactName} ({$amount} دج) بعد {$days} يوم.");

            $id = Notification::createUnique([
                'user_id' => (int)$debt['user_id'],
                'type' => $days < 0 ? 'debt_overdue' : 'debt_due',
                'title' => $days < 0 ? 'دَين متأخر' : 'استحقاق دَين قريباً',
                'body' => $body,
                'link' => '/contacts',
                'ref_key' => 'debt:' . $debt['id'] . ':' . $debt['due_date'],
            ]);
            if ($id > 0) {
                $count++;
            }
        }

        return $count;
    }

    // ─── Anomaly detection safety net ─────────────────────────────────────────

    /**
     * ActionController already checks every new action live; this scan picks
     * up anything that slipped through (e.g. rows written by the recurring
     * generator) within the last 24 hours.
     */
    public function anomalyScan(): int
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT a.* FROM actions a
             LEFT JOIN anomalies an ON an.action_id = a.id
             WHERE an.id IS NULL AND a.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
             ORDER BY a.id DESC
             LIMIT 200'
        );
        $stmt->execute();

        $ai = new AIAdvisorService();
        $count = 0;

        foreach ($stmt->fetchAll() as $action) {
            $anomaly = $ai->detectAnomaly((int)$action['user_id'], $action);
            if (!$anomaly) {
                continue;
            }

            $anomaly['action_id'] = (int)$action['id'];
            $anomaly['user_id'] = (int)$action['user_id'];
            Anomaly::create($anomaly);

            Notification::createUnique([
                'user_id' => (int)$action['user_id'],
                'type' => 'anomaly',
                'title' => 'عملية استثنائية مكتشفة',
                'body' => mb_substr((string)$anomaly['reason'], 0, 500),
                'link' => '/insights',
                'ref_key' => 'anomaly:' . $action['id'],
            ]);
            $count++;
        }

        return $count;
    }

    // ─── Financial health ─────────────────────────────────────────────────────

    /** Persist one health snapshot per user per day (skips if already done). */
    public function healthRecalc(): int
    {
        $ai = new AIAdvisorService();
        $count = 0;

        foreach ($this->allUserIds() as $userId) {
            if (HealthScore::existsToday($userId)) {
                continue;
            }
            $result = $ai->calculateHealthScore($userId);
            HealthScore::persist($userId, $result);
            $count++;
        }

        return $count;
    }

    // ─── Push notifications ───────────────────────────────────────────────────

    /**
     * Send unread notifications to subscribed browsers via Web Push (VAPID).
     * Marks each notification pushed_at so it is never sent twice.
     */
    public function pushNotifications(): int
    {
        $publicKey = (string)($_ENV['VAPID_PUBLIC_KEY'] ?? '');
        $privateKey = (string)($_ENV['VAPID_PRIVATE_KEY'] ?? '');
        $subject = (string)($_ENV['VAPID_SUBJECT'] ?? 'mailto:admin@financehub.dz');
        if ($publicKey === '' || $privateKey === '') {
            return 0;
        }
        if (!class_exists('\\Minishlink\\WebPush\\WebPush')) {
            return 0;
        }

        $db = Database::getConnection();
        $rows = $db->query(
            "SELECT n.id, n.user_id, n.type, n.title, n.body, n.link,
                    ps.endpoint, ps.p256dh, ps.auth
             FROM notifications n
             JOIN push_subscriptions ps ON ps.user_id = n.user_id
             WHERE n.pushed_at IS NULL
             ORDER BY n.id ASC
             LIMIT 100"
        )->fetchAll();

        if ($rows === []) {
            return 0;
        }

        $auth = ['VAPID' => ['subject' => $subject, 'publicKey' => $publicKey, 'privateKey' => $privateKey]];
        $webPush = new \Minishlink\WebPush\WebPush($auth);
        foreach ($rows as $row) {
            $subscription = \Minishlink\WebPush\Subscription::create([
                'endpoint' => $row['endpoint'],
                'publicKey' => $row['p256dh'],
                'authToken' => $row['auth'],
            ]);
            $payload = json_encode([
                'title' => $row['title'],
                'body' => $row['body'],
                'url' => $row['link'] ?: '/dashboard',
            ], JSON_UNESCAPED_UNICODE);
            $webPush->queueNotification($subscription, $payload);
        }

        foreach ($webPush->flush() as $report) {
            if ($report->isSubscriptionExpired()) {
                $db->prepare('DELETE FROM push_subscriptions WHERE endpoint = ?')
                    ->execute([$report->getEndpoint()]);
            }
        }

        $ids = array_unique(array_map(static fn (array $r): int => (int)$r['id'], $rows));
        if ($ids !== []) {
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $db->prepare("UPDATE notifications SET pushed_at = NOW() WHERE id IN ($placeholders)")
                ->execute($ids);
        }

        return count($rows);
    }

    // ─── Investment prices ─────────────────────────────────────────────────────

    public function investmentPrices(): int
    {
        $provider = new PriceProvider();
        $rows = Database::getConnection()->query(
            "SELECT id, asset_type, ticker FROM investments WHERE ticker IS NOT NULL AND ticker <> ''"
        )->fetchAll();
        $updated = 0;
        foreach ($rows as $r) {
            $price = $provider->fetch((string)$r['asset_type'], (string)$r['ticker']);
            if ($price !== null) {
                \FinanceHub\Models\Investment::updatePrice((int)$r['id'], $price);
                $updated++;
            }
        }
        return $updated;
    }

    /** @return array<int, int> */
    private function allUserIds(): array
    {
        $rows = Database::getConnection()->query('SELECT id FROM users')->fetchAll();
        return array_map(static fn (array $row): int => (int)$row['id'], $rows);
    }

    // ─── Monthly report alert ─────────────────────────────────────────────────

    /**
     * During the first 3 days of a month, notify each user that the previous
     * month's report is ready, with the headline numbers in the body.
     *
     * ref_key makes the notification one-per-user-per-month regardless of how
     * often cron fires in that window.
     */
    public function monthlyReportAlert(): int
    {
        if ((int)date('j') > 3) {
            return 0; // only the first 3 days of the month
        }

        $prevStart = date('Y-m-01', strtotime('first day of last month'));
        $prevEnd = date('Y-m-t', strtotime($prevStart));
        $prevLabel = self::MONTH_NAMES[(int)date('n', strtotime($prevStart))] . ' ' . date('Y', strtotime($prevStart));
        $reportYear = (int)date('Y', strtotime($prevStart));
        $reportMonth = (int)date('n', strtotime($prevStart));
        $db = Database::getConnection();
        $count = 0;

        foreach ($this->allUserIds() as $userId) {
            // One notification per user per month — and no alert for users
            // with nothing to report (fresh accounts).
            $stmt = $db->prepare(
                "SELECT COALESCE(SUM(CASE WHEN type = 'deposit' THEN amount END), 0) AS income,
                        COALESCE(SUM(CASE WHEN type = 'withdraw' THEN amount END), 0) AS expenses,
                        COUNT(*) AS cnt
                 FROM actions
                 WHERE user_id = ? AND date BETWEEN ? AND ? AND type IN ('deposit','withdraw')"
            );
            $stmt->execute([$userId, $prevStart, $prevEnd]);
            $row = $stmt->fetch();
            $income = (float)$row['income'];
            $expenses = (float)$row['expenses'];
            $cnt = (int)$row['cnt'];

            if ($cnt === 0) {
                continue;
            }

            $net = $income - $expenses;
            $id = Notification::createUnique([
                'user_id' => $userId,
                'type' => 'monthly_report',
                'title' => 'تقرير ' . $prevLabel . ' جاهز',
                'body' => sprintf(
                    'الدخل %s دج · الإنفاق %s دج · %s بقيمة %s دج (%d عملية).',
                    number_format($income, 0, '.', ' '),
                    number_format($expenses, 0, '.', ' '),
                    $net >= 0 ? 'فائض' : 'عجز',
                    number_format(abs($net), 0, '.', ' '),
                    $cnt
                ),
                'link' => "/reports/{$reportYear}/{$reportMonth}",
                'ref_key' => "monthly_report:{$reportYear}:{$reportMonth}",
            ]);
            if ($id > 0) {
                $count++;
            }
        }

        return $count;
    }

    /** Algerian month names, mirrored from AIAdvisorService for labels. */
    private const MONTH_NAMES = [
        1 => 'جانفي', 2 => 'فيفري', 3 => 'مارس', 4 => 'أفريل',
        5 => 'ماي', 6 => 'جوان', 7 => 'جويلية', 8 => 'أوت',
        9 => 'سبتمبر', 10 => 'أكتوبر', 11 => 'نوفمبر', 12 => 'ديسمبر',
    ];
}
