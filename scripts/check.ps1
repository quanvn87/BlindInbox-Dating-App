$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$apiRoot = Join-Path $repositoryRoot 'apps\api'
$mobileRoot = Join-Path $repositoryRoot 'apps\mobile'

function Invoke-GateCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Name,

        [Parameter(Mandatory = $true)]
        [string] $WorkingDirectory,

        [Parameter(Mandatory = $true)]
        [string] $FilePath,

        [Parameter(Mandatory = $true)]
        [string[]] $ArgumentList
    )

    Write-Host "`n==> $Name"
    Push-Location $WorkingDirectory
    try {
        & $FilePath @ArgumentList
        if ($LASTEXITCODE -ne 0) {
            throw "$Name failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
}

Invoke-GateCommand 'API lint' $apiRoot 'npm.cmd' @('run', 'lint')
Invoke-GateCommand 'API build' $apiRoot 'npm.cmd' @('run', 'build')
Invoke-GateCommand 'API database-independent unit tests' $apiRoot 'npm.cmd' @('run', 'test:unit', '--', '--runInBand')
Invoke-GateCommand 'Oracle bootstrap password policy tests' $repositoryRoot 'powershell.exe' @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $repositoryRoot 'scripts\test-bootstrap-password-policy.ps1'))
Invoke-GateCommand 'Guarded DEV Oracle migration' $apiRoot 'npm.cmd' @('run', 'migrate:dev')
Invoke-GateCommand 'TEST Oracle integration tests' $apiRoot 'npm.cmd' @('run', 'test:integration')
Invoke-GateCommand 'TEST Oracle end-to-end tests' $apiRoot 'npm.cmd' @('run', 'test:e2e')
Invoke-GateCommand 'OpenAPI generation and drift check' $apiRoot 'npm.cmd' @('run', 'openapi:check')

Invoke-GateCommand 'Flutter format check' $mobileRoot 'dart.bat' @('format', '--output=none', '--set-exit-if-changed', 'lib', 'test')
Invoke-GateCommand 'Flutter analysis' $mobileRoot 'flutter.bat' @('analyze')
Invoke-GateCommand 'Flutter unit and widget tests' $mobileRoot 'flutter.bat' @('test')
Invoke-GateCommand 'Android debug build' $mobileRoot 'flutter.bat' @('build', 'apk', '--debug')

Write-Host "`nQuality gate passed."
