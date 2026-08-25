# Foundation, Auth and Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox ('- [ ]') syntax for tracking.

**Goal:** Tạo vertical slice đầu tiên để hai client Flutter đăng nhập bằng development OTP qua NestJS thật, lưu dữ liệu trong Oracle XE và hoàn tất hồ sơ/tiêu chí kết nối 18+ trên Android.

**Architecture:** Repository chứa NestJS modular monolith và Flutter multi-platform client trong 'apps/'. Auth/profile dùng Oracle XE qua node-oracledb Thin mode; REST contract được xuất thành OpenAPI và Flutter dùng một API client tập trung.

**Tech Stack:** Node.js 24 LTS, npm 11, NestJS 11, TypeScript, Oracle XE 21c, Jest/Supertest, Flutter 3.47, Dart 3.13, Riverpod, GoRouter, Dio, Flutter Secure Storage.

## Global Constraints

- Toàn bộ ứng dụng chỉ dành cho người từ 18 tuổi, kể cả mục đích bạn bè hoặc nói chuyện.
- Android là target hoàn thiện đầu tiên; project vẫn tạo target iOS, web và Windows.
- 'gender_identity' và 'interested_in_genders' là hai dữ liệu độc lập.
- KYC không suy đoán giới tính từ CCCD, ảnh hoặc khuôn mặt.
- Access token sống 15 phút; refresh token sống 30 ngày và có thể thu hồi theo thiết bị.
- OTP development sống 5 phút, tối đa 5 lần thử và không được ghi plaintext vào Oracle.
- Mọi timestamp ghi UTC; API dùng ISO-8601 có hậu tố Z.
- Mọi command có side effect nhận header 'Idempotency-Key' dạng UUID.
- Không lưu secret trong Git; '.env' luôn bị ignore.
- Unit test được dùng fake repository; integration test phải chạy Oracle XE thật.
- Không thêm MongoDB, MinIO, Redis, GPS, matching, WebSocket hoặc media trong plan này.

---

## Planned File Map

~~~text
apps/
  api/
    src/
      common/config/env.schema.ts
      common/database/oracle.module.ts
      common/database/oracle.service.ts
      common/database/migration-runner.ts
      common/http/idempotency-key.pipe.ts
      modules/health/
      modules/auth/
      modules/profile/
      app.module.ts
      main.ts
    test/
  mobile/
    lib/
      app/
      core/api/
      core/auth/
      features/auth/
      features/profile/
      main.dart
    test/
infra/
  oracle/bootstrap/001_create_local_users.sql
  oracle/migrations/001_auth.sql
  oracle/migrations/002_profile_catalog.sql
  oracle/migrations/003_profile.sql
  seeds/vn_locations.sample.json
docs/openapi/slow-dating-v1.json
scripts/check.ps1
~~~

## Stable Interfaces

~~~ts
export type GenderCode = 'MAN' | 'WOMAN' | 'NON_BINARY' | 'SELF_DESCRIBED';
export type ConnectionIntent =
  | 'CASUAL_CONVERSATION'
  | 'FRIENDSHIP'
  | 'LONG_TERM_DATING'
  | 'SHORT_TERM_DATING'
  | 'OPEN_TO_EXPLORE';

export interface AuthTokens {
  accessToken: string;
  accessExpiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
}

export interface ProfileInput {
  displayName: string;
  birthDate: string;
  genderIdentity: GenderCode;
  genderLabel: string | null;
  interestedInGenders: GenderCode[];
  connectionIntents: ConnectionIntent[];
  heightCm: number | null;
  hometownLocationCode: string | null;
  homeLocationCode: string;
  bio: string;
  favoriteSongTitle: string | null;
  favoriteSongArtist: string | null;
  promptAnswers: Array<{ promptCode: string; answer: string }>;
}
~~~

### Task 1: NestJS Liveness Slice

