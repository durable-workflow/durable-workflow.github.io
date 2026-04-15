# Durable Workflow CLI installer for Windows.
#
# Usage:
#   irm https://durable-workflow.com/install.ps1 | iex
#
# Env vars:
#   $env:VERSION                       Pin a release tag (default: latest).
#   $env:DURABLE_WORKFLOW_INSTALL_DIR  Install directory (default: %USERPROFILE%\.durable-workflow\bin).

$ErrorActionPreference = 'Stop'

$repo = 'durable-workflow/cli'
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
    "https://github.com/$repo/releases/latest/download/$asset"
} else {
    "https://github.com/$repo/releases/download/$version/$asset"
}

New-Item -ItemType Directory -Force -Path $installDir | Out-Null
$dest = Join-Path $installDir $binName

Write-Host "==> Downloading $asset" -ForegroundColor Green
try {
    Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
} catch {
    throw "Download failed: $url`n$_"
}

Write-Host "==> Installed $binName to $installDir" -ForegroundColor Green

$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$paths = @($userPath -split ';' | Where-Object { $_ })
if ($paths -notcontains $installDir) {
    [Environment]::SetEnvironmentVariable('Path', (($paths + $installDir) -join ';'), 'User')
    Write-Host "==> Added $installDir to your user PATH. Restart your shell for the change to take effect." -ForegroundColor Green
}

& $dest --version
