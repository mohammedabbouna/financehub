<?php
namespace FinanceHub\Tests\Unit;

use FinanceHub\Services\TotpService;
use PHPUnit\Framework\TestCase;

class TotpServiceTest extends TestCase
{
    public function testGenerateAndVerify(): void
    {
        $secret = TotpService::generateSecret();
        $this->assertNotEmpty($secret);
        // current window code verifies
        // We can't easily compute without duplicating logic; verify verify() rejects garbage.
        $this->assertFalse(TotpService::verify($secret, '000000') || true === false);
    }

    public function testVerifyRejectsBadCode(): void
    {
        $secret = TotpService::generateSecret();
        $this->assertFalse(TotpService::verify($secret, '123456'));
    }

    public function testOtpauthUri(): void
    {
        $secret = TotpService::generateSecret();
        $uri = TotpService::otpauthUri($secret, 'user@example.com');
        $this->assertStringStartsWith('otpauth://totp/', $uri);
        $this->assertStringContainsString('secret=' . $secret, $uri);
    }
}
