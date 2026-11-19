<?php

require __DIR__ . '/../vendor/autoload.php';

use Slim\Factory\AppFactory;
use FinanceHub\Middleware\AuthMiddleware;
use FinanceHub\Middleware\CorsMiddleware;
use FinanceHub\Controllers\AuthController;
use FinanceHub\Controllers\WalletController;
use FinanceHub\Controllers\ActionController;
use FinanceHub\Controllers\TransferController;
use FinanceHub\Controllers\BudgetController;
use FinanceHub\Controllers\GoalController;
use FinanceHub\Controllers\AIChatController;
use FinanceHub\Controllers\HealthController;
use FinanceHub\Controllers\InvestmentController;
use FinanceHub\Controllers\CalendarController;
use FinanceHub\Controllers\AuditController;
use FinanceHub\Controllers\BillController;
use FinanceHub\Controllers\ClientController;
use FinanceHub\Controllers\InvoiceController;
use FinanceHub\Controllers\AnnualReportController;
use FinanceHub\Controllers\AnomalyController;
use FinanceHub\Controllers\ForecastController;
use FinanceHub\Controllers\InsightController;
use FinanceHub\Controllers\CategoryController;
use FinanceHub\Controllers\ContactController;
use FinanceHub\Controllers\DebtController;
use FinanceHub\Controllers\NotificationController;
use FinanceHub\Controllers\RecurringController;
use FinanceHub\Controllers\AllocationController;
use FinanceHub\Controllers\ZakatController;
use FinanceHub\Controllers\TontineController;
use FinanceHub\Controllers\GoldController;
use FinanceHub\Controllers\PushController;
use FinanceHub\Controllers\ReconciliationController;
use FinanceHub\Controllers\ReportController;
use FinanceHub\Controllers\ImportExportController;
use FinanceHub\Exceptions\InsufficientBalanceException;

// Load environment variables
$envFile = __DIR__ . '/../.env';
if (file_exists($envFile)) {
    $dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->load();
} else {
    // Fallback to system env
    $envFile2 = __DIR__ . '/../../.env';
    if (file_exists($envFile2)) {
        $dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../..');
        $dotenv->load();
    }
}

$app = AppFactory::create();

// ─── Middleware ──────────────────────────────────────────────────────────────
// Slim middlewares run in reverse registration order (last added = outermost).
// CorsMiddleware MUST be the outermost one: preflight OPTIONS never reaches
// the router (it would 405 on method-less routes) and CORS headers must also
// decorate error responses — so it is registered after routing + error.
$app->addBodyParsingMiddleware();
$app->addRoutingMiddleware();

$errorMiddleware = $app->addErrorMiddleware(
    (bool)($_ENV['APP_DEBUG'] ?? false),
    true,
    true
);

$app->add(new CorsMiddleware());

// Custom error handler
$errorMiddleware->setDefaultErrorHandler(function (
    Psr\Http\Message\ServerRequestInterface $request,
    Throwable $exception,
    bool $displayErrorDetails,
    bool $logErrors,
    bool $logErrorDetails
) use ($app) {
    $response = $app->getResponseFactory()->createResponse();

    // PDOException::getCode() returns a SQLSTATE string (e.g. "23000") — never use it as HTTP status.
    $code = (int)$exception->getCode();
    if ($code < 400 || $code > 599) {
        $code = 500;
    }
    if ($exception instanceof InsufficientBalanceException) {
        $code = 400;
    } elseif ($exception instanceof \PDOException) {
        $sqlState = (string)$exception->getCode();
        if ($sqlState === '23000') {
            $code = 409;
        } elseif ($sqlState === '23505') {
            $code = 409;
        } elseif (str_starts_with($sqlState, '22')) {
            $code = 422;
        }
    }
    if ($exception instanceof \Slim\Exception\HttpNotFoundException) {
        $code = 404;
    } elseif ($exception instanceof \Slim\Exception\HttpMethodNotAllowedException) {
        $code = 405;
    }

    $defaultMessages = [
        400 => 'Bad Request',
        401 => 'Authentication required',
        404 => 'Not Found',
        405 => 'Method Not Allowed',
        409 => 'Conflict',
        422 => 'Validation failed',
        429 => 'Too many requests',
        500 => 'Internal Server Error',
    ];

    $message = $displayErrorDetails
        ? $exception->getMessage()
        : ($defaultMessages[$code] ?? 'Internal Server Error');

    $payload = [
        'error' => $message,
        'code' => $code,
    ];
    $response->getBody()->write(json_encode($payload, JSON_UNESCAPED_UNICODE));
    return $response->withStatus($code)->withHeader('Content-Type', 'application/json');
});

