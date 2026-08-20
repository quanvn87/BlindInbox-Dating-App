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

$devPassword = 'ExampleDev_123'
$testPassword = 'ExampleTest_456'
$startInfo = New-LocalOracleBootstrapStartInfo
$arguments = $startInfo.Arguments
if ($arguments.Contains($devPassword) -or $arguments.Contains($testPassword)) {
    throw 'Bootstrap passwords must not be present in the SQL*Plus argv.'
}
if (-not $startInfo.RedirectStandardInput -or
    -not $startInfo.RedirectStandardOutput -or
    -not $startInfo.RedirectStandardError) {
    throw 'SQL*Plus bootstrap must use redirected standard streams.'
}

$bootstrapInput = New-LocalOracleBootstrapInput `
    -BootstrapPath 'C:\local\bootstrap.sql' `
    -DevPassword $devPassword `
    -TestPassword $testPassword
if (-not $bootstrapInput.Contains("DEFINE dev_password = '$devPassword'") -or
    -not $bootstrapInput.Contains("DEFINE test_password = '$testPassword'")) {
    throw 'Bootstrap passwords must be supplied through SQL*Plus standard input.'
}

$bootstrapSql = Get-Content -LiteralPath (
    Join-Path $PSScriptRoot '..\infra\oracle\bootstrap\001_create_local_users.sql'
) -Raw
if ($bootstrapSql -match "&[12]") {
    throw 'Bootstrap SQL must not read passwords from positional argv variables.'
}

Write-Output 'Bootstrap password policy tests passed.'