**Files:**
- Create: 'apps/api/**' with Nest CLI
- Create: 'apps/api/src/common/config/env.schema.ts'
- Create: 'apps/api/src/modules/health/health.controller.ts'
- Create: 'apps/api/src/modules/health/health.module.ts'
- Modify: 'apps/api/src/app.module.ts'
- Modify: 'apps/api/src/main.ts'
- Test: 'apps/api/test/health.e2e-spec.ts'

**Interfaces:**
- Consumes: Node.js 24 and npm 11.
- Produces: 'GET /v1/health/live -> { status: "ok", timestamp: string }'.

- [ ] **Step 1: Scaffold the strict application**

~~~powershell
npx.cmd @nestjs/cli@11 new apps/api --package-manager npm --skip-git --strict
Set-Location apps/api
npm.cmd install @nestjs/config@4 zod@4
~~~

Expected: generated test passes.

- [ ] **Step 2: Write the failing liveness test**

~~~ts
it('returns a UTC liveness timestamp', async () => {
  const response = await request(app.getHttpServer())
    .get('/v1/health/live')
    .expect(200);
  expect(response.body.status).toBe('ok');
  expect(response.body.timestamp).toMatch(/Z$/);
});
~~~

- [ ] **Step 3: Run it and verify failure**

Run: 'npm.cmd run test:e2e -- --runInBand'

Expected: FAIL with HTTP 404.

- [ ] **Step 4: Implement config and route**

Validate 'NODE_ENV', 'PORT', 'ORACLE_USER', 'ORACLE_PASSWORD', 'ORACLE_CONNECT_STRING', 'JWT_ACCESS_SECRET', 'OTP_PEPPER' and 'REFRESH_TOKEN_PEPPER' with Zod. Set global prefix 'v1' and a global ValidationPipe. Health returns 'new Date().toISOString()'.

Create '.env.example':

~~~dotenv
NODE_ENV=development
PORT=3000
ORACLE_USER=SLOW_DATING_DEV
ORACLE_PASSWORD=replace-with-your-local-oracle-password
ORACLE_CONNECT_STRING=localhost:1521/XEPDB1
JWT_ACCESS_SECRET=replace-with-your-local-jwt-access-secret
OTP_PEPPER=replace-with-your-local-otp-pepper-value
REFRESH_TOKEN_PEPPER=replace-with-your-local-refresh-token-pepper
~~~

- [ ] **Step 5: Verify and commit**

~~~powershell
npm.cmd run lint
npm.cmd run test:e2e -- --runInBand
git add apps/api
git commit -m "feat(api): scaffold health endpoint"
~~~

### Task 2: Oracle Pool and Versioned Migrations

**Files:**
- Create: 'apps/api/src/common/database/oracle.service.ts'
- Create: 'apps/api/src/common/database/oracle.module.ts'
- Create: 'apps/api/src/common/database/migration-runner.ts'
- Create: 'infra/oracle/bootstrap/001_create_local_users.sql'
- Create: 'infra/oracle/migrations/001_auth.sql'
- Test: 'apps/api/test/oracle.integration-spec.ts'
- Modify: 'apps/api/src/modules/health/health.controller.ts'
- Modify: 'apps/api/src/modules/health/health.module.ts'

**Interfaces:**
- Produces: 'withConnection<T>', 'withTransaction<T>', 'ping()', 'GET /v1/health/ready'.

- [ ] **Step 1: Install driver and define local schemas**

Run: 'npm.cmd install oracledb@6'.

Bootstrap SQL creates 'SLOW_DATING_DEV' and 'SLOW_DATING_TEST' in XEPDB1, receiving the selected dev/test passwords through redirected SQL*Plus standard input rather than process arguments. Developers store selected values only in ignored `.env` files or local environment variables; no fixed Oracle passwords are committed or logged. The bootstrap grants CREATE SESSION/TABLE/SEQUENCE/VIEW and quota on USERS.

