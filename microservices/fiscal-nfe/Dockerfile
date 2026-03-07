FROM php:8.2-cli

# Install system deps for OpenSSL (certificate handling) and XML (NF-e/NFC-e)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libxml2-dev \
    libzip-dev \
    libcurl4-openssl-dev \
    unzip \
    git \
    && docker-php-ext-install soap xml curl zip \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Composer
COPY --from=composer:2 /usr/local/bin/composer /usr/local/bin/composer

WORKDIR /app

# Copy composer files first for layer caching
COPY composer.json composer.lock* ./
RUN composer install --no-dev --optimize-autoloader --no-interaction || \
    composer install --no-dev --no-interaction

# Copy application source
COPY . .

# Expose port
EXPOSE 8580

# Start the PHP built-in server
CMD ["php", "-S", "0.0.0.0:8580", "-t", "public"]
