import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import oracledb from 'oracledb';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { MigrationRunner } from './../src/common/database/migration-runner';
import {
  assertOracleServiceSchema,
  TEST_ORACLE_SCHEMA,
} from './../src/common/database/oracle-schema.guard';
import { OracleService } from './../src/common/database/oracle.service';
import { OTP_PROVIDER } from './../src/modules/auth/otp.provider';
import type { OtpProvider } from './../src/modules/auth/otp.provider';

class CapturingOtpProvider implements OtpProvider {
  readonly deliveries: Array<{ phoneE164: string; code: string }> = [];

  send(phoneE164: string, code: string): Promise<void> {
    this.deliveries.push({ phoneE164, code });
    return Promise.resolve();
  }
}

describe('Auth API (e2e)', () => {
  let app: INestApplication<App>;
  let oracleService: OracleService;
  const otpProvider = new CapturingOtpProvider();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OTP_PROVIDER)
      .useValue(otpProvider)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();

    oracleService = moduleFixture.get(OracleService);
    await moduleFixture.get(MigrationRunner).run();
  });

  beforeEach(async () => {
    otpProvider.deliveries.length = 0;
    await clearAuthData();
  });

  it('requests, verifies, rotates, and logs out without exposing the OTP', async () => {
    const requestResponse = await request(app.getHttpServer())
      .post('/v1/auth/otp/request')
      .set('Idempotency-Key', randomUUID())
      .send({ phone: '0901234567' })
      .expect(202);

    const requestBody = requestResponse.body as {
      challengeId: string;
      expiresAt: string;
      code?: string;
    };
    expect(requestBody.challengeId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(requestBody.expiresAt).toMatch(/Z$/);
    expect(requestBody).not.toHaveProperty('code');
    expect(otpProvider.deliveries).toHaveLength(1);
    expect(otpProvider.deliveries[0]?.phoneE164).toBe('+84901234567');
    expect(JSON.stringify(requestBody)).not.toContain(
      otpProvider.deliveries[0].code,
    );

    const verifyPayload = {
      challengeId: requestBody.challengeId,
      code: otpProvider.deliveries[0].code,
      deviceName: 'Pixel 9',
    };
    const verifyResponse = await request(app.getHttpServer())
      .post('/v1/auth/otp/verify')
      .set('Idempotency-Key', randomUUID())
      .send(verifyPayload)
      .expect(200);

    const originalTokens = verifyResponse.body as {
      accessToken: string;
      accessExpiresAt: string;
      refreshToken: string;
      refreshExpiresAt: string;
    };
    expect(originalTokens.accessToken.split('.')).toHaveLength(3);
    expect(originalTokens.accessExpiresAt).toMatch(/Z$/);
    expect(originalTokens.refreshToken).toBeTruthy();
    expect(originalTokens.refreshExpiresAt).toMatch(/Z$/);

    await request(app.getHttpServer())
      .post('/v1/auth/otp/verify')
      .set('Idempotency-Key', randomUUID())
      .send(verifyPayload)
      .expect(409);

    const refreshResponse = await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .set('Idempotency-Key', randomUUID())
      .send({ refreshToken: originalTokens.refreshToken })
      .expect(200);

    const rotatedTokens = refreshResponse.body as {
      refreshToken: string;
    };
    expect(rotatedTokens.refreshToken).not.toBe(originalTokens.refreshToken);
    await expectActiveRefreshSessions(1);

    await request(app.getHttpServer())
      .post('/v1/auth/logout')
      .set('Idempotency-Key', randomUUID())
      .send({ refreshToken: rotatedTokens.refreshToken })
      .expect(204)
      .expect('');

    await expectActiveRefreshSessions(0);
  });

  it.each([
    ['/v1/auth/otp/request', { phone: '0901234567' }],
    [
      '/v1/auth/otp/verify',
      { challengeId: randomUUID(), code: '000000', deviceName: 'Pixel 9' },
    ],
    ['/v1/auth/refresh', { refreshToken: 'invalid-token' }],
    ['/v1/auth/logout', { refreshToken: 'invalid-token' }],
  ])('rejects a malformed idempotency key for %s', async (path, body) => {
    await request(app.getHttpServer())
      .post(path)
      .set('Idempotency-Key', 'not-a-uuid')
      .send(body)
      .expect(400);
  });

  it.each([
    ['/v1/auth/otp/request', { phone: '0901234567' }],
    [
      '/v1/auth/otp/verify',
      { challengeId: randomUUID(), code: '000000', deviceName: 'Pixel 9' },
    ],
    ['/v1/auth/refresh', { refreshToken: 'invalid-token' }],
    ['/v1/auth/logout', { refreshToken: 'invalid-token' }],
  ])('requires an idempotency key for %s', async (path, body) => {
    await request(app.getHttpServer()).post(path).send(body).expect(400);
  });

  it.each(['Call me 0901234567', '0901234567abc', '0901234567 ext 123'])(
    'rejects malformed phone input without extracting %s',
    async (phone) => {
      await request(app.getHttpServer())
        .post('/v1/auth/otp/request')
        .set('Idempotency-Key', randomUUID())
        .send({ phone })
        .expect(400);
      expect(otpProvider.deliveries).toHaveLength(0);
    },
  );

  async function expectActiveRefreshSessions(expected: number): Promise<void> {
    const result = await oracleService.withConnection((connection) =>
      connection.execute<{ COUNT: number }>(
        `SELECT COUNT(*) AS count
         FROM refresh_sessions
         WHERE revoked_at IS NULL`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      ),
    );

    expect(result.rows?.[0]?.COUNT).toBe(expected);
  }

  async function clearAuthData(): Promise<void> {
    await assertOracleServiceSchema(
      oracleService,
      TEST_ORACLE_SCHEMA,
      'TEST cleanup',
    );
    await oracleService.withTransaction(async (connection) => {
      await connection.execute('DELETE FROM refresh_sessions');
      await connection.execute('DELETE FROM otp_challenges');
      await connection.execute('DELETE FROM app_users');
    });
  }

  afterAll(async () => {
    if (oracleService) {
      await clearAuthData();
    }
    await app?.close();
  });
});