- [ ] **Step 2: Write a failing real-Oracle test**

The test calls 'ping()', runs migrations twice and asserts:

~~~sql
SELECT version FROM schema_migrations ORDER BY version
~~~

returns exactly one row named '001_auth'.

- [ ] **Step 3: Run test before implementation**

~~~powershell
$env:ORACLE_TEST_USER='SLOW_DATING_TEST'
$env:ORACLE_TEST_PASSWORD='<your-local-test-oracle-password>'
$env:ORACLE_CONNECT_STRING='localhost:1521/XEPDB1'
npm.cmd test -- oracle.integration-spec.ts --runInBand
~~~

Test setup maps only these explicit TEST aliases to runtime Oracle credentials, requires the exact `SLOW_DATING_TEST` user, and verifies connected `USER` and `CURRENT_SCHEMA` before migration or cleanup, preventing DEV fallback.

Expected: FAIL because service/table is missing.

- [ ] **Step 4: Implement pool, transaction and migration runner**

Use Thin mode and pool min 1/max 5. Application DML transactions commit success, roll back errors and always close. Oracle DDL commits implicitly: the migration runner records `STARTED`/`APPLIED`, detects objects left by an unapplied migration, stops instead of blindly continuing, and supports only an explicit destructive DEV/TEST clean-schema recovery. It never implies DDL rollback or performs production recovery automatically. Split migrations only on a line '-- statement'. '001_auth.sql' creates:

~~~sql
CREATE TABLE schema_migrations (
  version VARCHAR2(100) PRIMARY KEY,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT SYS_EXTRACT_UTC(SYSTIMESTAMP) NOT NULL
)
-- statement
CREATE TABLE app_users (
  id VARCHAR2(36) PRIMARY KEY,
  phone_e164 VARCHAR2(20) NOT NULL UNIQUE,
  status VARCHAR2(20) DEFAULT 'ACTIVE' NOT NULL,
  identity_status VARCHAR2(20) DEFAULT 'NOT_STARTED' NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT SYS_EXTRACT_UTC(SYSTIMESTAMP) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT SYS_EXTRACT_UTC(SYSTIMESTAMP) NOT NULL,
  CONSTRAINT ck_user_status CHECK (status IN ('ACTIVE','SUSPENDED','DELETED')),
  CONSTRAINT ck_identity_status CHECK (identity_status IN ('NOT_STARTED','PENDING','VERIFIED','REJECTED'))
)
-- statement
CREATE TABLE otp_challenges (
  id VARCHAR2(36) PRIMARY KEY,
  phone_e164 VARCHAR2(20) NOT NULL,
  code_digest VARCHAR2(64) NOT NULL,
  attempts NUMBER(2) DEFAULT 0 NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  consumed_at TIMESTAMP WITH TIME ZONE NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT SYS_EXTRACT_UTC(SYSTIMESTAMP) NOT NULL
)
-- statement
CREATE INDEX ix_otp_phone_created ON otp_challenges(phone_e164, created_at)
-- statement
CREATE TABLE refresh_sessions (
  id VARCHAR2(36) PRIMARY KEY,
  user_id VARCHAR2(36) NOT NULL REFERENCES app_users(id),
  token_digest VARCHAR2(64) NOT NULL UNIQUE,
  device_name VARCHAR2(120) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  revoked_at TIMESTAMP WITH TIME ZONE NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT SYS_EXTRACT_UTC(SYSTIMESTAMP) NOT NULL
)
~~~

- [ ] **Step 5: Verify idempotency/readiness and commit**

Expected readiness: '{ "status": "ready", "oracle": "up" }'.

~~~powershell
git add apps/api infra/oracle
git commit -m "feat(api): add Oracle migration infrastructure"
~~~

### Task 3: OTP and Token Domain

