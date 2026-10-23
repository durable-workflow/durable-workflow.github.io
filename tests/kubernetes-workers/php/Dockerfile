FROM php:8.3.35-cli-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends unzip libcurl4-openssl-dev \
    && docker-php-ext-install pcntl curl \
    && rm -r /var/lib/apt/lists/*
COPY --from=composer:2.9 /usr/bin/composer /usr/bin/composer
WORKDIR /app
ARG SDK_VERSION
RUN composer require --no-interaction --no-progress --prefer-dist durable-workflow/sdk:${SDK_VERSION}
COPY worker.php .
ENTRYPOINT ["php", "/app/worker.php"]
