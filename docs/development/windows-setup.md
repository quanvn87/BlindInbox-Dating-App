# Windows development setup

This guide provisions the foundation/auth/profile slice on Windows with Oracle XE. All commands assume PowerShell unless noted otherwise.

## Prerequisites

- Windows 10 or 11, Git, and PowerShell.
- Node.js 24 with npm 11.
- Flutter 3.47 (Dart 3.13), Android Studio, an Android SDK, and an Android emulator.
- Oracle Database XE 21c with the `XEPDB1` pluggable database and SQL*Plus on `PATH`.
- Windows Developer Mode enabled under **Settings > Privacy & security > For developers**. Flutter plugins use symlinks; Windows desktop/plugin builds can fail without this setting.

Confirm the toolchain before provisioning:

```powershell
node --version
npm --version
flutter doctor -v
sqlplus -v
```

`flutter doctor -v` should report no issues. Start the Oracle XE service and listener if they are not already running.

## Install dependencies and create the local environment

From the repository root:

```powershell
npm.cmd --prefix apps/api ci
Push-Location apps/mobile
flutter pub get
Pop-Location
Copy-Item apps/api/.env.example apps/api/.env
```

Edit the ignored `apps/api/.env`. Keep the aliases separate:

- `ORACLE_USER`, `ORACLE_PASSWORD`, and `ORACLE_CONNECT_STRING` target `SLOW_DATING_DEV` in `XEPDB1`.
- `ORACLE_TEST_USER`, `ORACLE_TEST_PASSWORD`, and `ORACLE_TEST_CONNECT_STRING` target only `SLOW_DATING_TEST` in `XEPDB1`.
- `JWT_ACCESS_SECRET`, `OTP_PEPPER`, and `REFRESH_TOKEN_PEPPER` must each be at least 32 characters and must be local development values, never production secrets.

Do not commit `.env`, paste its values into issue trackers, or reuse production credentials locally.

## Bootstrap XEPDB1 users

The bootstrap is idempotent: it creates or updates the two local schema users, grants only the required development privileges, and gives them quota on `USERS`. Run SQL*Plus as a local Oracle administrator. The following prompt keeps passwords out of shell history and process arguments:

```powershell
$devSecure = Read-Host 'SLOW_DATING_DEV password' -AsSecureString
$testSecure = Read-Host 'SLOW_DATING_TEST password' -AsSecureString
$devPassword = [Net.NetworkCredential]::new('', $devSecure).Password
$testPassword = [Net.NetworkCredential]::new('', $testSecure).Password
$bootstrap = (Resolve-Path 'infra/oracle/bootstrap/001_create_local_users.sql').Path
$sql = "@`"$bootstrap`" `"$devPassword`" `"$testPassword`"`n"
$sql | sqlplus.exe -s '/ as sysdba'
Remove-Variable devPassword, testPassword, sql
```

Use the same two selected passwords in the corresponding ignored `.env` aliases. The script switches the administrator session to `XEPDB1`; do not create these users in the root container.

## Apply migrations

The migration command always targets the current `ORACLE_USER`/`ORACLE_PASSWORD`/`ORACLE_CONNECT_STRING`. With the default `.env`, that is `SLOW_DATING_DEV`:

```powershell
Push-Location apps/api
npm.cmd run migrate
npm.cmd run migrate
Pop-Location
```

The second invocation is a no-op. A nonzero exit indicates invalid configuration, an unreachable database, or a migration failure. The CLI intentionally does not print connection details or credentials.

Oracle integration and end-to-end tests load only the explicit TEST aliases, remap them to the application configuration inside the test process, and apply the same migrations:

```powershell
Push-Location apps/api
npm.cmd run test:integration
npm.cmd run test:e2e
Pop-Location
```

Never point the TEST aliases at `SLOW_DATING_DEV`: the test suites delete and replace test-owned rows. CI does not receive Oracle credentials and runs only the database-independent unit suite.

If the development API reports `ORA-00942`, rerun `npm.cmd run migrate` with the DEV aliases active. Do not solve it by pointing development at the TEST schema.

## Start the API

```powershell
Push-Location apps/api
npm.cmd run start:dev
```

The default API is available at `http://localhost:3000/v1`. Check liveness at `http://localhost:3000/v1/health/live` and Oracle readiness at `http://localhost:3000/v1/health/ready`.

In `NODE_ENV=development`, requesting a sign-in code writes one `Development OTP ...` line to the API console with a masked phone number. Read the code directly from that terminal and enter it in the emulator. Do not redirect, retain, screenshot, or share OTP output. The provider does not emit OTPs in production, and no production SMS or secrets are needed for local development.

Stop the API with `Ctrl+C` when finished so no background process or OTP console remains.

## Start the Android app

Start an Android Virtual Device, confirm its identifier with `flutter devices`, and run:

```powershell
Push-Location apps/mobile
flutter run -d emulator-5554 --dart-define=API_BASE_URL=http://10.0.2.2:3000/v1
Pop-Location
```

`10.0.2.2` is the Android emulator route to the Windows host. Use `http://localhost:3000/v1` for Windows, web, or tests running directly on the host. Sign in, complete an 18+ profile, then stop and relaunch the app to verify refresh-session and Oracle-backed profile restoration.

## Run the local quality gate

The gate derives the repository root from its own location, so it can be launched from any working directory:

```powershell
powershell -ExecutionPolicy Bypass -File D:\path\to\slow-dating\scripts\check.ps1
```

It stops on the first failure and runs API lint/build/unit tests, DEV migration, TEST Oracle integration/e2e, OpenAPI drift, Flutter format/analyze/tests, and an Android debug build.

## Service boundary note

Oracle XE is the only datastore required by this slice. MongoDB and MinIO are planned for later chat/media work and should eventually run as separately configured Docker services. Do not add or start them for foundation/auth/profile development.