**Files:**
- Create: 'apps/api/src/modules/auth/auth.types.ts'
- Create: 'apps/api/src/modules/auth/auth.repository.ts'
- Create: 'apps/api/src/modules/auth/otp.provider.ts'
- Create: 'apps/api/src/modules/auth/development-otp.provider.ts'
- Create: 'apps/api/src/modules/auth/token.service.ts'
- Create: 'apps/api/src/modules/auth/auth.service.ts'
- Test: 'apps/api/src/modules/auth/auth.service.spec.ts'

**Interfaces:**
- Produces: 'requestOtp', 'verifyOtp', 'refresh', 'logout', and 'OtpProvider.send(phoneE164, code)'.

- [ ] **Step 1: Write failing tests**

Cover normalized Vietnamese phone, five wrong attempts, five-minute expiry, consumed challenge replay and refresh rotation.

- [ ] **Step 2: Run and verify missing-service failure**

Run: 'npm.cmd test -- auth.service.spec.ts --runInBand'.

- [ ] **Step 3: Implement OTP generation and hashing**

Generate six digits with Node randomInt. Store only:

~~~ts
createHmac('sha256', otpPepper)
  .update(challengeId + ':' + code)
  .digest('hex');
~~~

Development provider logs a masked phone and code only in development/test.

- [ ] **Step 4: Implement token rules**

JWT claims are 'sub', 'sessionId', 'status' with 15-minute expiry. Refresh token is 32 random bytes base64url, digest stored in Oracle, expires after 30 days; rotation revokes old and creates new in one transaction.

- [ ] **Step 5: Verify and commit**

~~~powershell
npm.cmd test -- auth.service.spec.ts --runInBand
git add apps/api/src/modules/auth
git commit -m "feat(api): add OTP and token domain logic"
~~~

### Task 4: Auth Oracle Adapter and HTTP API

**Files:**
- Create: 'apps/api/src/modules/auth/oracle-auth.repository.ts'
- Create: 'apps/api/src/modules/auth/dto/request-otp.dto.ts'
- Create: 'apps/api/src/modules/auth/dto/verify-otp.dto.ts'
- Create: 'apps/api/src/modules/auth/dto/refresh-token.dto.ts'
- Create: 'apps/api/src/modules/auth/dto/logout.dto.ts'
- Create: 'apps/api/src/modules/auth/auth.controller.ts'
- Create: 'apps/api/src/modules/auth/auth.module.ts'
- Create: 'apps/api/src/common/http/idempotency-key.pipe.ts'
- Test: 'apps/api/test/auth.integration-spec.ts'
- Test: 'apps/api/test/auth.e2e-spec.ts'

**Interfaces:**
- Produces: POST '/v1/auth/otp/request', '/otp/verify', '/refresh', '/logout'.

- [ ] **Step 1: Write failing contract tests**

Assert request 202, verify/refresh 200, logout 204, replay 409, malformed idempotency UUID 400. OTP response never includes code.

- [ ] **Step 2: Run and verify 404**

Run: 'npm.cmd run test:e2e -- auth.e2e-spec.ts --runInBand'.

- [ ] **Step 3: Implement bound SQL and controllers**

All Oracle queries use bind variables. Test obtains code by injecting 'CapturingOtpProvider'. Normalize with 'libphonenumber-js'.

- [ ] **Step 4: Verify persistence**

After rotation, exactly one refresh row is active; after logout, zero is active.

- [ ] **Step 5: Commit**

~~~powershell
git add apps/api
git commit -m "feat(api): expose Oracle-backed auth API"
~~~

### Task 5: Inclusive Profile Domain and Schema

**Files:**
- Create: 'infra/oracle/migrations/002_profile_catalog.sql'
- Create: 'infra/oracle/migrations/003_profile.sql'
- Create: 'infra/seeds/vn_locations.sample.json'
- Create: 'apps/api/src/modules/profile/profile.types.ts'
- Create: 'apps/api/src/modules/profile/profile.repository.ts'
- Create: 'apps/api/src/modules/profile/dto/upsert-profile.dto.ts'
- Create: 'apps/api/src/modules/profile/profile.service.ts'
- Test: 'apps/api/src/modules/profile/profile.service.spec.ts'