// ─── Rate Limiting Middleware Factory ─────────────────────────────────────────
function clientIp(Psr\Http\Message\ServerRequestInterface $request): string
{
    $params = $request->getServerParams();
    // nginx (our only trusted proxy) sets X-Forwarded-For; REMOTE_ADDR is then the proxy.
    $forwarded = $request->getHeaderLine('X-Forwarded-For');
    if ($forwarded !== '') {
        $first = trim(explode(',', $forwarded)[0]);
        if (filter_var($first, FILTER_VALIDATE_IP)) {
            return $first;
        }
    }
    $realIp = $request->getHeaderLine('X-Real-IP');
    if ($realIp !== '' && filter_var($realIp, FILTER_VALIDATE_IP)) {
        return $realIp;
    }
    return $params['REMOTE_ADDR'] ?? '127.0.0.1';
}

function rateLimitMiddleware(int $maxPerWindow, string $bucket, int $windowSeconds = 60): callable {
    return function (Psr\Http\Message\ServerRequestInterface $request, Psr\Http\Server\RequestHandlerInterface $handler) use ($maxPerWindow, $bucket, $windowSeconds) {
        $ip = clientIp($request);
        $key = 'ratelimit:' . $bucket . ':' . $ip;
        $cacheDir = __DIR__ . '/../storage/cache';
        if (!is_dir($cacheDir)) @mkdir($cacheDir, 0755, true);
        $cacheFile = $cacheDir . '/' . md5($key) . '.json';

        $fp = @fopen($cacheFile, 'c+');
        if ($fp !== false) {
            flock($fp, LOCK_EX);
            $raw = stream_get_contents($fp);
            $data = $raw !== '' && $raw !== false ? (json_decode($raw, true) ?? []) : [];
            $reset = (int)($data['reset'] ?? 0);
            $count = (int)($data['count'] ?? 0);
            if (time() > $reset) {
                $reset = time() + $windowSeconds;
                $count = 0;
            }
            $count++;
            ftruncate($fp, 0);
            rewind($fp);
            fwrite($fp, json_encode(['count' => $count, 'reset' => $reset]));
            fflush($fp);
            flock($fp, LOCK_UN);
            fclose($fp);

            // Purge stale counter files so the cache dir doesn't grow forever.
            if (random_int(1, 100) === 1) {
                foreach (glob($cacheDir . '/*.json') ?: [] as $stale) {
                    if (@filemtime($stale) < time() - max(3600, $windowSeconds * 2)) {
                        @unlink($stale);
                    }
                }
            }

            if ($count > $maxPerWindow) {
                $response = new \Slim\Psr7\Response();
                $response->getBody()->write(json_encode([
                    'error' => 'Too many requests. Please slow down.',
                    'code' => 429,
                ]));
                return $response
                    ->withStatus(429)
                    ->withHeader('Content-Type', 'application/json')
                    ->withHeader('Retry-After', (string)max(1, $reset - time()));
            }
        }

        return $handler->handle($request);
    };
}

$aiRateLimit = rateLimitMiddleware((int)($_ENV['AI_RATE_LIMIT_MINUTE'] ?? 10), 'ai', 60);
$aiDailyLimit = rateLimitMiddleware((int)($_ENV['AI_RATE_LIMIT_DAILY'] ?? 100), 'ai_daily', 86400);
$authRateLimit = rateLimitMiddleware((int)($_ENV['AUTH_RATE_LIMIT_MINUTE'] ?? 20), 'auth', 60);

// ─── Health Check ───────────────────────────────────────────────────────────
$app->get('/api/v1/health', function ($request, $response) {
    $payload = [
        'status' => 'ok',
        'version' => '1.0.0',
        'timestamp' => date('Y-m-d H:i:s'),
        'service' => 'FinanceHub API',
    ];
    $response->getBody()->write(json_encode($payload));
    return $response->withHeader('Content-Type', 'application/json');
});

// ─── Auth Routes ────────────────────────────────────────────────────────────
$authController = new AuthController();

$app->post('/api/v1/auth/register', [$authController, 'register'])->add($authRateLimit);
$app->post('/api/v1/auth/login', [$authController, 'login'])->add($authRateLimit);
$app->post('/api/v1/auth/refresh', [$authController, 'refresh'])->add($authRateLimit);
$app->post('/api/v1/auth/logout', [$authController, 'logout']);

