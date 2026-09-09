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
- The two local Oracle passwords must each be 12-128 characters using only `A-Z`, `a-z`, `0-9`, underscore, or hyphen. This intentionally excludes quotes, whitespace, and SQL metacharacters so SQL*Plus substitution is deterministic.
- `JWT_ACCESS_SECRET`, `OTP_PEPPER`, and `REFRESH_TOKEN_PEPPER` must each be at least 32 characters and must be local development values, never production secrets.

Do not commit `.env`, paste its values into issue trackers, or reuse production credentials locally.

## Bootstrap XEPDB1 users

The bootstrap is idempotent: it creates or updates the two local schema users, grants only the required development privileges, and gives them quota on `USERS`. Run it as a local Oracle administrator. The wrapper prompts without echoing values, validates the conservative password policy, and sends the password definitions through redirected SQL*Plus standard input. Passwords are never process arguments, and captured SQL*Plus output is discarded rather than logged. The wrapper stops on a nonzero SQL*Plus result:

```powershell
Set-Location D:\path\to\blindinbox
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\bootstrap-local-oracle.ps1
```

Use the same two selected passwords in the corresponding ignored `.env` aliases. The script switches the administrator session to `XEPDB1`; do not create these users in the root container.

## Apply migrations

The guarded DEV migration requires `NODE_ENV=development`, a configured `SLOW_DATING_DEV` user, and an Oracle session whose `USER` and `CURRENT_SCHEMA` are both `SLOW_DATING_DEV`. With the default `.env`, run it twice to confirm the no-op path:

```powershell
Set-Location D:\path\to\blindinbox
npm.cmd --prefix .\apps\api run migrate:dev
npm.cmd --prefix .\apps\api run migrate:dev
```

The second invocation is a no-op. A nonzero exit indicates invalid configuration, an unreachable database, or a migration failure. The CLI intentionally does not print connection details or credentials.

Oracle DDL commits implicitly, so migrations do not claim transactional rollback. The runner records `STARTED` and `APPLIED` states, checks migration-owned objects before executing an unapplied version, and stops with a partial-migration error instead of blindly continuing when DDL and the applied marker disagree.

For this learning project, recovery is an explicit clean-schema reset supported only for the canonical local DEV and TEST users. These commands delete all migration-owned data in the selected local schema, rebuild it, and never run automatically or against production:

```powershell
# Destructive: local SLOW_DATING_DEV data is removed.
npm.cmd --prefix .\apps\api run migrate:recover:dev

# Destructive: local SLOW_DATING_TEST data is removed.
npm.cmd --prefix .\apps\api run migrate:recover:test
```

Use a recovery command only after the runner reports partial migration state. Back up any local data you need first. Production recovery requires a separately reviewed operational procedure; neither local recovery command accepts a production environment or schema.

Oracle integration and end-to-end tests require the exact `SLOW_DATING_TEST` TEST alias, remap only the explicit TEST credentials inside the test process, and verify connected `USER` and `CURRENT_SCHEMA` before the migration runner or destructive cleanup can execute:

```powershell
Set-Location D:\path\to\blindinbox
npm.cmd --prefix .\apps\api run test:integration
npm.cmd --prefix .\apps\api run test:e2e
```

Never point the TEST aliases at `SLOW_DATING_DEV`: the test suites delete and replace test-owned rows. CI does not receive Oracle credentials and runs only the database-independent unit suite.

If the development API reports `ORA-00942`, rerun `npm.cmd run migrate:dev` with the DEV aliases active. Do not solve it by pointing development at the TEST schema.

## Start the API and Android app

Use two terminals so the API remains running while Flutter attaches to the emulator. In both terminals, first enter the repository root.

### Terminal 1: API

```powershell
Set-Location D:\path\to\blindinbox
npm.cmd --prefix .\apps\api run start:dev
```

The default API is available at `http://localhost:3000/v1`. Check liveness at `http://localhost:3000/v1/health/live` and Oracle readiness at `http://localhost:3000/v1/health/ready`.

In `NODE_ENV=development`, requesting a sign-in code writes one `Development OTP ...` line to the API console with a masked phone number. Read the code directly from that terminal and enter it in the emulator. Do not redirect, retain, screenshot, or share OTP output. The provider does not emit OTPs in production, and no production SMS or secrets are needed for local development.

Stop the API with `Ctrl+C` when finished so no background process or OTP console remains.

### Terminal 2: Android app

Start an Android Virtual Device, confirm its identifier with `flutter devices`, then in Terminal 2 run:

```powershell
Set-Location D:\path\to\blindinbox
Set-Location .\apps\mobile
flutter run -d emulator-5554 --dart-define=API_BASE_URL=http://10.0.2.2:3000/v1
```

`10.0.2.2` is the Android emulator route to the Windows host. Use `http://localhost:3000/v1` for Windows, web, or tests running directly on the host. Sign in, complete an 18+ profile, then stop and relaunch the app to verify refresh-session and Oracle-backed profile restoration.

## Run the local quality gate

The gate derives the repository root from its own location. From any directory, pass its absolute path; from the repository root, the root-relative form is valid:

```powershell
powershell -ExecutionPolicy Bypass -File D:\path\to\blindinbox\scripts\check.ps1
# Or, after: Set-Location D:\path\to\blindinbox
powershell -ExecutionPolicy Bypass -File .\scripts\check.ps1
```

