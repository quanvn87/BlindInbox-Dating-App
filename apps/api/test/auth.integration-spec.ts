import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import oracledb from 'oracledb';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { MigrationRunner } from './../src/common/database/migration-runner';
import { OracleService } from './../src/common/database/oracle.service';
import { OracleAuthRepository } from './../src/modules/auth/oracle-auth.repository';
import type {
  OtpChallenge,
  RefreshSession,
} from './../src/modules/auth/auth.types';

describe('OracleAuthRepository integration', () => {
  let app: INestApplication<App>;
  let oracleService: OracleService;
  let repository: OracleAuthRepository;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    oracleService = moduleFixture.get(OracleService);
    await moduleFixture.get(MigrationRunner).run();
    repository = new OracleAuthRepository(oracleService);
  });

  beforeEach(async () => {
    await clearAuthData();
  });

  it('allows only one concurrent consume of an eligible OTP challenge', async () => {
    const challenge = createChallenge();
    await repository.createOtpChallenge(challenge);
    const consumedAt = new Date();

    const results = await Promise.all([
      repository.consumeOtpChallenge(challenge.id, consumedAt, 5),
      repository.consumeOtpChallenge(challenge.id, consumedAt, 5),
    ]);

    expect(results.sort()).toEqual(['ALREADY_CONSUMED', 'CONSUMED']);
    expect(
      (await repository.findOtpChallengeById(challenge.id))?.consumedAt,
    ).toBeInstanceOf(Date);
  });

  it('conditionally rejects expired and attempt-exhausted OTP challenges', async () => {
    const now = new Date();
    const expired = createChallenge({
      expiresAt: new Date(now.getTime() - 1),
    });
    const exhausted = createChallenge({ attempts: 5 });
    await repository.createOtpChallenge(expired);
    await repository.createOtpChallenge(exhausted);

    await expect(
      repository.consumeOtpChallenge(expired.id, now, 5),
    ).resolves.toBe('EXPIRED');
    await expect(
      repository.consumeOtpChallenge(exhausted.id, now, 5),
    ).resolves.toBe('ATTEMPTS_EXCEEDED');
  });

  it('returns one user during concurrent first login for a phone', async () => {
    const phoneE164 = uniquePhone();

    const users = await Promise.all([
      repository.findOrCreateUserByPhone(phoneE164),
      repository.findOrCreateUserByPhone(phoneE164),
    ]);

    expect(users[0]).toEqual(users[1]);
    const result = await oracleService.withConnection((connection) =>
      connection.execute<{ COUNT: number }>(
        'SELECT COUNT(*) AS count FROM app_users WHERE phone_e164 = :phoneE164',
        { phoneE164 },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      ),
    );
    expect(result.rows?.[0]?.COUNT).toBe(1);
  });

  it('rotates a refresh session atomically and leaves one active row', async () => {
    const user = await repository.findOrCreateUserByPhone(uniquePhone());
    const current = createRefreshSession(user.id);
    const replacement = createRefreshSession(user.id);
    await repository.createRefreshSession(current);

    await expect(
      repository.rotateRefreshSession(
        current.tokenDigest,
        replacement,
        new Date(),
      ),
    ).resolves.toBe(true);

    const result = await oracleService.withConnection((connection) =>
      connection.execute<{ COUNT: number }>(
        `SELECT COUNT(*) AS count
         FROM refresh_sessions
         WHERE user_id = :userId AND revoked_at IS NULL`,
        { userId: user.id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      ),
    );
    expect(result.rows?.[0]?.COUNT).toBe(1);
  });

  it('rolls back revocation when replacement insertion fails', async () => {
    const user = await repository.findOrCreateUserByPhone(uniquePhone());
    const current = createRefreshSession(user.id);
    await repository.createRefreshSession(current);
    const replacement = createRefreshSession(user.id, { id: current.id });

    await expect(
      repository.rotateRefreshSession(
        current.tokenDigest,
        replacement,
        new Date(),
      ),
    ).rejects.toBeDefined();

    await expect(
      repository.findRefreshSessionByDigest(current.tokenDigest),
    ).resolves.toMatchObject({ revokedAt: null });
  });

  function createChallenge(
    overrides: Partial<OtpChallenge> = {},
  ): OtpChallenge {
    const now = new Date();
    return {
      id: randomUUID(),
      phoneE164: uniquePhone(),
      codeDigest: 'a'.repeat(64),
      attempts: 0,
      expiresAt: new Date(now.getTime() + 60_000),
      consumedAt: null,
      createdAt: now,
      ...overrides,
    };
  }

  function createRefreshSession(
    userId: string,
    overrides: Partial<RefreshSession> = {},
  ): RefreshSession {
    const now = new Date();
    return {
      id: randomUUID(),
      userId,
      tokenDigest: randomUUID().replaceAll('-', '').padEnd(64, '0'),
      deviceName: 'Integration test device',
      expiresAt: new Date(now.getTime() + 60_000),
      revokedAt: null,
      createdAt: now,
      ...overrides,
    };
  }

  function uniquePhone(): string {
    return `+849${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 10)}`;
  }

  async function clearAuthData(): Promise<void> {
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