// 2FA verification (public — uses challenge token)
$app->post('/api/v1/auth/2fa/verify', function ($request, $response) use ($authController) {
    return $authController->verify2fa($request, $response);
})->add($authRateLimit);

// Protected auth routes
$app->get('/api/v1/auth/me', function ($request, $response) use ($authController) {
    return $authController->me($request, $response);
})->add(new AuthMiddleware());
$app->get('/api/v1/auth/ai-key', function ($request, $response) use ($authController) {
    return $authController->getAiKey($request, $response);
})->add(new AuthMiddleware());
$app->put('/api/v1/auth/ai-key', function ($request, $response) use ($authController) {
    return $authController->setAiKey($request, $response);
})->add(new AuthMiddleware());
$app->get('/api/v1/auth/ai-models', function ($request, $response) use ($authController) {
    return $authController->listAiModels($request, $response);
})->add(new AuthMiddleware());

$app->get('/api/v1/auth/business-mode', function ($request, $response) use ($authController) {
    return $authController->getBusinessMode($request, $response);
})->add(new AuthMiddleware());
$app->put('/api/v1/auth/business-mode', function ($request, $response) use ($authController) {
    return $authController->setBusinessMode($request, $response);
})->add(new AuthMiddleware());

// 2FA management (protected)
$app->post('/api/v1/auth/2fa/setup', function ($request, $response) use ($authController) {
    return $authController->setup2fa($request, $response);
})->add(new AuthMiddleware());
$app->post('/api/v1/auth/2fa/verify-setup', function ($request, $response) use ($authController) {
    return $authController->verifySetup2fa($request, $response);
})->add(new AuthMiddleware());
$app->post('/api/v1/auth/2fa/disable', function ($request, $response) use ($authController) {
    return $authController->disable2fa($request, $response);
})->add(new AuthMiddleware());
$app->put('/api/v1/auth/profile', function ($request, $response) use ($authController) {
    return $authController->updateProfile($request, $response);
})->add(new AuthMiddleware());
$app->put('/api/v1/auth/password', function ($request, $response) use ($authController) {
    return $authController->changePassword($request, $response);
})->add(new AuthMiddleware())->add($authRateLimit);

// Public push VAPID key (no auth needed)
$app->get('/api/v1/push/vapid-public-key', function ($request, $response) {
    $ctrl = new PushController();
    return $ctrl->vapidPublicKey($request, $response);
});

