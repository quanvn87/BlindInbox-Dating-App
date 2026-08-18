import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createHmac, randomUUID } from 'node:crypto';
import oracledb from 'oracledb';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { MigrationRunner } from './../src/common/database/migration-runner';
import { OracleService } from './../src/common/database/oracle.service';
import { OracleAuthRepository } from './../src/modules/auth/oracle-auth.repository';
import { TokenService } from './../src/modules/auth/token.service';
import type {
  ProfileCatalog,
  ProfileInput,
} from './../src/modules/profile/profile.types';

const JWT_SECRET = 'test-access-secret-at-least-32-characters';

describe('Profile API (e2e)', () => {
  let app: INestApplication<App>;
  let oracleService: OracleService;
  let authRepository: OracleAuthRepository;
  let tokenService: TokenService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();

    oracleService = moduleFixture.get(OracleService);
    authRepository = moduleFixture.get(OracleAuthRepository);
    tokenService = moduleFixture.get(TokenService);
    await moduleFixture.get(MigrationRunner).run();
  });

  beforeEach(async () => {
    await clearProfileAndAuthData();
  });

  it('serves active onboarding profile options without authentication', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/catalog/profile-options')
      .expect(200);

    const catalog = response.body as ProfileCatalog;
    expect(catalog.genders).toMatchObject([
      { code: 'MAN', isActive: true },
      { code: 'WOMAN', isActive: true },
      { code: 'NON_BINARY', isActive: true },
      { code: 'SELF_DESCRIBED', isActive: true },
    ]);
    expect(catalog.connectionIntents).toContainEqual(
      expect.objectContaining({ code: 'FRIENDSHIP', isActive: true }),
    );
    expect(catalog.prompts).toContainEqual(
      expect.objectContaining({ code: 'IDEAL_SUNDAY', isActive: true }),
    );
  });

  it('rejects missing and invalid Bearer access tokens', async () => {
    const now = Math.floor(Date.now() / 1000);
    const signedToken = signAccessToken({
      sub: randomUUID(),
      sessionId: randomUUID(),
      status: 'ACTIVE',
      iat: now,
      exp: now + 60,
    });
    const parts = signedToken.split('.');
    parts[2] = `${parts[2].startsWith('A') ? 'B' : 'A'}${parts[2].slice(1)}`;

    await request(app.getHttpServer()).get('/v1/me/profile').expect(401);
    await request(app.getHttpServer())
      .get('/v1/me/profile')
      .set('Authorization', 'Bearer not-a-jwt')
      .expect(401);
    await request(app.getHttpServer())
      .get('/v1/me/profile')
      .set('Authorization', `Bearer ${parts.join('.')}`)
      .expect(401);
    await request(app.getHttpServer())
      .get('/v1/me/profile')
      .set('Authorization', 'Basic credentials')
      .expect(401);
  });

  it('rejects an expired, correctly signed access token', async () => {
    const now = Math.floor(Date.now() / 1000);
    const expiredToken = signAccessToken({
      sub: randomUUID(),
      sessionId: randomUUID(),
      status: 'ACTIVE',
      iat: now - 120,
      exp: now - 60,
    });

    await request(app.getHttpServer())
      .get('/v1/me/profile')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);
  });

  it('returns 404 for an authenticated user before onboarding', async () => {
    const authorization = await createAuthorization();

    await request(app.getHttpServer())
      .get('/v1/me/profile')
      .set('Authorization', authorization)
      .expect(404);
  });

  it('requires a UUID Idempotency-Key only for profile PUT', async () => {
    const authorization = await createAuthorization();

    await request(app.getHttpServer())
      .put('/v1/me/profile')
      .set('Authorization', authorization)
      .send(validProfile())
      .expect(400);
    await request(app.getHttpServer())
      .put('/v1/me/profile')
      .set('Authorization', authorization)
      .set('Idempotency-Key', 'not-a-uuid')
      .send(validProfile())
      .expect(400);
    await request(app.getHttpServer())
      .get('/v1/me/profile')
      .set('Authorization', authorization)
      .expect(404);
  });

  it('rejects a caller-supplied user id instead of changing another account', async () => {
    const authorization = await createAuthorization();

    await request(app.getHttpServer())
      .put('/v1/me/profile')
      .set('Authorization', authorization)
      .set('Idempotency-Key', randomUUID())
      .send({ ...validProfile(), userId: randomUUID() })
      .expect(400);
  });

  it('persists an inclusive MAN-to-MAN friendship profile idempotently', async () => {
    const { authorization, userId } = await createAuthorizationWithUser();
    const profile = validProfile({
      favoriteSongTitle: `T${'i'.repeat(599)}`,
      favoriteSongArtist: `A${'r'.repeat(599)}`,
    });
    const idempotencyKey = randomUUID();

    await request(app.getHttpServer())
      .put('/v1/me/profile')
      .set('Authorization', authorization)
      .set('Idempotency-Key', idempotencyKey)
      .send(profile)
      .expect(200)
      .expect(profile);
    await request(app.getHttpServer())
      .put('/v1/me/profile')
      .set('Authorization', authorization)
      .set('Idempotency-Key', idempotencyKey)
      .send(profile)
      .expect(200)
      .expect(profile);

    const getResponse = await request(app.getHttpServer())
      .get('/v1/me/profile')
      .set('Authorization', authorization)
      .expect(200);

    const storedProfile = getResponse.body as ProfileInput;
    expect(storedProfile).toEqual(profile);
    expect(typeof storedProfile.favoriteSongTitle).toBe('string');
    expect(typeof storedProfile.favoriteSongArtist).toBe('string');
    await expectIdentityStatus(userId, 'NOT_STARTED');
  });

  it('returns the canonical persisted order for reversed multi-value input', async () => {
    const authorization = await createAuthorization();
    const reversedInput = validProfile({
      interestedInGenders: ['WOMAN', 'MAN'],
      connectionIntents: ['FRIENDSHIP', 'CASUAL_CONVERSATION'],
      promptAnswers: [
        { promptCode: 'SOMETHING_I_VALUE', answer: 'Kindness' },
        { promptCode: 'RECENT_JOY', answer: 'A quiet morning' },
        { promptCode: 'IDEAL_SUNDAY', answer: 'Coffee and a long walk' },
      ],
    });
    const canonical = {
      ...reversedInput,
      interestedInGenders: ['MAN', 'WOMAN'],
      connectionIntents: ['CASUAL_CONVERSATION', 'FRIENDSHIP'],
      promptAnswers: [
        { promptCode: 'IDEAL_SUNDAY', answer: 'Coffee and a long walk' },
        { promptCode: 'RECENT_JOY', answer: 'A quiet morning' },
        { promptCode: 'SOMETHING_I_VALUE', answer: 'Kindness' },
      ],
    } satisfies ProfileInput;

    await request(app.getHttpServer())
      .put('/v1/me/profile')
      .set('Authorization', authorization)
      .set('Idempotency-Key', randomUUID())
      .send(reversedInput)
      .expect(200)
      .expect(canonical);
    await request(app.getHttpServer())
      .get('/v1/me/profile')
      .set('Authorization', authorization)
      .expect(200)
      .expect(canonical);
  });

  function validProfile(overrides: Partial<ProfileInput> = {}): ProfileInput {
    return {
      displayName: 'Minh Anh',
      birthDate: '2000-01-02',
      genderIdentity: 'MAN',
      genderLabel: null,
      interestedInGenders: ['MAN'],
      connectionIntents: ['FRIENDSHIP'],
      heightCm: 172,
      hometownLocationCode: 'VN-HCM',
      homeLocationCode: 'VN-HCM-Q1',
      bio: 'Coffee, books, and unhurried conversations.',
      favoriteSongTitle: 'Mot ngay moi',
      favoriteSongArtist: 'Vietnamese Artist',
      promptAnswers: [
        { promptCode: 'IDEAL_SUNDAY', answer: 'Coffee and a long walk' },
      ],
      ...overrides,
    };
  }

  async function createAuthorization(): Promise<string> {
    return (await createAuthorizationWithUser()).authorization;
  }

  async function createAuthorizationWithUser(): Promise<{
    authorization: string;
    userId: string;
  }> {
    const user = await authRepository.findOrCreateUserByPhone(uniquePhone());
    const tokens = await tokenService.issue(user, 'Profile e2e test');
    return {
      authorization: `Bearer ${tokens.accessToken}`,
      userId: user.id,
    };
  }

  function uniquePhone(): string {
    return `+849${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 10)}`;
  }

  function signAccessToken(payload: Record<string, string | number>): string {
    const header = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    ).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const unsignedToken = `${header}.${body}`;
    const signature = createHmac('sha256', JWT_SECRET)
      .update(unsignedToken)
      .digest('base64url');
    return `${unsignedToken}.${signature}`;
  }

  async function expectIdentityStatus(
    userId: string,
    expected: string,
  ): Promise<void> {
    const result = await oracleService.withConnection((connection) =>
      connection.execute<{ IDENTITY_STATUS: string }>(
        'SELECT identity_status FROM app_users WHERE id = :userId',
        { userId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      ),
    );
    expect(result.rows?.[0]?.IDENTITY_STATUS).toBe(expected);
  }

  async function clearProfileAndAuthData(): Promise<void> {
    await oracleService.withTransaction(async (connection) => {
      await connection.execute('DELETE FROM profile_prompt_answers');
      await connection.execute('DELETE FROM profile_connection_intents');
      await connection.execute('DELETE FROM profile_interested_genders');
      await connection.execute('DELETE FROM profiles');
      await connection.execute('DELETE FROM refresh_sessions');
      await connection.execute('DELETE FROM otp_challenges');
      await connection.execute('DELETE FROM app_users');
    });
  }

  afterAll(async () => {
    if (oracleService) {
      await clearProfileAndAuthData();
    }
    await app?.close();
  });
});
