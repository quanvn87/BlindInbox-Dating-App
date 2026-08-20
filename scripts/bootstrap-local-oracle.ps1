[CmdletBinding()]
param(
    [switch] $LoadFunctionsOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Test-LocalOracleBootstrapPassword {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Password
    )

    return $Password -match '^[A-Za-z0-9_-]{12,128}$'
}

if ($LoadFunctionsOnly) {
    return
}

$devSecure = Read-Host 'SLOW_DATING_DEV password' -AsSecureString
$testSecure = Read-Host 'SLOW_DATING_TEST password' -AsSecureString
$devPassword = [Net.NetworkCredential]::new('', $devSecure).Password
$testPassword = [Net.NetworkCredential]::new('', $testSecure).Password

try {
    if (-not (Test-LocalOracleBootstrapPassword $devPassword)) {
        throw 'SLOW_DATING_DEV password must be 12-128 characters of A-Z, a-z, 0-9, underscore, or hyphen.'
    }
    if (-not (Test-LocalOracleBootstrapPassword $testPassword)) {
        throw 'SLOW_DATING_TEST password must be 12-128 characters of A-Z, a-z, 0-9, underscore, or hyphen.'
    }

    $repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
    $bootstrap = (Resolve-Path (Join-Path $repositoryRoot 'infra\oracle\bootstrap\001_create_local_users.sql')).Path
    & sqlplus.exe -s '/ as sysdba' "@$bootstrap" $devPassword $testPassword
    if ($LASTEXITCODE -ne 0) {
        throw "Oracle local-user bootstrap failed with exit code $LASTEXITCODE."
    }
}
finally {
    Remove-Variable devPassword, testPassword -ErrorAction SilentlyContinue
}
