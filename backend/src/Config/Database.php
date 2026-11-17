<?php

namespace FinanceHub\Config;

use PDO;
use PDOException;

class Database
{
    private static ?PDO $instance = null;

    private static function env(string $key, mixed $default = null): mixed
    {
        return $_ENV[$key] ?? $_SERVER[$key] ?? getenv($key) ?: $default;
    }

    public static function getConnection(): PDO
    {
        if (self::$instance === null) {
            $host = self::env('DB_HOST', 'db');
            $port = self::env('DB_PORT', '3306');
            $name = self::env('DB_NAME', 'financehub');
            $user = self::env('DB_USER', 'financehub_user');
            $pass = self::env('DB_PASS', 'secure_db_password_2024');

            $dsn = "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4";

            try {
                self::$instance = new PDO($dsn, $user, $pass, [
                    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES   => false,
                    PDO::ATTR_PERSISTENT         => false,
                ]);
            } catch (PDOException $e) {
                // Thrown into Slim's error handler so CORS headers + JSON error shape stay consistent.
                throw new \RuntimeException(
                    'Database connection failed: ' . $e->getMessage(),
                    500,
                    $e
                );
            }
        }

        return self::$instance;
    }
}
