#!/usr/bin/env sh
# Durable Workflow CLI installer for Linux and macOS.
#
# Usage:
#   curl -fsSL https://durable-workflow.com/install.sh | sh
#
# Env vars:
#   VERSION                  Pin a specific release tag (default: latest).
#   DURABLE_WORKFLOW_INSTALL_DIR  Where to place the binary (default: ~/.local/bin).
#   DURABLE_WORKFLOW_BIN_NAME     Executable name (default: dw).

set -eu

REPO="durable-workflow/cli"
BIN_NAME="${DURABLE_WORKFLOW_BIN_NAME:-dw}"
INSTALL_DIR="${DURABLE_WORKFLOW_INSTALL_DIR:-$HOME/.local/bin}"
VERSION="${VERSION:-latest}"

err() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }
info() { printf '\033[32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[33mwarning:\033[0m %s\n' "$*" >&2; }

uname_s=$(uname -s)
uname_m=$(uname -m)

case "$uname_s" in
    Linux)  os="linux" ;;
    Darwin) os="macos" ;;
    *) err "unsupported OS: $uname_s (Windows users: use install.ps1)" ;;
esac

case "$uname_m" in
    x86_64|amd64)  arch="x86_64" ;;
    arm64|aarch64) arch="aarch64" ;;
    *) err "unsupported architecture: $uname_m" ;;
esac

# No macos-x86_64 binary is currently published.
if [ "$os" = "macos" ] && [ "$arch" = "x86_64" ]; then
    err "macos-x86_64 binaries are not currently published. Use the PHAR with a system PHP instead."
fi

asset="dw-${os}-${arch}"

if [ "$VERSION" = "latest" ]; then
    url="https://github.com/${REPO}/releases/latest/download/${asset}"
else
    url="https://github.com/${REPO}/releases/download/${VERSION}/${asset}"
fi

command -v curl >/dev/null 2>&1 || err "curl is required"

mkdir -p "$INSTALL_DIR"
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

info "Downloading $asset"
if ! curl -fsSL --retry 3 -o "$tmp" "$url"; then
    err "download failed: $url"
fi

[ -s "$tmp" ] || err "downloaded file is empty"

chmod +x "$tmp"
mv "$tmp" "$INSTALL_DIR/$BIN_NAME"
trap - EXIT

info "Installed $BIN_NAME to $INSTALL_DIR"

case ":$PATH:" in
    *":$INSTALL_DIR:"*) ;;
    *)
        warn "$INSTALL_DIR is not in your PATH. Add this to your shell profile:"
        printf '    export PATH="%s:$PATH"\n' "$INSTALL_DIR"
        ;;
esac

"$INSTALL_DIR/$BIN_NAME" --version || true
