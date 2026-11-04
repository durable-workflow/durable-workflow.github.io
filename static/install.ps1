# Durable Workflow CLI installer for Windows.
#
# Usage:
#   irm https://durable-workflow.com/install.ps1 | iex
#
# Environment variables:
#   $env:VERSION                         Release tag or stable/latest (default: stable).
#   $env:DURABLE_WORKFLOW_INSTALL_DIR    Install directory (default: %USERPROFILE%\.durable-workflow\bin).
#   $env:DURABLE_WORKFLOW_RELEASE_BASE_URL  Release base URL override for tests.
#   $env:DURABLE_WORKFLOW_INSTALL_VERIFY_ATTESTATIONS
#                                        Set to 1 to verify GitHub artifact attestations with gh.

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
$version = if ($env:VERSION) { $env:VERSION } else { 'stable' }
if ($version -eq 'supported') { $version = 'stable' }
if ($version -eq 'prerelease') { throw 'Pass an explicit prerelease tag with VERSION=...' }
$releaseVersion = if ($version.StartsWith('v')) {
    $version.Substring(1)
} else {
    $version
}
$verifyAttestations = $env:DURABLE_WORKFLOW_INSTALL_VERIFY_ATTESTATIONS -eq '1'

if (-not [System.Environment]::Is64BitOperatingSystem) {
    throw 'Durable Workflow CLI requires a 64-bit operating system.'
}

$arch = 'x86_64'
$asset = "dw-windows-$arch.exe"

$url = if ($version -eq 'latest' -or $version -eq 'stable') {
    "$releaseBaseUrl/latest/download/$asset"
} else {
    "$releaseBaseUrl/download/$releaseVersion/$asset"
}

$checksumUrl = if ($version -eq 'latest' -or $version -eq 'stable') {
    "$releaseBaseUrl/latest/download/SHA256SUMS"
} else {
    "$releaseBaseUrl/download/$releaseVersion/SHA256SUMS"
}

New-Item -ItemType Directory -Force -Path $installDir | Out-Null
$dest = Join-Path $installDir $binName
$tmpDir = Join-Path ([System.IO.Path]::GetTempPath()) ("dw-install-" + [System.Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
$tmp = Join-Path $tmpDir $asset
$sums = Join-Path $tmpDir 'SHA256SUMS'

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

    if ($verifyAttestations) {
        if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
            throw 'gh is required when DURABLE_WORKFLOW_INSTALL_VERIFY_ATTESTATIONS=1.'
        }

        Write-Host '==> Verifying GitHub artifact attestations' -ForegroundColor Green
        # Only the repository's release workflows, run from main or a release
        # tag on GitHub-hosted runners, can have signed a release asset.
        $repoPattern = [regex]::Escape($repo)
        $signer = "^https://github\.com/$repoPattern/\.github/workflows/(release|release-rust)\.yml@refs/(heads/main|tags/v?[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.+-]+)?)$"
        foreach ($subject in @($tmp, $sums)) {
            gh attestation verify $subject --repo $repo --cert-identity-regex $signer --deny-self-hosted-runners
            if ($LASTEXITCODE -ne 0) {
                throw "Attestation verification failed for $subject."
            }
        }
    }

    Move-Item -Force -Path $tmp -Destination $dest
} catch {
    throw $_
} finally {
    Remove-Item -Path $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "==> Installed $binName to $installDir" -ForegroundColor Green

$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$paths = @($userPath -split ';' | Where-Object { $_ })
if ($paths -notcontains $installDir) {
    [Environment]::SetEnvironmentVariable('Path', (($paths + $installDir) -join ';'), 'User')
    Write-Host "==> Added $installDir to your user PATH. Restart your shell for the change to take effect." -ForegroundColor Green
}

& $dest --version
