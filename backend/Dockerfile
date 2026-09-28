FROM php:8.3-fpm-alpine

# Install system dependencies and PHP extensions
RUN apk add --no-cache \
    curl \
    libpng-dev \
    libxml2-dev \
    zip \
    unzip \
    git \
    oniguruma-dev \
    libzip-dev \
    postgresql-client \
    libpq-dev

RUN docker-php-ext-install pdo_pgsql pgsql mbstring exif pcntl bcmath gd zip

# Get latest Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Set working directory
WORKDIR /var/www/backend

# Install PHP dependencies before copying mutable application source
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader --no-scripts --no-progress

# Copy application files and complete Laravel package discovery
COPY . .
RUN composer dump-autoload --no-interaction --optimize

# Set permissions
RUN chown -R www-data:www-data /var/www/backend/storage /var/www/backend/bootstrap/cache \
    && chmod -R 775 /var/www/backend/storage /var/www/backend/bootstrap/cache

EXPOSE 9000

CMD ["php-fpm"]
