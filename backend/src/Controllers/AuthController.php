<?php

namespace FinanceHub\Controllers;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use FinanceHub\Config\AppConfig;
use FinanceHub\Config\Database;
use FinanceHub\Models\User;
use FinanceHub\Services\TotpService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class AuthController
{
    public function register(Request $request, Response $response): Response
    {
        $data = $request->getParsedBody();

        if (empty($data['name']) || empty($data['email']) || empty($data['password'])) {
            return $this->json($response, ['error' => 'الاسم والبريد الإلكتروني وكلمة المرور مطلوبة'], 400);
        }

        if (!filter_var($data['email'], FILTER_VALIDATE_EMAIL)) {
            return $this->json($response, ['error' => 'البريد الإلكتروني غير صحيح'], 400);
        }

        if (strlen($data['password']) < 6) {
            return $this->json($response, ['error' => 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'], 400);
        }

        if (User::findByEmail($data['email'])) {
            return $this->json($response, ['error' => 'البريد الإلكتروني مسجل مسبقاً'], 409);
        }

        $passwordHash = password_hash($data['password'], PASSWORD_BCRYPT);
        $userId = User::create($data['name'], $data['email'], $passwordHash);

        $tokens = $this->generateTokens($userId, $data['name']);
        $this->storeRefreshToken($userId, $tokens['refresh_token']);

        return $this->json($response, [
            'message' => 'تم إنشاء الحساب بنجاح',
            'user' => ['id' => $userId, 'name' => $data['name'], 'email' => $data['email']],
            'tokens' => $tokens,
        ], 201);
    }

    public function login(Request $request, Response $response): Response
    {
        $data = $request->getParsedBody();

        if (empty($data['email']) || empty($data['password'])) {
            return $this->json($response, ['error' => 'البريد الإلكتروني وكلمة المرور مطلوبان'], 400);
        }

        $user = User::findByEmail($data['email']);
        if (!$user || !password_verify($data['password'], $user['password_hash'])) {
            return $this->json($response, ['error' => 'بريد إلكتروني أو كلمة مرور غير صحيحة'], 401);
        }

        // 2FA: if enabled, issue a short-lived challenge instead of tokens.
        if (User::isTotpEnabled((int)$user['id'])) {
            $challenge = $this->generateChallengeToken((int)$user['id']);
            return $this->json($response, [
                'requires_2fa' => true,
                'challenge' => $challenge,
                'user' => ['id' => $user['id'], 'name' => $user['name'], 'email' => $user['email']],
            ]);
        }

        $tokens = $this->generateTokens($user['id'], $user['name']);

        $this->storeRefreshToken($user['id'], $tokens['refresh_token']);

        return $this->json($response, [
            'user' => ['id' => $user['id'], 'name' => $user['name'], 'email' => $user['email']],
            'tokens' => $tokens,
        ]);
    }

    public function refresh(Request $request, Response $response): Response
    {
        $data = $request->getParsedBody();

        if (empty($data['refresh_token'])) {
            return $this->json($response, ['error' => 'Refresh token required'], 400);
        }

        try {
            $decoded = JWT::decode($data['refresh_token'], new Key(AppConfig::getJwtSecret(), 'HS256'));
        } catch (\Exception $e) {
            return $this->json($response, ['error' => 'Invalid refresh token'], 401);
        }

        if (($decoded->type ?? '') !== 'refresh') {
            return $this->json($response, ['error' => 'Invalid refresh token'], 401);
        }

        $tokenHash = hash('sha256', $data['refresh_token']);
        $stmt = Database::getConnection()->prepare(
            'SELECT * FROM refresh_tokens WHERE token_hash = ? AND user_id = ? AND expires_at > NOW()'
        );
        $stmt->execute([$tokenHash, $decoded->sub]);
        $stored = $stmt->fetch();

        if (!$stored) {
            return $this->json($response, ['error' => 'Refresh token expired or revoked'], 401);
        }

        Database::getConnection()->prepare('DELETE FROM refresh_tokens WHERE id = ?')->execute([$stored['id']]);

        $user = User::findById($decoded->sub);
        if (!$user) {
            return $this->json($response, ['error' => 'User not found'], 404);
        }

        $tokens = $this->generateTokens($user['id'], $user['name']);
        $this->storeRefreshToken($user['id'], $tokens['refresh_token']);

        return $this->json($response, ['tokens' => $tokens]);
    }

    public function logout(Request $request, Response $response): Response
    {
        $data = $request->getParsedBody();
        if (!empty($data['refresh_token'])) {
            $tokenHash = hash('sha256', $data['refresh_token']);
            $stmt = Database::getConnection()->prepare('DELETE FROM refresh_tokens WHERE token_hash = ?');
            $stmt->execute([$tokenHash]);
        }

        return $this->json($response, ['message' => 'تم تسجيل الخروج بنجاح']);
    }

    private function generateChallengeToken(int $userId): string
    {
        $now = time();
        $secret = AppConfig::getJwtSecret();
        $payload = [
            'iss' => 'financehub',
            'sub' => $userId,
            'type' => '2fa_challenge',
            'iat' => $now,
            'exp' => $now + 300,
        ];
        return JWT::encode($payload, $secret, 'HS256');
    }

    /** POST /auth/2fa/setup — generate secret + otpauth URI + recovery codes. */
    public function setup2fa(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $user = User::findById($userId);
        if (!$user) return $this->json($response, ['error' => 'User not found'], 404);

        $secret = TotpService::generateSecret();
        User::setTotpSecret($userId, $secret);
        // not enabled yet — needs verification
        User::setTotpEnabled($userId, false);

        // generate 8 recovery codes
        $codes = [];
        for ($i = 0; $i < 8; $i++) {
            $codes[] = strtoupper(bin2hex(random_bytes(4)));
        }
        User::setRecoveryCodes($userId, $codes);

        $uri = TotpService::otpauthUri($secret, $user['email']);
        return $this->json($response, [
            'secret' => $secret,
            'otpauth_uri' => $uri,
            'recovery_codes' => $codes,
            'message' => 'امسح رمز QR في تطبيق المصادقة، ثم أدخل الرمز للتفعيل',
        ]);
    }

    /** POST /auth/2fa/verify-setup — verify code, enable 2FA. */
    public function verifySetup2fa(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $data = $request->getParsedBody() ?: [];
        $code = (string)($data['code'] ?? '');
        $secret = User::getTotpSecret($userId);
        if ($secret === null) {
            return $this->json($response, ['error' => 'لم يتم إعداد 2FA'], 400);
        }
        if (!TotpService::verify($secret, $code)) {
            return $this->json($response, ['error' => 'رمز غير صحيح'], 401);
        }
        User::setTotpEnabled($userId, true);
        return $this->json($response, ['message' => 'تم تفعيل المصادقة الثنائية', 'recovery_codes' => User::getRecoveryCodes($userId)]);
    }

    /** POST /auth/2fa/verify — exchange challenge + code for real tokens. */
    public function verify2fa(Request $request, Response $response): Response
    {
        $data = $request->getParsedBody() ?: [];
        $challenge = $data['challenge'] ?? null;
        $code = (string)($data['code'] ?? '');
        if (!is_string($challenge) || $code === '') {
            return $this->json($response, ['error' => 'challenge و code مطلوبان'], 400);
        }
        try {
            $decoded = JWT::decode($challenge, new Key(AppConfig::getJwtSecret(), 'HS256'));
        } catch (\Exception $e) {
            return $this->json($response, ['error' => 'challenge غير صالح أو منتهي'], 401);
        }
        if (($decoded->type ?? '') !== '2fa_challenge') {
            return $this->json($response, ['error' => 'challenge غير صالح'], 401);
        }
        $userId = (int)$decoded->sub;
        $user = User::findById($userId);
        if (!$user) return $this->json($response, ['error' => 'User not found'], 404);

        $secret = User::getTotpSecret($userId);
        $recoveryCodes = User::getRecoveryCodes($userId);
        $valid = false;
        if ($secret !== null && TotpService::verify($secret, $code)) {
            $valid = true;
        } elseif (in_array(strtoupper($code), $recoveryCodes, true)) {
            $valid = true;
            // consume recovery code
            $remaining = array_values(array_filter($recoveryCodes, fn ($c) => strtoupper($code) !== $c));
            User::setRecoveryCodes($userId, $remaining);
        }
        if (!$valid) {
            return $this->json($response, ['error' => 'رمز غير صحيح'], 401);
        }

        $tokens = $this->generateTokens($userId, $user['name']);
        $this->storeRefreshToken($userId, $tokens['refresh_token']);
        return $this->json($response, [
            'user' => ['id' => $user['id'], 'name' => $user['name'], 'email' => $user['email']],
            'tokens' => $tokens,
        ]);
    }

    /** POST /auth/2fa/disable — disable 2FA (requires code). */
    public function disable2fa(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $data = $request->getParsedBody() ?: [];
        $code = (string)($data['code'] ?? '');
        $secret = User::getTotpSecret($userId);
        if ($secret === null || !User::isTotpEnabled($userId)) {
            return $this->json($response, ['error' => '2FA غير مفعّل'], 400);
        }
        if (!TotpService::verify($secret, $code)) {
            // allow recovery code
            $codes = User::getRecoveryCodes($userId);
            if (!in_array(strtoupper($code), $codes, true)) {
                return $this->json($response, ['error' => 'رمز غير صحيح'], 401);
            }
        }
        User::setTotpEnabled($userId, false);
        User::setTotpSecret($userId, null);
        User::setRecoveryCodes($userId, []);
        return $this->json($response, ['message' => 'تم تعطيل المصادقة الثنائية']);
    }

    public function me(Request $request, Response $response): Response
    {
        $userId = $request->getAttribute('user_id');
        $user = User::findById($userId);

        if (!$user) {
            return $this->json($response, ['error' => 'User not found'], 404);
        }

        return $this->json($response, ['user' => $user]);
    }

    /** GET /auth/ai-key — status + masked preview (never the full key). */
    public function getAiKey(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $key = User::getAiApiKey($userId);
        $provider = User::getAiProvider($userId);
        $baseUrl = User::getAiBaseUrl($userId);
        $model = User::getAiModel($userId);
        $envKey = AppConfig::getAnthropicApiKey();
        $source = 'none';
        if ($key !== null) {
            $source = 'user';
        } elseif ($envKey !== '' && $envKey !== 'sk-ant-dummy') {
            $source = 'env';
            if ($provider === 'anthropic') {
                $key = $envKey;
            }
        }
        $masked = null;
        $active = $key ?? ($envKey !== '' && $envKey !== 'sk-ant-dummy' && $provider === 'anthropic' ? $envKey : null);
        if ($active !== null) {
            $masked = substr($active, 0, 6) . str_repeat('•', max(4, strlen($active) - 10)) . substr($active, -4);
        }
        return $this->json($response, [
            'has_key' => User::getAiApiKey($userId) !== null,
            'masked' => $masked,
            'source' => $source,
            'ai_available' => $active !== null,
            'provider' => $provider,
            'base_url' => $baseUrl,
            'model' => $model,
        ]);
    }

    /** PUT /auth/ai-key — set provider/key/base_url/model. */
    public function setAiKey(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $data = $request->getParsedBody() ?: [];

        if (isset($data['provider'])) {
            User::setAiProvider($userId, (string)$data['provider']);
        }
        if (array_key_exists('base_url', $data)) {
            User::setAiBaseUrl($userId, $data['base_url'] === null ? null : (string)$data['base_url']);
        }
        if (array_key_exists('model', $data)) {
            User::setAiModel($userId, $data['model'] === null ? null : (string)$data['model']);
        }

        $key = $data['api_key'] ?? null;
        if ($key === null || $key === '') {
            // Only clear the key if explicitly requested via clear_key flag;
            // otherwise keep existing key (provider-only update).
            if (!empty($data['clear_key'])) {
                User::setAiApiKey($userId, null);
            }
            $provider = User::getAiProvider($userId);
            $activeKey = User::getAiApiKey($userId);
            if ($activeKey === null && $provider === 'anthropic') {
                $envKey = AppConfig::getAnthropicApiKey();
                if ($envKey !== '' && $envKey !== 'sk-ant-dummy') $activeKey = $envKey;
            }
            $masked = null;
            if ($activeKey !== null) {
                $masked = substr($activeKey, 0, 6) . str_repeat('•', max(4, strlen($activeKey) - 10)) . substr($activeKey, -4);
            }
            return $this->json($response, [
                'message' => 'تم حفظ الإعدادات',
                'has_key' => User::getAiApiKey($userId) !== null,
                'masked' => $masked,
                'source' => User::getAiApiKey($userId) !== null ? 'user' : (($provider === 'anthropic' && AppConfig::getAnthropicApiKey() !== '' && AppConfig::getAnthropicApiKey() !== 'sk-ant-dummy') ? 'env' : 'none'),
                'provider' => $provider,
                'base_url' => User::getAiBaseUrl($userId),
                'model' => User::getAiModel($userId),
            ]);
        }
        if (!is_string($key) || strlen(trim($key)) < 10) {
            return $this->json($response, ['error' => 'مفتاح API غير صالح (قصير جداً)'], 422);
        }
        $provider = User::getAiProvider($userId);
        // Provider-specific key prefix checks (best-effort)
        if ($provider === 'anthropic' && strpos(trim($key), 'sk-ant-') !== 0) {
            return $this->json($response, ['error' => 'مفتاح Anthropic يجب أن يبدأ بـ sk-ant-'], 422);
        }
        if ($provider === 'openai' && strpos(trim($key), 'sk-') !== 0) {
            return $this->json($response, ['error' => 'مفتاح OpenAI يجب أن يبدأ بـ sk-'], 422);
        }
        User::setAiApiKey($userId, $key);
        $trimmed = trim($key);
        $masked = substr($trimmed, 0, 6) . str_repeat('•', max(4, strlen($trimmed) - 10)) . substr($trimmed, -4);
        return $this->json($response, [
            'message' => 'تم حفظ مفتاح API بنجاح',
            'has_key' => true,
            'masked' => $masked,
            'source' => 'user',
            'provider' => $provider,
            'base_url' => User::getAiBaseUrl($userId),
            'model' => User::getAiModel($userId),
        ]);
    }

    /**
     * GET /auth/ai-models — fetch the available models from the configured
     * provider (uses the user's stored key + base URL). Returns a list of
     * model ids. Useful so the user picks a model that actually exists.
     */
    public function listAiModels(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $provider = User::getAiProvider($userId);
        $baseUrl = User::getAiBaseUrl($userId);
        $key = User::getAiApiKey($userId);
        if ($key === null) {
            $envKey = AppConfig::getAnthropicApiKey();
            if ($provider === 'anthropic' && $envKey !== '' && $envKey !== 'sk-ant-dummy') {
                $key = $envKey;
            }
        }
        if ($key === null) {
            return $this->json($response, ['error' => 'لا يوجد مفتاح API مُكوَّن'], 422);
        }

        // Resolve base URL.
        if ($baseUrl === null || $baseUrl === '') {
            if ($provider === 'anthropic') {
                $baseUrl = 'https://api.anthropic.com';
            } elseif ($provider === 'openai') {
                $baseUrl = 'https://api.openai.com/v1';
            } elseif ($provider === 'groq') {
                $baseUrl = 'https://api.groq.com/openai/v1';
            } else {
                return $this->json($response, ['error' => 'Base URL مطلوب للمزود المخصص'], 422);
            }
        }
        $baseUrl = rtrim($baseUrl, '/');

        $url = $baseUrl . '/models';
        $ch = curl_init($url);
        $headers = ['Content-Type: application/json'];
        if ($provider === 'anthropic') {
            $headers[] = 'x-api-key: ' . $key;
            $headers[] = 'anthropic-version: 2023-06-01';
        } else {
            $headers[] = 'Authorization: Bearer ' . $key;
        }
        curl_setopt_array($ch, [
            CURLOPT_HTTPGET => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
        ]);
        $resp = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200) {
            return $this->json($response, ['error' => 'تعذر جلب النماذج (HTTP ' . $httpCode . ')', 'detail' => mb_substr((string)$resp, 0, 300)], 502);
        }
        $decoded = json_decode((string)$resp, true);
        if (!is_array($decoded)) {
            return $this->json($response, ['error' => 'استجابة غير صالحة'], 502);
        }
        // OpenAI/Groq: { data: [ { id } ] } ; Anthropic: { data: [ { id } ] }
        $ids = [];
        foreach (($decoded['data'] ?? []) as $m) {
            if (isset($m['id']) && is_string($m['id'])) {
                $ids[] = $m['id'];
            }
        }
        sort($ids);
        return $this->json($response, ['models' => $ids]);
    }

    /** PUT /auth/profile — rename / change email. */
    public function updateProfile(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $data = $request->getParsedBody() ?: [];

        $name = $data['name'] ?? null;
        $email = $data['email'] ?? null;

        if (!is_string($name) || trim($name) === '' || mb_strlen(trim($name)) > 100) {
            return $this->json($response, ['error' => 'الاسم مطلوب (بحد أقصى 100 حرف)'], 422);
        }
        if (!is_string($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return $this->json($response, ['error' => 'البريد الإلكتروني غير صحيح'], 422);
        }

        $existing = User::findByEmail($email);
        if ($existing && (int)$existing['id'] !== $userId) {
            return $this->json($response, ['error' => 'البريد الإلكتروني مسجّل لحساب آخر'], 409);
        }

        User::update($userId, ['name' => trim($name), 'email' => $email]);
        return $this->json($response, [
            'message' => 'تم تحديث الملف الشخصي',
            'user' => User::findById($userId),
        ]);
    }

    /** PUT /auth/password — verify current, then set the new one. */
    public function changePassword(Request $request, Response $response): Response
    {
        $userId = (int)$request->getAttribute('user_id');
        $data = $request->getParsedBody() ?: [];

        $current = $data['current_password'] ?? null;
        $new = $data['new_password'] ?? null;

        if (!is_string($current) || !is_string($new) || $new === '') {
            return $this->json($response, ['error' => 'كلمة المرور الحالية والجديدة مطلوبتان'], 422);
        }
        if (strlen($new) < 6) {
            return $this->json($response, ['error' => 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل'], 422);
        }
        if ($current === $new) {
            return $this->json($response, ['error' => 'كلمة المرور الجديدة يجب أن تختلف عن الحالية'], 422);
        }

        $user = User::findWithHash($userId);
        if (!$user || !password_verify($current, $user['password_hash'])) {
            return $this->json($response, ['error' => 'كلمة المرور الحالية غير صحيحة'], 401);
        }

        User::changePassword($userId, password_hash($new, PASSWORD_BCRYPT));
        return $this->json($response, ['message' => 'تم تغيير كلمة المرور بنجاح']);
    }

    private function generateTokens(int $userId, string $name): array
    {
        $now = time();
        $secret = AppConfig::getJwtSecret();

        $accessPayload = [
            'iss' => 'financehub',
            'sub' => $userId,
            'name' => $name,
            'type' => 'access',
            'iat' => $now,
            'exp' => $now + AppConfig::getJwtExpiry(),
        ];

        $refreshPayload = [
            'iss' => 'financehub',
            'sub' => $userId,
            'type' => 'refresh',
            'iat' => $now,
            'exp' => $now + AppConfig::getJwtRefreshExpiry(),
        ];

        return [
            'access_token' => JWT::encode($accessPayload, $secret, 'HS256'),
            'refresh_token' => JWT::encode($refreshPayload, $secret, 'HS256'),
            'expires_in' => AppConfig::getJwtExpiry(),
        ];
    }

    private function storeRefreshToken(int $userId, string $token): void
    {
        $hash = hash('sha256', $token);
        $stmt = Database::getConnection()->prepare(
            'INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
             VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))'
        );
        $stmt->execute([$userId, $hash, AppConfig::getJwtRefreshExpiry()]);
    }

    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}
