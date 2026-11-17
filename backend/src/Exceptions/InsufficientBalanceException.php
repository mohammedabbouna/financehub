<?php

namespace FinanceHub\Exceptions;

use RuntimeException;

/**
 * Raised inside a transaction when a wallet does not have enough funds.
 * Mapped to HTTP 400 by the global error handler in public/index.php.
 */
class InsufficientBalanceException extends RuntimeException
{
}
