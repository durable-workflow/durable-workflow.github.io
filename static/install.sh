#!/usr/bin/env sh
# Durable Workflow CLI installer for Linux and macOS.
#
# Usage:
#   curl -fsSL https://durable-workflow.com/install.sh | sh
#
# Environment variables:
#   VERSION                              Release tag, supported, prerelease, or stable (default: stable).
#   DURABLE_WORKFLOW_INSTALL_DIR         Install directory (default: ~/.local/bin).
#   DURABLE_WORKFLOW_BIN_NAME            Executable name (default: dw).
#   DURABLE_WORKFLOW_RELEASE_BASE_URL    Release base URL override for tests.
#   DURABLE_WORKFLOW_INSTALL_VERIFY_ATTESTATIONS
#                                        Set to 1 to verify GitHub artifact attestations with gh.
#   DURABLE_WORKFLOW_INSTALL_OUTPUT      Result format: human (default) or json.

set -eu

REPO="durable-workflow/cli"
BIN_NAME="${DURABLE_WORKFLOW_BIN_NAME:-dw}"
INSTALL_DIR="${DURABLE_WORKFLOW_INSTALL_DIR:-$HOME/.local/bin}"
VERSION="${VERSION:-stable}"
RELEASE_BASE_URL="${DURABLE_WORKFLOW_RELEASE_BASE_URL:-https://github.com/${REPO}/releases}"
RELEASE_BASE_URL="${RELEASE_BASE_URL%/}"
VERIFY_ATTESTATIONS="${DURABLE_WORKFLOW_INSTALL_VERIFY_ATTESTATIONS:-0}"
OUTPUT_MODE="${DURABLE_WORKFLOW_INSTALL_OUTPUT:-human}"

err() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }
info() {
    if [ "$OUTPUT_MODE" = "json" ]; then
        printf '==> %s\n' "$*" >&2
    else
        printf '\033[32m==>\033[0m %s\n' "$*"
    fi
}
warn() { printf '\033[33mwarning:\033[0m %s\n' "$*" >&2; }

case "$OUTPUT_MODE" in
    human|json) ;;
    *) err "DURABLE_WORKFLOW_INSTALL_OUTPUT must be human or json" ;;
esac

uname_s=$(uname -s)
uname_m=$(uname -m)

case "$uname_s" in
    Linux) os="linux" ;;
    Darwin) os="macos" ;;
    *) err "unsupported OS: $uname_s (Windows users: use install.ps1)" ;;
esac

case "$uname_m" in
    x86_64|amd64) arch="x86_64" ;;
    arm64|aarch64) arch="aarch64" ;;
    *) err "unsupported architecture: $uname_m" ;;
esac

if [ "$os" = "macos" ] && [ "$arch" = "x86_64" ]; then
    err "macos-x86_64 binaries are not currently published. Use the PHAR with a system PHP instead."
fi

asset="dw-${os}-${arch}"
command -v curl >/dev/null 2>&1 || err "curl is required"

if [ "$VERSION" = "supported" ]; then
    VERSION="stable"
fi

if [ "$VERSION" = "prerelease" ]; then
    err "prerelease auto-selection ended with the stable 2.0 launch; set VERSION to an exact historical tag"
fi

if [ "$VERSION" = "latest" ] || [ "$VERSION" = "stable" ]; then
    url="${RELEASE_BASE_URL}/latest/download/${asset}"
    checksum_url="${RELEASE_BASE_URL}/latest/download/SHA256SUMS"
else
    release_version="${VERSION#v}"
    url="${RELEASE_BASE_URL}/download/${release_version}/${asset}"
    checksum_url="${RELEASE_BASE_URL}/download/${release_version}/SHA256SUMS"
fi
sha256_file() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" | awk '{print $1}'
        return 0
    fi

    if command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$1" | awk '{print $1}'
        return 0
    fi

    return 127
}