It stops on the first failure and runs API lint/build/unit tests, guarded DEV migration, TEST Oracle integration/e2e (each destructive cleanup checks the canonical TEST session schema), OpenAPI drift, Flutter format/analyze/tests, and an Android debug build.

If Flutter reports that it cannot open its SDK cache lockfile, do not change SDK permissions from another account. Sign in as the Windows account that owns the Flutter SDK, enter the repository root, and rerun the Flutter checks there:

```powershell
Set-Location D:\path\to\blindinbox
flutter doctor -v
Set-Location .\apps\mobile
flutter test
```

## Record the Plan 1 exit gate as the owning Windows account

The final exit gate must be run after the candidate commit by the Windows account that owns the Flutter SDK and Git worktree. Run these commands from that account; do not substitute results from a different user context:

```powershell
$repositoryRoot = git rev-parse --show-toplevel
Set-Location $repositoryRoot
flutter doctor -v
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\check.ps1
git status --short
```

`flutter doctor -v` and `check.ps1` must exit successfully, and `git status --short` must print nothing. Keep the complete command output as the automated gate evidence, but remove local paths or identifiers before sharing it. The check script includes the guarded DEV migration, API lint/build/unit/integration/e2e/OpenAPI drift, Flutter format/analyze/tests, and the Android debug build. Run the two explicit `migrate:dev` commands in the earlier migration section to record the required second-run no-op separately.

The emulator evidence is separate and cannot be replaced by widget tests. Keep the API running in Terminal 1:

```powershell
$repositoryRoot = git rev-parse --show-toplevel
Set-Location $repositoryRoot
npm.cmd --prefix .\apps\api run start:dev
```

In Terminal 2, launch the already-created Android emulator and install the app against the real local DEV API:

```powershell
$repositoryRoot = git rev-parse --show-toplevel
Set-Location $repositoryRoot
flutter devices
Set-Location .\apps\mobile
flutter run -d emulator-5554 --dart-define=API_BASE_URL=http://10.0.2.2:3000/v1
```

Use two distinct Vietnamese development phone numbers that the owner is authorized to use; do not put either number or either OTP in the evidence. For account A, read its development OTP only from Terminal 1, complete a profile with an adult birth date, and confirm the app reaches Home. Quit `flutter run`, then force-stop and relaunch the installed process:

```powershell
adb.exe -s emulator-5554 shell am force-stop com.quan.blindinbox
adb.exe -s emulator-5554 shell monkey -p com.quan.blindinbox -c android.intent.category.LAUNCHER 1
```

Confirm account A returns to Home without entering another OTP. This exercises secure refresh-token restoration, refresh rotation, and the authenticated profile fetch. Then clear only this DEV app's local data, relaunch it, and repeat the sign-in/profile/restart check with distinct account B:

```powershell
# Destructive only to the emulator's com.quan.blindinbox application data.
adb.exe -s emulator-5554 shell pm clear com.quan.blindinbox
adb.exe -s emulator-5554 shell monkey -p com.quan.blindinbox -c android.intent.category.LAUNCHER 1
```

After account B also returns to Home following the same force-stop/relaunch commands, inspect aggregate DEV state without printing phone numbers, tokens, OTPs, or profile text. SQL*Plus prompts interactively for the local DEV password; do not place it on the command line:

```powershell
sqlplus.exe SLOW_DATING_DEV@localhost:1521/XEPDB1
```

Run this query inside SQL*Plus:

```sql
WITH smoke_profiles AS (
  SELECT p.user_id, p.birth_date
  FROM profiles p
  ORDER BY p.updated_at DESC
  FETCH FIRST 2 ROWS ONLY
)
SELECT
  COUNT(*) AS profile_count,
  SUM(CASE
        WHEN sp.birth_date <= ADD_MONTHS(
          TRUNC(CAST(SYS_EXTRACT_UTC(SYSTIMESTAMP) AS DATE)), -216
        ) THEN 1 ELSE 0
      END) AS adult_profile_count,
  SUM(CASE WHEN u.identity_status = 'NOT_STARTED' THEN 1 ELSE 0 END)
    AS kyc_not_started_count,
  SUM((SELECT COUNT(*) FROM refresh_sessions rs
       WHERE rs.user_id = sp.user_id)) AS total_session_count,
  SUM((SELECT COUNT(*) FROM refresh_sessions rs
       WHERE rs.user_id = sp.user_id
         AND rs.revoked_at IS NOT NULL)) AS revoked_session_count,
  SUM((SELECT COUNT(*) FROM refresh_sessions rs
       WHERE rs.user_id = sp.user_id
         AND rs.revoked_at IS NULL
         AND rs.expires_at > SYSTIMESTAMP)) AS active_session_count
FROM smoke_profiles sp
JOIN app_users u ON u.id = sp.user_id;
```

For two newly completed and restarted accounts, record `PROFILE_COUNT=2`, `ADULT_PROFILE_COUNT=2`, `KYC_NOT_STARTED_COUNT=2`, `ACTIVE_SESSION_COUNT=2`, `TOTAL_SESSION_COUNT>=4`, and `REVOKED_SESSION_COUNT>=2`. Larger total/revoked counts are valid after extra restarts. Do not claim the exit gate from source review alone; record the actual owner-run outputs and emulator observations after the final commit.

## Service boundary note

Oracle XE is the only datastore required by this slice. MongoDB and MinIO are planned for later chat/media work and should eventually run as separately configured Docker services. Do not add or start them for foundation/auth/profile development.
