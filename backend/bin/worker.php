#!/usr/bin/env php
<?php

/**
 * FinanceHub background worker — invoked by cron (see worker/crontab).
 *
 * Usage:
 *   php bin/worker.php            # run every task
 *   php bin/worker.php recurring  # run a single task:
 *   php bin/worker.php bills|budgets|debts|anomalies|health|gold|investments|report|push
 *
 * Every task is idempotent (dedup keys / daily guards), so overlapping or
 * repeated runs are safe. Output is appended to storage/logs/worker.log.
 */

require __DIR__ . '/../vendor/autoload.php';

use FinanceHub\Services\WorkerService;

// Load environment variables (same fallback chain as public/index.php).
$envFile = __DIR__ . '/../.env';
if (file_exists($envFile)) {
    Dotenv\Dotenv::createImmutable(__DIR__ . '/..')->load();
} else {
    $envFile2 = __DIR__ . '/../../.env';
    if (file_exists($envFile2)) {
        Dotenv\Dotenv::createImmutable(__DIR__ . '/../..')->load();
    }
}

function workerLog(string $level, string $message): void
{
    $dir = __DIR__ . '/../storage/logs';
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    $line = sprintf(
        "[%s] [%s] %s%s",
        date('Y-m-d H:i:s'),
        $level,
        $message,
        PHP_EOL
    );
    @file_put_contents($dir . '/worker.log', $line, FILE_APPEND | LOCK_EX);
}

$task = $argv[1] ?? 'all';
$validTasks = ['all', 'recurring', 'bills', 'budgets', 'debts', 'anomalies', 'health', 'gold', 'investments', 'report', 'push'];

if (!in_array($task, $validTasks, true)) {
    workerLog('ERROR', "Unknown task '{$task}'. Valid: " . implode(', ', $validTasks));
    exit(2);
}

$started = microtime(true);

try {
    $worker = new WorkerService();

    $stats = match ($task) {
        'all' => $worker->runAll(),
        'recurring' => $worker->generateRecurring(),
        'bills' => ['created' => $worker->billReminders()],
        'budgets' => ['created' => $worker->budgetWarnings()],
        'debts' => ['created' => $worker->debtDue()],
        'anomalies' => ['created' => $worker->anomalyScan()],
        'health' => ['persisted' => $worker->healthRecalc()],
        'gold' => ['refreshed' => $worker->goldPrice()],
        'investments' => ['updated' => $worker->investmentPrices()],
        'report' => ['notified' => $worker->monthlyReportAlert()],
        'push' => ['pushed' => $worker->pushNotifications()],
    };

    $elapsed = round((microtime(true) - $started) * 1000);
    workerLog('INFO', "task={$task} " . json_encode($stats, JSON_UNESCAPED_UNICODE) . " ({$elapsed}ms)");
    exit(0);
} catch (Throwable $e) {
    workerLog('ERROR', "task={$task} failed: " . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    exit(1);
}
