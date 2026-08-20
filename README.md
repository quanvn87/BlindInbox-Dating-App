# Slow Dating

Slow Dating is an 18+ Flutter and NestJS application. This repository currently implements the first vertical slice: development OTP authentication, revocable sessions, inclusive profile onboarding, and Oracle-backed profile persistence. Matching, chat, media, and production identity verification are intentionally out of scope.

## Architecture

- `apps/api`: NestJS 11 modular monolith on Node.js 24. Auth and profile repositories use Oracle XE through `node-oracledb` Thin mode.
- `apps/mobile`: Flutter 3.47 client for Android, iOS, web, and Windows. Android is the first completed runtime target; the other platform scaffolds remain intact.
- `infra/oracle`: parameterized local schema bootstrap plus ordered, idempotent SQL migrations.
- `docs/openapi`: deterministic OpenAPI contract generated from the NestJS application.

The API owns authentication and profile invariants. Flutter consumes the versioned REST contract through one API client, keeps access tokens in memory, and stores only refresh tokens in platform secure storage.

## Quick start on Windows

Install Node.js 24, Flutter 3.47, Android tooling, and Oracle XE 21c. Then follow [Windows development setup](docs/development/windows-setup.md) to bootstrap `XEPDB1`, create the ignored `.env`, migrate the DEV schema, and launch the API and emulator.

After local Oracle aliases are configured, run the complete gate from the repository root or any other directory:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check.ps1
```

## Common commands

API commands run in `apps/api`:

```powershell
npm.cmd ci
npm.cmd run migrate
npm.cmd run start:dev
npm.cmd run lint
npm.cmd run build
npm.cmd run test:unit
npm.cmd run test:integration
npm.cmd run test:e2e
npm.cmd run openapi:check
```

Flutter commands run in `apps/mobile`:

```powershell
flutter pub get
dart format --output=none --set-exit-if-changed lib test
flutter analyze
flutter test
flutter build apk --debug
flutter run -d emulator-5554 --dart-define=API_BASE_URL=http://10.0.2.2:3000/v1
```

GitHub Actions deliberately runs no Oracle-dependent test: it checks API lint/build/unit/OpenAPI drift and Flutter format/analyze/tests with no database credentials. Real `SLOW_DATING_TEST` integration and e2e results from `scripts/check.ps1` are required local pull-request evidence.

## Security and data boundaries

- Every user and connection intent is 18+; friendship or conversation does not bypass the age rule.
- Gender identity and interested-in genders are independent profile fields.
- Oracle stores OTP HMAC digests, never plaintext OTPs. Development OTP console output is local and disabled in production.
- Access tokens last 15 minutes and remain in memory. Refresh tokens last 30 days, are stored as digests server-side, and can be revoked by device session.
- KYC/identity status remains `NOT_STARTED` until a real provider completes verification. This slice stores no identity-document image or selfie video and never infers gender from identity evidence.
- DEV and TEST use separate Oracle users. Tests must never target the DEV schema; CI receives neither schema's credentials.
- `.env`, OTPs, access tokens, refresh tokens, and local phone numbers must not be committed or attached to logs.
- MongoDB/MinIO, GPS, matching, chat, WebSockets, and media are later roadmap work, not hidden dependencies of this slice.

## Project documents

- [Product and architecture design](docs/superpowers/specs/2026-08-14-slow-dating-messaging-app-design.md)
- [Foundation/auth/profile implementation plan](docs/superpowers/plans/2026-08-18-foundation-auth-profile.md)
- [Project roadmap](docs/superpowers/plans/2026-08-17-slow-dating-app-roadmap.md)
- [Windows setup and operations](docs/development/windows-setup.md)
- [Generated OpenAPI contract](docs/openapi/slow-dating-v1.json)