**Interfaces:**
- Produces: 'ProfileService.upsert(userId, input)' and stable catalog types.

- [ ] **Step 1: Write failing domain tests**

Use fixed UTC date 2026-08-18. Accept birth date 2008-08-18; reject 2008-08-19. Test MAN interested in MAN, non-empty gender/intent sets, SELF_DESCRIBED label rule and duplicate rejection.

- [ ] **Step 2: Run and verify failures**

Run: 'npm.cmd test -- profile.service.spec.ts --runInBand'.

- [ ] **Step 3: Create catalog/profile migrations**

Create canonical genders, five intent codes, 'location_nodes', 'profile_prompts', 'profiles', 'profile_interested_genders', 'profile_connection_intents' and 'profile_prompt_answers'. Use foreign keys and composite primary keys.

Seed sample:

~~~json
[
  {"code":"VN-HCM","name":"Thành phố Hồ Chí Minh","level":"PROVINCE","parentCode":null},
  {"code":"VN-HCM-Q1","name":"Quận 1","level":"DISTRICT","parentCode":"VN-HCM"},
  {"code":"VN-HCM-Q1-BT","name":"Phường Bến Thành","level":"WARD","parentCode":"VN-HCM-Q1"},
  {"code":"VN-HN","name":"Thành phố Hà Nội","level":"PROVINCE","parentCode":null}
]
~~~

- [ ] **Step 4: Implement validation**

Compute age by UTC year/month/day. Validate name 2–50, bio max 500, height null or 100–250, song fields both null or both present, prompt answers 1–280 and catalog selections active.

- [ ] **Step 5: Verify and commit**

~~~powershell
npm.cmd test -- profile.service.spec.ts --runInBand
git add apps/api infra
git commit -m "feat(profile): define inclusive profile domain"
~~~

### Task 6: Oracle Profile API

**Files:**
- Create: 'apps/api/src/modules/profile/oracle-profile.repository.ts'
- Create: 'apps/api/src/modules/profile/profile.controller.ts'
- Create: 'apps/api/src/modules/profile/profile.module.ts'
- Test: 'apps/api/test/profile.integration-spec.ts'
- Test: 'apps/api/test/profile.e2e-spec.ts'

**Interfaces:**
- Produces: GET '/v1/catalog/profile-options', GET/PUT '/v1/me/profile'.

- [ ] **Step 1: Write failing endpoint tests**

GET profile returns 404 before onboarding. PUT returns 200; identical PUT is idempotent; later GET deep-equals saved representation.

- [ ] **Step 2: Run and verify failures**

Run profile integration/e2e tests against 'SLOW_DATING_TEST'.

- [ ] **Step 3: Implement one-transaction replacement**

Upsert scalar row; replace interested genders, intents and prompt answers in one Oracle transaction. Never mark KYC verified.

- [ ] **Step 4: Verify inclusive example and rollback**

Persist MAN interested in MAN with FRIENDSHIP; force invalid prompt insert and prove no partial changes survive.

- [ ] **Step 5: Commit**

~~~powershell
git add apps/api
git commit -m "feat(profile): expose Oracle-backed profile API"
~~~

### Task 7: OpenAPI Contract

**Files:**
- Create: 'apps/api/src/openapi.ts'
- Create: 'apps/api/src/openapi.spec.ts'
- Create: 'docs/openapi/slow-dating-v1.json'
- Modify: 'apps/api/package.json'
- Modify: 'apps/api/src/modules/auth/dto/*.ts'
- Modify: 'apps/api/src/modules/profile/dto/upsert-profile.dto.ts'

**Interfaces:**
- Produces: deterministic 'docs/openapi/slow-dating-v1.json'.