mkdir -p "$INSTALL_DIR"
if ! INSTALL_DIR=$(CDPATH= cd "$INSTALL_DIR" 2>/dev/null && pwd -P); then
    err "could not resolve install directory: $INSTALL_DIR"
fi
tmpdir=$(mktemp -d)
tmp="$tmpdir/$asset"
sums="$tmpdir/SHA256SUMS"
trap 'rm -rf "$tmpdir"' EXIT

info "Downloading $asset"
if ! curl -fsSL --retry 3 -o "$tmp" "$url"; then
    err "download failed: $url"
fi

[ -s "$tmp" ] || err "downloaded file is empty"

info "Verifying checksum"
if ! curl -fsSL --retry 3 -o "$sums" "$checksum_url"; then
    err "checksum download failed: $checksum_url"
fi

if ! expected_sha=$(awk -v asset="$asset" '$2 == asset || $2 == "*" asset {print $1; found=1} END {if (!found) exit 1}' "$sums"); then
    err "checksum for $asset not found in SHA256SUMS"
fi

if ! actual_sha=$(sha256_file "$tmp"); then
    err "sha256sum or shasum is required to verify the download"
fi

actual_sha=$(printf '%s' "$actual_sha" | tr '[:upper:]' '[:lower:]')
expected_sha=$(printf '%s' "$expected_sha" | tr '[:upper:]' '[:lower:]')
if [ "$actual_sha" != "$expected_sha" ]; then
    err "checksum verification failed for $asset"
fi

if [ "$VERIFY_ATTESTATIONS" = "1" ]; then
    command -v gh >/dev/null 2>&1 || err "gh is required when DURABLE_WORKFLOW_INSTALL_VERIFY_ATTESTATIONS=1"

    info "Verifying GitHub artifact attestations"
    if [ "$OUTPUT_MODE" = "json" ]; then
        gh attestation verify "$tmp" --repo "$REPO" >&2
        gh attestation verify "$sums" --repo "$REPO" >&2
    else
        gh attestation verify "$tmp" --repo "$REPO"
        gh attestation verify "$sums" --repo "$REPO"
    fi
fi

chmod +x "$tmp"
installed_path="$INSTALL_DIR/$BIN_NAME"

# Remember what a fresh lookup selected before the new file existed. When a
# hashing shell launched this installer after invoking that command, its
# parent-process cache can continue to select this path even though the
# installer's own lookup sees the newly written file. A child process cannot
# inspect or clear that cache.
pre_install_path=""
hash -r 2>/dev/null || :
if resolved_path=$(command -v "$BIN_NAME" 2>/dev/null); then
    pre_install_path="$resolved_path"
    case "$pre_install_path" in
        */*)
            pre_install_dir=${pre_install_path%/*}
            pre_install_name=${pre_install_path##*/}
            [ -n "$pre_install_dir" ] || pre_install_dir="/"
            if canonical_pre_install_dir=$(CDPATH= cd "$pre_install_dir" 2>/dev/null && pwd -P); then
                pre_install_path="$canonical_pre_install_dir/$pre_install_name"
            fi
            ;;
    esac
fi

mv "$tmp" "$INSTALL_DIR/$BIN_NAME"
rm -rf "$tmpdir"
trap - EXIT

read_version() {
    version_output=$("$1" --version 2>/dev/null) || return 1
    version_output=$(printf '%s\n' "$version_output" | awk 'NR == 1 { sub(/\r$/, ""); print; exit }')
    [ -n "$version_output" ] || return 1
    printf '%s\n' "$version_output"
}

shell_quote() {
    printf "'"
    printf '%s' "$1" | sed "s/'/'\\\\''/g"
    printf "'"
}

json_quote() {
    printf '%s' "$1" | awk '
        BEGIN { ORS = ""; printf "\"" }
        {
            if (NR > 1) printf "\\n"
            for (i = 1; i <= length($0); i++) {
                char = substr($0, i, 1)
                if (char == "\\") printf "\\\\"
                else if (char == "\"") printf "\\\""
                else if (char == "\r") printf "\\r"
                else if (char == "\t") printf "\\t"
                else printf "%s", char
            }
        }
        END { printf "\"" }
    '
}

