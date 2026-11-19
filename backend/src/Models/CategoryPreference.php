<?php
namespace FinanceHub\Models;

use FinanceHub\Config\Database;

class CategoryPreference
{
    /**
     * Find the best matching category for a text based on learned preferences.
     * Matches by token overlap (Jaccard) against stored patterns.
     */
    public static function findForText(int $userId, string $text): ?int
    {
        $stmt = Database::getConnection()->prepare(
            'SELECT pattern, category_id FROM category_preferences WHERE user_id = ?'
        );
        $stmt->execute([$userId]);
        $rows = $stmt->fetchAll();
        if ($rows === []) return null;

        $text = mb_strtolower(trim($text));
        $tokens = array_filter(preg_split('/\s+/u', $text) ?: []);
        if ($tokens === []) return null;

        $best = null;
        $bestScore = 0.0;
        foreach ($rows as $r) {
            $patTokens = array_filter(preg_split('/\s+/u', mb_strtolower((string)$r['pattern'])) ?: []);
            if ($patTokens === []) continue;
            $inter = count(array_intersect($tokens, $patTokens));
            $union = count(array_unique(array_merge($tokens, $patTokens)));
            $score = $union > 0 ? $inter / $union : 0.0;
            if ($score > $bestScore && $score >= 0.2) {
                $bestScore = $score;
                $best = (int)$r['category_id'];
            }
        }
        return $best;
    }

    /**
     * Learn (or reinforce) a preference: map a description pattern to a category.
     */
    public static function upsert(int $userId, string $description, int $categoryId): void
    {
        $pattern = self::extractPattern($description);
        if ($pattern === '') return;
        $db = Database::getConnection();
        $stmt = $db->prepare(
            'INSERT INTO category_preferences (user_id, pattern, category_id, count) VALUES (?, ?, ?, 1)
             ON DUPLICATE KEY UPDATE category_id = VALUES(category_id), count = count + 1, updated_at = NOW()'
        );
        $stmt->execute([$userId, $pattern, $categoryId]);
    }

    private static function extractPattern(string $description): string
    {
        $description = mb_strtolower(trim($description));
        $tokens = array_filter(preg_split('/\s+/u', $description) ?: []);
        // keep up to 3 significant tokens (skip pure numbers)
        $sig = [];
        foreach ($tokens as $t) {
            if (preg_match('/^\d/', $t)) continue;
            $sig[] = $t;
            if (count($sig) >= 3) break;
        }
        return implode(' ', $sig);
    }
}