- [ ] **Step 1: Install Swagger and write failing path/schema assertions**

Run: 'npm.cmd install @nestjs/swagger@11'. Assert every health/auth/catalog/profile path and AuthTokens/ProfileInput schemas.

- [ ] **Step 2: Verify export is missing**

Run: 'npm.cmd test -- openapi.spec.ts --runInBand'.

- [ ] **Step 3: Implement deterministic export**

Sort keys, configure bearer auth and Idempotency-Key header, add 'npm run openapi'.

- [ ] **Step 4: Generate twice and verify zero drift**

Run exporter twice and 'git diff --exit-code docs/openapi/slow-dating-v1.json'.

- [ ] **Step 5: Commit**

~~~powershell
git add apps/api docs/openapi
git commit -m "docs(api): publish auth and profile contract"
~~~

### Task 8: Flutter App Shell

**Files:**
- Create: 'apps/mobile/**' with Flutter CLI
- Create: 'apps/mobile/lib/app/app.dart'
- Create: 'apps/mobile/lib/app/router.dart'
- Create: 'apps/mobile/lib/core/api/api_client.dart'
- Create: 'apps/mobile/lib/core/auth/auth_session.dart'
- Create: 'apps/mobile/lib/core/auth/auth_session_store.dart'
- Modify: 'apps/mobile/lib/main.dart'
- Test: 'apps/mobile/test/app/router_test.dart'
- Test: 'apps/mobile/test/core/auth/auth_session_store_test.dart'

**Interfaces:**
- Produces: auth-aware routes and secure refresh-token persistence.

- [ ] **Step 1: Scaffold targets and dependencies**

~~~powershell
flutter create --org com.quan --project-name slow_dating --platforms=android,ios,web,windows apps/mobile
Set-Location apps/mobile
flutter pub add flutter_riverpod go_router dio flutter_secure_storage
flutter pub add --dev mocktail
~~~

- [ ] **Step 2: Write failing route/storage tests**

Unauthenticated -> '/sign-in'; authenticated/incomplete -> '/onboarding'; complete -> '/home'.

- [ ] **Step 3: Run and verify failure**

Run: 'flutter test'.

- [ ] **Step 4: Implement shell**

Store refresh token only in secure storage; access token stays in Riverpod memory. Android emulator base URL is 'http://10.0.2.2:3000/v1', injectable elsewhere.

- [ ] **Step 5: Verify and commit**

~~~powershell
flutter analyze
flutter test
git add apps/mobile
git commit -m "feat(mobile): scaffold authenticated app shell"
~~~

### Task 9: Flutter Phone/OTP Flow

**Files:**
- Create: 'apps/mobile/lib/features/auth/data/auth_api.dart'
- Create: 'apps/mobile/lib/features/auth/domain/auth_state.dart'
- Create: 'apps/mobile/lib/features/auth/presentation/auth_controller.dart'
- Create: 'apps/mobile/lib/features/auth/presentation/phone_screen.dart'
- Create: 'apps/mobile/lib/features/auth/presentation/otp_screen.dart'
- Test: 'apps/mobile/test/features/auth/auth_controller_test.dart'
- Test: 'apps/mobile/test/features/auth/auth_flow_test.dart'

**Interfaces:**
- Consumes: Task 4 endpoints.
- Produces: authenticated session and onboarding navigation.

- [ ] **Step 1: Write failing controller tests**

Cover successful phone, invalid phone, expiry countdown, wrong code, session persistence and double-tap suppression with one UUID per logical command.

- [ ] **Step 2: Write failing two-screen widget test**

Enter Vietnamese phone and captured six-digit code; assert '/onboarding'.

- [ ] **Step 3: Run failures**

Run: 'flutter test test/features/auth'.

- [ ] **Step 4: Implement accessible screens**

