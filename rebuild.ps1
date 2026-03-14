param(
    [switch]$Clean
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = $PSScriptRoot
if (-not $repoRoot) {
    $repoRoot = (Get-Location).Path
}

Write-Host "Repository root: $repoRoot"

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    throw "cargo is not available in PATH"
}

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    throw "uv is not available in PATH"
}

Push-Location $repoRoot
try {
    if ($Clean) {
        Write-Host "Cleaning Rust artifacts..."
        cargo clean
    }

    Write-Host "Building Rust workspace..."
    cargo build --workspace

    Write-Host "Checking Rust workspace..."
    cargo check --workspace

    Push-Location (Join-Path $repoRoot "python")
    try {
        Write-Host "Syncing Python environment with uv..."
        uv sync

        Write-Host "Building and installing Python extension (release) via maturin..."
        uv run maturin develop --release
    }
    finally {
        Pop-Location
    }

    Write-Host "Rebuild completed successfully."
}
finally {
    Pop-Location
}
