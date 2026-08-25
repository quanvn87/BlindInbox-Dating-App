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

function New-LocalOracleBootstrapStartInfo {
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = 'sqlplus.exe'
    $startInfo.Arguments = '-s "/ as sysdba"'
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    return $startInfo
}

function New-LocalOracleBootstrapInput {
    param(
        [Parameter(Mandatory = $true)]
        [string] $BootstrapPath,

        [Parameter(Mandatory = $true)]
        [string] $DevPassword,

        [Parameter(Mandatory = $true)]
        [string] $TestPassword
    )

    if ($BootstrapPath.Contains('"')) {
        throw 'Oracle bootstrap path cannot contain a double quote.'
    }

    return @"
SET ECHO OFF
SET VERIFY OFF
SET TERMOUT OFF
DEFINE dev_password = '$DevPassword'
DEFINE test_password = '$TestPassword'
@"$BootstrapPath"
EXIT
"@
}

if ($LoadFunctionsOnly) {
    return
}

$devSecure = Read-Host 'SLOW_DATING_DEV password' -AsSecureString
$testSecure = Read-Host 'SLOW_DATING_TEST password' -AsSecureString
$devPassword = [Net.NetworkCredential]::new('', $devSecure).Password
$testPassword = [Net.NetworkCredential]::new('', $testSecure).Password
$process = $null
$sqlPlusInput = $null

try {
    if (-not (Test-LocalOracleBootstrapPassword $devPassword)) {
        throw 'SLOW_DATING_DEV password must be 12-128 characters of A-Z, a-z, 0-9, underscore, or hyphen.'
    }
    if (-not (Test-LocalOracleBootstrapPassword $testPassword)) {
        throw 'SLOW_DATING_TEST password must be 12-128 characters of A-Z, a-z, 0-9, underscore, or hyphen.'
    }

    $repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
    $bootstrap = (Resolve-Path (Join-Path $repositoryRoot 'infra\oracle\bootstrap\001_create_local_users.sql')).Path
    $sqlPlusInput = New-LocalOracleBootstrapInput `
        -BootstrapPath $bootstrap `
        -DevPassword $devPassword `
        -TestPassword $testPassword
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = New-LocalOracleBootstrapStartInfo
    if (-not $process.Start()) {
        throw 'Oracle local-user bootstrap process did not start.'
    }
    $standardOutput = $process.StandardOutput.ReadToEndAsync()
    $standardError = $process.StandardError.ReadToEndAsync()
    $process.StandardInput.Write($sqlPlusInput)
    $process.StandardInput.Close()
    $process.WaitForExit()
    $standardOutput.GetAwaiter().GetResult() | Out-Null
    $standardError.GetAwaiter().GetResult() | Out-Null
    if ($process.ExitCode -ne 0) {
        throw "Oracle local-user bootstrap failed with exit code $($process.ExitCode)."
    }
}
finally {
    if ($null -ne $process) {
        $process.Dispose()
    }
    Remove-Variable devPassword, testPassword, sqlPlusInput -ErrorAction SilentlyContinue
}
