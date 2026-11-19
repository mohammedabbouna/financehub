<?php
namespace FinanceHub\Config;

class TaxDz
{
    // Algerian IRG brackets (annual taxable income in DZD).
    public static function brackets(): array
    {
        return [
            ['from' => 0,        'to' => 240000,   'rate' => 0.00],
            ['from' => 240001,   'to' => 480000,   'rate' => 0.20],
            ['from' => 480001,   'to' => 960000,   'rate' => 0.30],
            ['from' => 960001,   'to' => 1920000,  'rate' => 0.35],
            ['from' => 1920001,  'to' => PHP_INT_MAX, 'rate' => 0.40],
        ];
    }

    // Social contributions (CNAS employee share) — approximate.
    public static function socialContributionRate(): float
    {
        return 0.09;
    }

    public static function computeTax(float $taxableIncome): array
    {
        $tax = 0.0;
        $breakdown = [];
        foreach (self::brackets() as $b) {
            if ($taxableIncome <= $b['from'] - 1) break;
            $upper = min($taxableIncome, $b['to']);
            $slice = max(0, $upper - $b['from'] + 1);
            $sliceTax = $slice * $b['rate'];
            $tax += $sliceTax;
            if ($slice > 0) {
                $breakdown[] = [
                    'from' => $b['from'],
                    'to' => (int)$upper,
                    'rate' => $b['rate'],
                    'amount' => round($sliceTax, 2),
                ];
            }
        }
        $social = round($taxableIncome * self::socialContributionRate(), 2);
        return [
            'taxable_income' => round($taxableIncome, 2),
            'irg' => round($tax, 2),
            'social_contributions' => $social,
            'total' => round($tax + $social, 2),
            'effective_rate' => $taxableIncome > 0 ? round(($tax + $social) / $taxableIncome * 100, 2) : 0,
            'brackets' => $breakdown,
        ];
    }
}
