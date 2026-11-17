<?php

namespace FinanceHub\Services;

use FinanceHub\Config\Database;

/**
 * Daily gold price in DZD per gram.
 *
 * Sources (both keyless):
 *   1. api.gold-api.com/price/XAU  → price per troy ounce in USD
 *   2. open.er-api.com/v6/latest/USD → USD→DZD rate
 * The converted price is cached one row per calendar day in `gold_prices`.
 * On network failure the most recent cached row is served (marked stale)
 * so the feature never hard-fails offline.
 */
class GoldPriceService
{
    private const GOLD_URL = 'https://api.gold-api.com/price/XAU';
    private const FX_URL = 'https://open.er-api.com/v6/latest/USD';
    private const GRAMS_PER_OUNCE = 31.1034768;
    private const TIMEOUT = 8;

    /**
     * @return array{price_usd_oz: float, usd_dzd: float, price_dzd_gram: float,
     *               price_date: string, source: string, is_stale: bool}|null
     */
    public function currentPrice(bool $forceRefresh = false): ?array
    {
        $today = date('Y-m-d');

        if (!$forceRefresh) {
            $cached = $this->cachedFor($today);
            if ($cached !== null) {
                return $cached;
            }
        }

        $fetched = $this->fetch();
        if ($fetched !== null) {
            $this->store($today, $fetched['price_usd_oz'], $fetched['usd_dzd'], $fetched['source']);
            return $fetched + ['price_date' => $today, 'is_stale' => false];
        }

        // Offline → last known price (any day), clearly marked as stale.
        return $this->latestCached();
    }

    /** Price per gram in DZD, or null when nothing is known yet. */
    public function currentPricePerGram(bool $forceRefresh = false): ?float
    {
        $price = $this->currentPrice($forceRefresh);
        return $price !== null ? (float)$price['price_dzd_gram'] : null;
    }

    /** @return array<string, mixed>|null */
    private function cachedFor(string $date): ?array
    {
        $stmt = Database::getConnection()->prepare('SELECT * FROM gold_prices WHERE price_date = ?');
        $stmt->execute([$date]);
        $row = $stmt->fetch();
        if (!$row) {
            return null;
        }
        return [
            'price_usd_oz' => (float)$row['price_usd_oz'],
            'usd_dzd' => (float)$row['usd_dzd'],
            'price_dzd_gram' => (float)$row['price_dzd_gram'],
            'price_date' => (string)$row['price_date'],
            'source' => (string)$row['source'],
            'is_stale' => false,
        ];
    }

    /** @return array<string, mixed>|null */
    private function latestCached(): ?array
    {
        $stmt = Database::getConnection()->query(
            'SELECT * FROM gold_prices ORDER BY price_date DESC LIMIT 1'
        );
        $row = $stmt ? $stmt->fetch() : false;
        if (!$row) {
            return null;
        }
        return [
            'price_usd_oz' => (float)$row['price_usd_oz'],
            'usd_dzd' => (float)$row['usd_dzd'],
            'price_dzd_gram' => (float)$row['price_dzd_gram'],
            'price_date' => (string)$row['price_date'],
            'source' => (string)$row['source'],
            'is_stale' => true,
        ];
    }

    /** @return array{price_usd_oz: float, usd_dzd: float, price_dzd_gram: float, source: string}|null */
    private function fetch(): ?array
    {
        $goldJson = $this->httpGet(self::GOLD_URL);
        if ($goldJson === null) {
            return null;
        }
        $gold = json_decode($goldJson, true);
        $oz = isset($gold['price']) && is_numeric($gold['price']) ? (float)$gold['price'] : null;
        if ($oz === null || $oz <= 0) {
            return null;
        }

        $fxJson = $this->httpGet(self::FX_URL);
        $usdDzd = null;
        $source = 'gold-api.com';
        if ($fxJson !== null) {
            $fx = json_decode($fxJson, true);
            if (isset($fx['rates']['DZD']) && is_numeric($fx['rates']['DZD'])) {
                $usdDzd = (float)$fx['rates']['DZD'];
                $source = 'gold-api.com + er-api.com';
            }
        }
        if ($usdDzd === null || $usdDzd <= 0) {
            return null;
        }

        $perGram = round($oz / self::GRAMS_PER_OUNCE * $usdDzd, 2);

        return [
            'price_usd_oz' => round($oz, 4),
            'usd_dzd' => round($usdDzd, 4),
            'price_dzd_gram' => $perGram,
            'source' => $source,
        ];
    }

    private function store(string $date, float $oz, float $usdDzd, string $source): void
    {
        $stmt = Database::getConnection()->prepare(
            'INSERT INTO gold_prices (price_date, price_usd_oz, usd_dzd, price_dzd_gram, source)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE price_usd_oz = VALUES(price_usd_oz),
                                     usd_dzd = VALUES(usd_dzd),
                                     price_dzd_gram = VALUES(price_dzd_gram),
                                     source = VALUES(source)'
        );
        $stmt->execute([$date, $oz, $usdDzd, round($oz / self::GRAMS_PER_OUNCE * $usdDzd, 2), $source]);
    }

    private function httpGet(string $url): ?string
    {
        if (!function_exists('curl_init')) {
            $ctx = stream_context_create(['http' => ['timeout' => self::TIMEOUT]]);
            $body = @file_get_contents($url, false, $ctx);
            return $body === false ? null : $body;
        }

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => self::TIMEOUT,
            CURLOPT_CONNECTTIMEOUT => self::TIMEOUT,
            CURLOPT_USERAGENT => 'FinanceHub/1.0',
        ]);
        $body = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        return (is_string($body) && $code >= 200 && $code < 300) ? $body : null;
    }
}
