<?php
namespace FinanceHub\Services;

/**
 * Fetches live prices for investments. Supports Yahoo Finance (stocks/ETFs)
 * and CoinGecko (crypto). Falls back to null on failure (caller keeps
 * the stored value).
 */
class PriceProvider
{
    public function fetch(string $assetType, string $symbol): ?float
    {
        $symbol = trim($symbol);
        if ($symbol === '') return null;
        if ($assetType === 'crypto') {
            return $this->coinGecko($symbol);
        }
        return $this->yahoo($symbol);
    }

    private function yahoo(string $symbol): ?float
    {
        $url = 'https://query1.finance.yahoo.com/v8/finance/chart/' . urlencode($symbol) . '?interval=1d&range=1d';
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_HTTPHEADER => ['User-Agent: Mozilla/5.0'],
        ]);
        $resp = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($code !== 200 || !is_string($resp)) return null;
        $d = json_decode($resp, true);
        $price = $d['chart']['result'][0]['meta']['regularMarketPrice'] ?? null;
        return is_numeric($price) ? (float)$price : null;
    }

    private function coinGecko(string $symbol): ?float
    {
        // symbol is the CoinGecko coin id (e.g. bitcoin, ethereum)
        $url = 'https://api.coingecko.com/api/v3/simple/price?ids=' . urlencode($symbol) . '&vs_currencies=usd';
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
        ]);
        $resp = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($code !== 200 || !is_string($resp)) return null;
        $d = json_decode($resp, true);
        $price = $d[$symbol]['usd'] ?? null;
        return is_numeric($price) ? (float)$price : null;
    }
}