installed_version=""
if ! installed_version=$(read_version "$installed_path"); then
    install_status="installed-version-unavailable"
else
    install_status="ready"
fi

# A directory merely occurring in PATH is not enough: resolve the command the
# invoking environment will actually select. Clear this child shell's command
# cache first so replacement of an existing path is observed deterministically.
hash -r 2>/dev/null || :
active_path=""
if resolved_path=$(command -v "$BIN_NAME" 2>/dev/null); then
    active_path="$resolved_path"
    case "$active_path" in
        */*)
            active_dir=${active_path%/*}
            active_name=${active_path##*/}
            [ -n "$active_dir" ] || active_dir="/"
            if canonical_active_dir=$(CDPATH= cd "$active_dir" 2>/dev/null && pwd -P); then
                active_path="$canonical_active_dir/$active_name"
            fi
            ;;
    esac
fi

active_version=""
active_selects_installed="false"
if [ -n "$active_path" ]; then
    if [ "$active_path" = "$installed_path" ] || [ "$active_path" -ef "$installed_path" ] 2>/dev/null; then
        active_selects_installed="true"
    fi

    if [ "$active_selects_installed" = "true" ] && [ -n "$installed_version" ]; then
        active_version="$installed_version"
    else
        active_version=$(read_version "$active_path") || active_version=""
    fi
fi

if [ -z "$installed_version" ]; then
    install_status="installed-version-unavailable"
elif [ -z "$active_path" ]; then
    install_status="not-on-path"
elif [ "$active_selects_installed" != "true" ]; then
    install_status="path-shadowed"
elif [ -z "$active_version" ]; then
    install_status="active-version-unavailable"
elif [ "$active_version" != "$installed_version" ]; then
    install_status="active-version-mismatch"
else
    install_status="ready"
fi

quoted_install_dir=$(shell_quote "$INSTALL_DIR")
quoted_bin_name=$(shell_quote "$BIN_NAME")
shell_path=${SHELL:-/bin/sh}
shell_name=${shell_path##*/}

# SHELL identifies the login shell, not necessarily the shell that invoked this
# installer. Prefer the direct parent process when it is a recognized shell so
# remediation can be pasted into the shell that is actually waiting for us.
parent_shell_name=""
if [ -n "${PPID:-}" ] && parent_command=$(ps -p "$PPID" -o comm= 2>/dev/null); then
    parent_command=${parent_command##*/}
    parent_command=${parent_command#-}
    case "$parent_command" in
        bash|dash|sh|ash|ksh|ksh93|mksh|pdksh|zsh|fish)
            parent_shell_name="$parent_command"
            ;;
    esac
fi

remediation_shell_name=${parent_shell_name:-$shell_name}
parent_shell_label="$remediation_shell_name"
parent_cache_command=""
case "$remediation_shell_name" in
    bash)
        parent_shell_label="Bash"
        shell_profile="$HOME/.bashrc"
        current_shell_command="export PATH=${quoted_install_dir}:\"\$PATH\"; hash -d ${quoted_bin_name} 2>/dev/null || :"
        persistent_shell_line="export PATH=${quoted_install_dir}:\"\$PATH\""
        parent_cache_command="hash -d ${quoted_bin_name} 2>/dev/null || :"
        ;;
    zsh)
        parent_shell_label="Zsh"
        shell_profile="$HOME/.zshrc"
        current_shell_command="export PATH=${quoted_install_dir}:\"\$PATH\"; rehash"
        persistent_shell_line="export PATH=${quoted_install_dir}:\"\$PATH\""
        parent_cache_command="unhash ${quoted_bin_name} 2>/dev/null || rehash"
        ;;
    fish)
        parent_shell_label="fish"
        shell_profile="$HOME/.config/fish/config.fish"
        current_shell_command="set -gx PATH ${quoted_install_dir} \$PATH"
        persistent_shell_line="fish_add_path --prepend ${quoted_install_dir}"
        ;;
    dash|sh|ash|ksh|ksh93|mksh|pdksh)
        shell_profile="$HOME/.profile"
        current_shell_command="export PATH=${quoted_install_dir}:\"\$PATH\"; hash -r"
        persistent_shell_line="export PATH=${quoted_install_dir}:\"\$PATH\""
        parent_cache_command="hash ${quoted_bin_name}"
        ;;
    *)
        parent_shell_label="POSIX"
        shell_profile="$HOME/.profile"
        current_shell_command="export PATH=${quoted_install_dir}:\"\$PATH\"; hash -r"
        persistent_shell_line="export PATH=${quoted_install_dir}:\"\$PATH\""
        ;;
