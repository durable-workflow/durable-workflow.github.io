# Durable Workflow CLI installer for Windows.
#
# Usage:
#   irm https://durable-workflow.com/install.ps1 | iex
#
# Env vars:
#   $env:VERSION                       Pin a release tag (default: latest).
#   $env:DURABLE_WORKFLOW_INSTALL_DIR  Install directory (default: %USERPROFILE%\.durable-workflow\bin).
#   $env:DURABLE_WORKFLOW_RELEASE_BASE_URL  Override release base URL for tests.

$ErrorActionPreference = 'Stop'

$repo = 'durable-workflow/cli'
$releaseBaseUrl = if ($env:DURABLE_WORKFLOW_RELEASE_BASE_URL) {
    ($env:DURABLE_WORKFLOW_RELEASE_BASE_URL).TrimEnd('/')
} else {
    "https://github.com/$repo/releases"
}
$binName = 'dw.exe'
$installDir = if ($env:DURABLE_WORKFLOW_INSTALL_DIR) {
    $env:DURABLE_WORKFLOW_INSTALL_DIR
} else {
    Join-Path $env:USERPROFILE '.durable-workflow\bin'
}
$version = if ($env:VERSION) { $env:VERSION } else { 'latest' }

if (-not [System.Environment]::Is64BitOperatingSystem) {
    throw 'Durable Workflow CLI requires a 64-bit operating system.'
}

$arch = 'x86_64'
$asset = "dw-windows-$arch.exe"

$url = if ($version -eq 'latest') {
    "$releaseBaseUrl/latest/download/$asset"
} else {
    "$releaseBaseUrl/download/$version/$asset"
}

$checksumUrl = if ($version -eq 'latest') {
    "$releaseBaseUrl/latest/download/SHA256SUMS"
} else {
    "$releaseBaseUrl/download/$version/SHA256SUMS"
}

New-Item -ItemType Directory -Force -Path $installDir | Out-Null
$dest = Join-Path $installDir $binName
$tmp = New-TemporaryFile
$sums = New-TemporaryFile

try {
    Write-Host "==> Downloading $asset" -ForegroundColor Green
    try {
        Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing
    } catch {
        throw "Download failed: $url`n$_"
    }

    Write-Host '==> Verifying checksum' -ForegroundColor Green
    try {
        Invoke-WebRequest -Uri $checksumUrl -OutFile $sums -UseBasicParsing
    } catch {
        throw "Checksum download failed: $checksumUrl`n$_"
    }

    $checksumLine = Get-Content $sums | Where-Object {
        $parts = $_ -split '\s+', 3
        $parts.Count -ge 2 -and $parts[1].TrimStart('*') -eq $asset
    } | Select-Object -First 1

    if (-not $checksumLine) {
        throw "Checksum for $asset not found in SHA256SUMS."
    }

    $expectedHash = (($checksumLine -split '\s+', 3)[0]).ToLowerInvariant()
    $actualHash = (Get-FileHash -Algorithm SHA256 -Path $tmp).Hash.ToLowerInvariant()

    if ($actualHash -ne $expectedHash) {
        throw "Checksum verification failed for $asset."
    }

    Move-Item -Force -Path $tmp -Destination $dest
} catch {
    throw $_
} finally {
    Remove-Item -Path $tmp, $sums -Force -ErrorAction SilentlyContinue
}

Write-Host "==> Installed $binName to $installDir" -ForegroundColor Green

$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$paths = @($userPath -split ';' | Where-Object { $_ })
if ($paths -notcontains $installDir) {
    [Environment]::SetEnvironmentVariable('Path', (($paths + $installDir) -join ';'), 'User')
    Write-Host "==> Added $installDir to your user PATH. Restart your shell for the change to take effect." -ForegroundColor Green
}

& $dest --version
