FROM php:8.5-fpm-alpine

RUN apk add --no-cache \
    postgresql-dev \
    libzip-dev \
    icu-dev \
    oniguruma-dev \
    && docker-php-ext-install -j$(nproc) \
    bcmath \
    pdo \
    pdo_pgsql \
    pgsql \
    intl \
    mbstring \
    zip

# PHP 8.5 built-in: opcache, uri, lexbor extensions — no separate install needed

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

COPY . /var/www/html

RUN mkdir -p storage/app/kyc_vault storage/logs bootstrap/cache \
    && chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache

EXPOSE 9000

CMD ["sh", "-c", "php artisan migrate --force && php-fpm"]
