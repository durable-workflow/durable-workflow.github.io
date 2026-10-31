#!/bin/sh

set -eu

COMPOSER_BIN="${COMPOSER_BIN:-composer}"
PIP_BIN="${PIP_BIN:-pip}"
CARGO_BIN="${CARGO_BIN:-cargo}"

usage() {
    echo "Usage: install-sdk.sh <php|python|rust|workflow|waterline>" >&2
    exit 64
}

target="${1:-}"
test -n "$target" || usage
test "$#" -eq 1 || usage

case "$target" in
    php)
        exec "$COMPOSER_BIN" require 'durable-workflow/sdk:^2.0'
        ;;
    workflow)
        exec "$COMPOSER_BIN" require 'durable-workflow/workflow:^2.0'
        ;;
    waterline)
        exec "$COMPOSER_BIN" require 'durable-workflow/waterline:^2.0'
        ;;
    python)
        extras="${DURABLE_WORKFLOW_PYTHON_EXTRAS:-}"
        if test -n "$extras" && ! printf '%s' "$extras" | grep -Eq '^[A-Za-z0-9_-]+(,[A-Za-z0-9_-]+)*$'; then
            echo 'DURABLE_WORKFLOW_PYTHON_EXTRAS must be a comma-separated package extra list.' >&2
            exit 64
        fi
        if test -n "$extras"; then
            exec "$PIP_BIN" install "durable-workflow[$extras]>=2,<3"
        fi
        exec "$PIP_BIN" install 'durable-workflow>=2,<3'
        ;;
    rust)
        exec "$CARGO_BIN" add 'durable-workflow@2'
        ;;
    *)
        usage
        ;;
esac
