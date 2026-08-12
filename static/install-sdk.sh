#!/bin/sh

set -eu

CONTRACT_URL="${DURABLE_WORKFLOW_QUICKSTART_CONTRACT_URL:-https://durable-workflow.com/quickstart-execution-contract.json}"
CURL_BIN="${CURL_BIN:-curl}"
COMPOSER_BIN="${COMPOSER_BIN:-composer}"
PIP_BIN="${PIP_BIN:-pip}"
CARGO_BIN="${CARGO_BIN:-cargo}"

usage() {
    echo "Usage: install-sdk.sh <php|python|rust|workflow|waterline>" >&2
    exit 64
}

artifact_for_target() {
    case "$1" in
        php) echo 'sdk-php' ;;
        python) echo 'sdk-python' ;;
        rust) echo 'sdk-rust' ;;
        workflow) echo 'workflow' ;;
        waterline) echo 'waterline' ;;
        *) usage ;;
    esac
}

resolve_version() {
    artifact="$1"
    awk -v artifact="$artifact" '
        /^  "artifacts": \{/ { in_artifacts = 1; next }
        in_artifacts && $0 ~ "^    \\\"" artifact "\\\"[[:space:]]*:[[:space:]]*\\{" {
            in_target = 1
            next
        }
        in_target && /"version"[[:space:]]*:/ {
            value = $0
            sub(/^.*"version"[[:space:]]*:[[:space:]]*"/, "", value)
            sub(/".*$/, "", value)
            print value
            exit
        }
    ' "$contract_file"
}

target="${1:-}"
test -n "$target" || usage
test "$#" -eq 1 || usage
artifact="$(artifact_for_target "$target")"

contract_file="$(mktemp "${TMPDIR:-/tmp}/durable-workflow-quickstart.XXXXXX")"
trap 'rm -f "$contract_file"' EXIT HUP INT TERM
"$CURL_BIN" -fsSL "$CONTRACT_URL" > "$contract_file"

if ! grep -q '"schema": "durable-workflow.docs.v2.quickstart-execution-contract"' "$contract_file"; then
    echo "The public quickstart contract has an unsupported schema." >&2
    exit 65
fi

version="$(resolve_version "$artifact")"
if ! printf '%s' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+-(alpha|beta|rc)\.[0-9]+$'; then
    echo "Could not resolve a qualified prerelease for $artifact from $CONTRACT_URL." >&2
    exit 65
fi

case "$target" in
    php|workflow|waterline)
        case "$version" in
            *-alpha.*) stability='alpha' ;;
            *-beta.*) stability='beta' ;;
            *-rc.*) stability='rc' ;;
            *) exit 65 ;;
        esac
        case "$target" in
            php) package='durable-workflow/sdk' ;;
            workflow) package='durable-workflow/workflow' ;;
            waterline) package='durable-workflow/waterline' ;;
        esac
        exec "$COMPOSER_BIN" require "$package:$version@$stability"
        ;;
    python)
        extras="${DURABLE_WORKFLOW_PYTHON_EXTRAS:-}"
        if test -n "$extras" && ! printf '%s' "$extras" | grep -Eq '^[A-Za-z0-9_-]+(,[A-Za-z0-9_-]+)*$'; then
            echo 'DURABLE_WORKFLOW_PYTHON_EXTRAS must be a comma-separated package extra list.' >&2
            exit 64
        fi
        if test -n "$extras"; then
            exec "$PIP_BIN" install "durable-workflow[$extras]==$version"
        fi
        exec "$PIP_BIN" install "durable-workflow==$version"
        ;;
    rust)
        exec "$CARGO_BIN" add "durable-workflow@=$version"
        ;;
esac