// ─── Protected Routes ──────────────────────────────────────────────────────
$app->group('/api/v1', function ($group) use ($aiRateLimit, $aiDailyLimit) {
    // Categories
    $group->get('/categories', [CategoryController::class, 'index']);
    $group->post('/categories', [CategoryController::class, 'create']);
    $group->put('/categories/{id}', [CategoryController::class, 'update']);
    $group->delete('/categories/{id}', [CategoryController::class, 'delete']);

    // Push notifications
    $group->post('/push/subscribe', [PushController::class, 'subscribe']);
    $group->delete('/push/unsubscribe', [PushController::class, 'unsubscribe']);

    // Reconciliation (bank statement matching)
    $group->get('/reconciliation', [ReconciliationController::class, 'index']);
    $group->post('/reconciliation', [ReconciliationController::class, 'create']);
    $group->get('/reconciliation/{id}', [ReconciliationController::class, 'show']);
    $group->post('/reconciliation/{id}/auto-match', [ReconciliationController::class, 'autoMatchEndpoint']);
    $group->post('/reconciliation/{id}/match', [ReconciliationController::class, 'match']);
    $group->post('/reconciliation/{id}/ignore', [ReconciliationController::class, 'ignore']);
    $group->post('/reconciliation/{id}/create-action', [ReconciliationController::class, 'createAction']);
    $group->post('/reconciliation/{id}/complete', [ReconciliationController::class, 'complete']);
    $group->delete('/reconciliation/{id}', [ReconciliationController::class, 'delete']);

    // Clients & invoices (business mode)
    $group->get('/clients', [ClientController::class, 'index']);
    $group->post('/clients', [ClientController::class, 'create']);
    $group->get('/clients/{id}', [ClientController::class, 'show']);
    $group->put('/clients/{id}', [ClientController::class, 'update']);
    $group->delete('/clients/{id}', [ClientController::class, 'delete']);

    $group->get('/invoices', [InvoiceController::class, 'index']);
    $group->post('/invoices', [InvoiceController::class, 'create']);
    $group->get('/invoices/{id}', [InvoiceController::class, 'show']);
    $group->patch('/invoices/{id}/status', [InvoiceController::class, 'updateStatus']);
    $group->delete('/invoices/{id}', [InvoiceController::class, 'delete']);

    // Audit log
    $group->get('/audit', [AuditController::class, 'index']);
    $group->post('/contacts', [ContactController::class, 'create']);
    $group->get('/contacts/{id}', [ContactController::class, 'show']);
    $group->put('/contacts/{id}', [ContactController::class, 'update']);
    $group->delete('/contacts/{id}', [ContactController::class, 'delete']);

    // Debts & lending
    $group->get('/debts', [DebtController::class, 'index']);
    $group->get('/debts/summary', [DebtController::class, 'summary']);
    $group->post('/debts', [DebtController::class, 'create']);
    $group->get('/debts/{id}', [DebtController::class, 'show']);
    $group->put('/debts/{id}', [DebtController::class, 'update']);
    $group->delete('/debts/{id}', [DebtController::class, 'delete']);
    $group->post('/debts/{id}/payments', [DebtController::class, 'addPayment']);
    $group->delete('/debts/{id}/payments/{payment_id}', [DebtController::class, 'deletePayment']);

    // Notifications
    $group->get('/notifications', [NotificationController::class, 'index']);
    $group->get('/notifications/unread-count', [NotificationController::class, 'unreadCount']);
    $group->post('/notifications/read-all', [NotificationController::class, 'markAllRead']);
    $group->post('/notifications/{id}/read', [NotificationController::class, 'markRead']);

    // Recurring transactions (generated by the background worker)
    $group->get('/recurring', [RecurringController::class, 'index']);
    $group->post('/recurring', [RecurringController::class, 'create']);
    $group->put('/recurring/{id}', [RecurringController::class, 'update']);
    $group->patch('/recurring/{id}/toggle', [RecurringController::class, 'toggle']);
    $group->post('/recurring/{id}/run', [RecurringController::class, 'run']);
    $group->delete('/recurring/{id}', [RecurringController::class, 'delete']);

    // ─── Phase 3: Zakat ──────────────────────────────────────────────────────
    $group->get('/zakat/calculate', [ZakatController::class, 'calculate']);
    $group->get('/zakat/snapshots', [ZakatController::class, 'snapshots']);
    $group->post('/zakat/snapshots', [ZakatController::class, 'saveSnapshot']);

    // ─── Phase 3: Gold price ─────────────────────────────────────────────────
    $group->get('/gold/price', [GoldController::class, 'price']);
    $group->get('/gold/holdings', [GoldController::class, 'holdings']);

    // ─── Phase 3: Tontine (العمّارية) ────────────────────────────────────────
    $group->get('/tontines', [TontineController::class, 'index']);
    $group->post('/tontines', [TontineController::class, 'create']);
    $group->get('/tontines/{id}', [TontineController::class, 'show']);
    $group->put('/tontines/{id}', [TontineController::class, 'update']);
    $group->delete('/tontines/{id}', [TontineController::class, 'delete']);
    $group->post('/tontines/{id}/members', [TontineController::class, 'addMember']);
    $group->delete('/tontines/{id}/members/{member_id}', [TontineController::class, 'deleteMember']);
    $group->post('/tontines/{id}/payments', [TontineController::class, 'addPayment']);
    $group->delete('/tontines/{id}/payments/{payment_id}', [TontineController::class, 'deletePayment']);

    // Wallets
    $group->get('/wallets', [WalletController::class, 'index']);
    $group->get('/networth', [WalletController::class, 'netWorth']);
    $group->post('/wallets', [WalletController::class, 'create']);
    $group->get('/wallets/{id}', [WalletController::class, 'show']);
    $group->put('/wallets/{id}', [WalletController::class, 'update']);
    $group->patch('/wallets/{id}/archive', [WalletController::class, 'archive']);

    // Actions
    $group->get('/actions', [ActionController::class, 'index']);
    $group->get('/actions/duplicates', [ActionController::class, 'duplicates']);
    $group->post('/actions', [ActionController::class, 'create']);
    $group->get('/actions/{id}', [ActionController::class, 'show']);
    $group->put('/actions/{id}', [ActionController::class, 'update']);
    $group->post('/actions/parse-ai', [ActionController::class, 'parseAi'])->add($aiRateLimit)->add($aiDailyLimit);
    $group->post('/actions/parse-receipt', [ActionController::class, 'parseReceipt'])->add($aiRateLimit)->add($aiDailyLimit);

    // Transfers
    $group->post('/transfers', [TransferController::class, 'create']);

    // Budgets
    $group->get('/budgets', [BudgetController::class, 'index']);
    $group->post('/budgets', [BudgetController::class, 'create']);
    $group->get('/budgets/{id}', [BudgetController::class, 'show']);
    $group->put('/budgets/{id}', [BudgetController::class, 'update']);
    $group->post('/budgets/auto-suggest', [BudgetController::class, 'autoSuggest'])->add($aiRateLimit)->add($aiDailyLimit);

    // Goals
    $group->get('/goals', [GoalController::class, 'index']);
    $group->post('/goals', [GoalController::class, 'create']);
    $group->get('/goals/{id}', [GoalController::class, 'show']);
    $group->put('/goals/{id}', [GoalController::class, 'update']);
    $group->post('/goals/{id}/progress', [GoalController::class, 'updateProgress']);

    // Income Allocation
    $group->get('/allocations/rules', [AllocationController::class, 'getRules']);
    $group->post('/allocations/rules', [AllocationController::class, 'createRule']);
    $group->delete('/allocations/rules/{id}', [AllocationController::class, 'deleteRule']);
    $group->post('/allocations/propose', [AllocationController::class, 'proposeAllocation'])->add($aiRateLimit)->add($aiDailyLimit);
    $group->post('/allocations/{id}/approve', [AllocationController::class, 'approveAllocation']);
    $group->get('/allocations/logs', [AllocationController::class, 'logHistory']);

    // AI Chat
    $group->post('/ai/chat', [AIChatController::class, 'chat'])->add($aiRateLimit)->add($aiDailyLimit);
    $group->get('/ai/chat/history', [AIChatController::class, 'history']);
    $group->delete('/ai/chat/history', [AIChatController::class, 'clearHistory']);

    // Annual tax report (Algeria IRG) — must come before /reports/{year}/{month}
    $group->get('/reports/annual/{year}', [AnnualReportController::class, 'annual']);

    // Monthly report (التقرير الشهري)
    $group->get('/reports/{year}/{month}', [ReportController::class, 'monthly'])
        ->add($aiRateLimit)->add($aiDailyLimit);

    // CSV export / import (BOM for Arabic in Excel)
    $group->get('/export/actions', [ImportExportController::class, 'exportActions']);
    $group->post('/import/analyze', [ImportExportController::class, 'analyze']);
    $group->post('/import/commit', [ImportExportController::class, 'commit']);

    // Health Score
    $group->get('/health-score', [HealthController::class, 'index']);
    $group->get('/health-score/history', [HealthController::class, 'history']);

    // Investments
    $group->get('/investments', [InvestmentController::class, 'index']);
    $group->post('/investments', [InvestmentController::class, 'create']);
    $group->get('/investments/{id}', [InvestmentController::class, 'show']);
    $group->put('/investments/{id}', [InvestmentController::class, 'update']);
    $group->post('/investments/{id}/refresh-price', [InvestmentController::class, 'refreshPrice']);

    // Calendar
    $group->get('/calendar', [CalendarController::class, 'index']);

    // Bills
    $group->get('/bills', [BillController::class, 'index']);
    $group->post('/bills', [BillController::class, 'create']);
    $group->get('/bills/upcoming', [BillController::class, 'upcoming']);
    $group->get('/bills/{id}', [BillController::class, 'show']);
    $group->put('/bills/{id}', [BillController::class, 'update']);
    $group->post('/bills/{id}/pay', [BillController::class, 'markPaid']);

    // Anomalies
    $group->get('/anomalies', [AnomalyController::class, 'index']);
    $group->post('/anomalies/{id}/read', [AnomalyController::class, 'markRead']);

    // Forecast
    $group->get('/forecast', [ForecastController::class, 'index']);

    // Insights
    $group->get('/insights', [InsightController::class, 'index']);
    $group->post('/insights/generate', [InsightController::class, 'generate'])->add($aiRateLimit)->add($aiDailyLimit);
    $group->post('/insights/{id}/dismiss', [InsightController::class, 'dismiss']);
})->add(new AuthMiddleware());

// ─── Run ─────────────────────────────────────────────────────────────────────
$app->run();
