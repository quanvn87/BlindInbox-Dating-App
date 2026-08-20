$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot 'bootstrap-local-oracle.ps1') -LoadFunctionsOnly

if (-not (Test-LocalOracleBootstrapPassword 'SafePassword_123')) {
    throw 'Expected a conservative safe bootstrap password to be accepted.'
}

foreach ($unsafePassword in @('has space', 'quote"inside', 'semicolon;inside', 'short_1')) {
    if (Test-LocalOracleBootstrapPassword $unsafePassword) {
        throw 'Expected an unsafe bootstrap password to be rejected.'
    }
}

Write-Output 'Bootstrap password policy tests passed.'