No OTP hard-coded in Flutter. Resend is disabled until server expiry. Never render refresh token.

- [ ] **Step 5: Test emulator and commit**

~~~powershell
flutter analyze
flutter test
flutter run -d emulator-5554 --dart-define=API_BASE_URL=http://10.0.2.2:3000/v1
git add apps/mobile
git commit -m "feat(mobile): add phone OTP sign-in"
~~~

### Task 10: Flutter Profile Onboarding

**Files:**
- Create: 'apps/mobile/lib/features/profile/data/profile_api.dart'
- Create: 'apps/mobile/lib/features/profile/domain/profile_models.dart'
- Create: 'apps/mobile/lib/features/profile/presentation/profile_controller.dart'
- Create: 'apps/mobile/lib/features/profile/presentation/profile_onboarding_screen.dart'
- Create: 'apps/mobile/lib/features/profile/presentation/widgets/catalog_multi_select.dart'
- Create: 'apps/mobile/lib/features/profile/presentation/widgets/location_selector.dart'
- Test: 'apps/mobile/test/features/profile/profile_controller_test.dart'
- Test: 'apps/mobile/test/features/profile/profile_onboarding_test.dart'

**Interfaces:**
- Consumes: Task 6 endpoints.
- Produces: profile-complete route state.

- [ ] **Step 1: Write failing domain tests**

Test MAN->MAN, friendship independent of dating, multi-select serialization, under-18 server error, SELF_DESCRIBED label and retained input after failed PUT.

- [ ] **Step 2: Write failing accessibility tests**

Every option has text; selected state is announced; 18+ is explained; submit disabled until required fields complete.

- [ ] **Step 3: Run failures**

Run: 'flutter test test/features/profile'.

- [ ] **Step 4: Implement catalog-driven form**

Widgets render server labels, not enum-derived labels. Required: name, birth date, identity, one interested gender, one intent and home location. Success sets profileComplete and routes home.

- [ ] **Step 5: Verify and commit**

~~~powershell
flutter analyze
flutter test
git add apps/mobile
git commit -m "feat(mobile): add inclusive profile onboarding"
~~~

### Task 11: Quality Gate and CI

**Files:**
- Create: 'scripts/check.ps1'
- Create: '.github/workflows/quality.yml'
- Create: 'docs/development/windows-setup.md'
- Modify: 'README.md'

**Interfaces:**
- Produces: one-command local gate and database-independent CI gate.

- [ ] **Step 1: Create and run check script**

Script stops on first non-zero exit and runs API lint/unit/integration/e2e/OpenAPI drift plus Flutter format/analyze/test.

- [ ] **Step 2: Document deterministic local startup**

Document XEPDB1 bootstrap/migration, API start, emulator start and development OTP console lookup without production secrets.

- [ ] **Step 3: Add CI**

Use Node 24 and Flutter 3.47. Run API lint/unit/OpenAPI drift and Flutter format/analyze/widget tests. Oracle integration/e2e is mandatory local PR evidence.

- [ ] **Step 4: Run complete gate**

~~~powershell
powershell -ExecutionPolicy Bypass -File scripts/check.ps1
~~~

Expected: exit 0 and all suites pass.

- [ ] **Step 5: Smoke two accounts and commit**

Complete auth/profile for two phone numbers, restart app, verify restored sessions and Oracle-backed profiles.

~~~powershell
git add .github README.md docs/development scripts
git commit -m "ci: gate foundation auth and profile slice"
~~~

## Plan 1 Exit Gate

1. 'flutter doctor -v' reports no issues.
2. Oracle dev/test schemas migrate from empty and second run is a no-op.
3. API lint, unit, integration and e2e pass.
4. Flutter format, analyze, unit and widget tests pass.
5. Android emulator completes sign-in/profile against real API.
6. Restart restores session and profile.
7. Two distinct 18+ accounts exist; neither is KYC verified without a provider.
8. Git worktree is clean.
