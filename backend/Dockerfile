FROM php:8.2-fpm-alpine AS base

RUN apk add --no-cache \
    curl \
    nginx \
    supervisor \
    oniguruma-dev \
    libzip-dev \
    unzip \
    && docker-php-ext-install pdo pdo_mysql mbstring zip

COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

WORKDIR /var/www

# ─── Production stage ──────────────────────────────────
FROM base AS production

COPY composer.json ./
RUN composer install --no-dev --no-interaction --no-progress --optimize-autoloader

COPY . .

COPY docker/nginx.conf /etc/nginx/http.d/default.conf
COPY docker/supervisord.conf /etc/supervisor.d/supervisord.conf

# supervisord writes its logfile here; the base php-fpm image doesn't create it.
RUN mkdir -p /var/log/supervisor

RUN chmod -R 755 storage && chown -R www-data:www-data storage

EXPOSE 8000

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor.d/supervisord.conf"]

# ─── Worker stage (background jobs, no web server) ─────
FROM base AS worker

COPY composer.json ./
RUN composer install --no-dev --no-interaction --no-progress --optimize-autoloader

COPY . .

RUN chmod -R 755 storage && chown -R www-data:www-data storage

# Busybox crond ships with Alpine — no external scheduler to download.
# Jobs run as root (crontab lives in /etc/crontabs/root) and log through
# bin/worker.php itself, which appends to storage/logs/worker.log.
COPY worker/crontab /etc/crontabs/root
RUN chmod 600 /etc/crontabs/root

CMD ["crond", "-f", "-l", "2"]

# ─── Development stage ─────────────────────────────────
FROM base AS development

COPY . .

RUN composer install --no-interaction --no-progress --no-audit

RUN chmod -R 755 storage && chown -R www-data:www-data storage

EXPOSE 8000

CMD ["php", "-S", "0.0.0.0:8000", "-t", "public"]