esac

# `command -v` above runs in this installer process. If its parent is a shell
# that can cache command locations, require a targeted refresh in that invoking
# shell instead of claiming that the installation is already ready.
if [ "$install_status" = "ready" ] \
    && [ -n "$parent_cache_command" ] \
    && [ -n "$pre_install_path" ] \
    && [ "$pre_install_path" != "$installed_path" ]; then
    install_status="shell-cache-refresh-required"
    active_path="$pre_install_path"
    active_version=$(read_version "$active_path") || active_version=""
    current_shell_command="$parent_cache_command"
    shell_profile=""
    persistent_shell_line=""
fi

if [ "$OUTPUT_MODE" = "json" ]; then
    active_path_json="null"
    active_version_json="null"
    [ -n "$active_path" ] && active_path_json=$(json_quote "$active_path")
    [ -n "$active_version" ] && active_version_json=$(json_quote "$active_version")

    if [ "$install_status" = "ready" ]; then
        remediation_json="null"
    else
        shell_profile_json="null"
        persistent_shell_line_json="null"
        [ -n "$shell_profile" ] && shell_profile_json=$(json_quote "$shell_profile")
        [ -n "$persistent_shell_line" ] && persistent_shell_line_json=$(json_quote "$persistent_shell_line")
        remediation_json=$(printf '{"current_shell":%s,"shell_profile":%s,"persistent_line":%s}' \
            "$(json_quote "$current_shell_command")" \
            "$shell_profile_json" \
            "$persistent_shell_line_json")
    fi

    printf '{"schema":"durable-workflow.cli.install.v1","status":%s,"installed_path":%s,"active_path":%s,"installed_version":%s,"active_version":%s,"remediation":%s}\n' \
        "$(json_quote "$install_status")" \
        "$(json_quote "$installed_path")" \
        "$active_path_json" \
        "$(json_quote "$installed_version")" \
        "$active_version_json" \
        "$remediation_json"
else
    printf 'Installed path: %s\n' "$installed_path"
    printf 'Resolved active path: %s\n' "${active_path:-not found}"
    printf 'Installed version: %s\n' "${installed_version:-unavailable}"
    printf 'Active version: %s\n' "${active_version:-unavailable}"

    case "$install_status" in
        ready)
            info "Installation ready: ordinary $BIN_NAME invocations use the installed release."
            ;;
        shell-cache-refresh-required)
            warn "Installation is not ready: the invoking $parent_shell_label shell may still cache the pre-install $BIN_NAME path."
            printf 'For this %s shell, run:\n    %s\n' "$parent_shell_label" "$current_shell_command" >&2
            ;;
        *)
            warn "Installation is not ready: ordinary $BIN_NAME invocations do not select the installed release ($install_status)."
            printf 'For this %s shell, run:\n    %s\n' "$parent_shell_label" "$current_shell_command" >&2
            printf 'For new %s shells, add this exact line to %s:\n    %s\n' "$parent_shell_label" "$shell_profile" "$persistent_shell_line" >&2
            ;;
    esac
fi

[ "$install_status" = "ready" ] || exit 1
