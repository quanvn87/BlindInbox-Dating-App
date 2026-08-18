import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import oracledb from 'oracledb';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { MigrationRunner } from './../src/common/database/migration-runner';
import { OracleService } from './../src/common/database/oracle.service';
import {
  PROFILE_REPOSITORY,
  type ProfileRepository,
} from './../src/modules/profile/profile.repository';
import type { ProfileInput } from './../src/modules/profile/profile.types';

describe('Oracle profile repository integration', () => {
  let app: INestApplication<App>;
  let moduleFixture: TestingModule;
  let oracleService: OracleService;

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    oracleService = moduleFixture.get(OracleService);
    await moduleFixture.get(MigrationRunner).run();
  });

  beforeEach(async () => {
    await clearProfileAndAuthData();
  });

  it('reads the canonical profile catalogs in stable order', async () => {
    const repository = getRepository();

    await expect(repository.getCatalog()).resolves.toMatchObject({
      genders: [
        { code: 'MAN', isActive: true },
        { code: 'WOMAN', isActive: true },
        { code: 'NON_BINARY', isActive: true },
        { code: 'SELF_DESCRIBED', isActive: true },
      ],
      connectionIntents: [
        { code: 'CASUAL_CONVERSATION', isActive: true },
        { code: 'FRIENDSHIP', isActive: true },
        { code: 'LONG_TERM_DATING', isActive: true },
        { code: 'SHORT_TERM_DATING', isActive: true },
        { code: 'OPEN_TO_EXPLORE', isActive: true },
      ],
    });
  });

  it('returns null before onboarding and round-trips an inclusive profile', async () => {
    const repository = getRepository();
    const userId = await createUser('PENDING');
    const profile = validProfile({
      favoriteSongTitle: `T${'i'.repeat(599)}`,
      favoriteSongArtist: `A${'r'.repeat(599)}`,
    });

    await expect(repository.findByUserId(userId)).resolves.toBeNull();
    await expect(repository.upsert(userId, profile)).resolves.toEqual(profile);
    await expect(repository.upsert(userId, profile)).resolves.toEqual(profile);

    const stored = await repository.findByUserId(userId);
    expect(stored).toEqual(profile);
    expect(typeof stored?.bio).toBe('string');
    expect(typeof stored?.favoriteSongTitle).toBe('string');
    expect(typeof stored?.favoriteSongArtist).toBe('string');
    await expectIdentityStatus(userId, 'PENDING');
  });

  it('rolls back scalar and every child replacement when a prompt insert fails', async () => {
    const repository = getRepository();
    const userId = await createUser('VERIFIED');
    const original = validProfile();
    await repository.upsert(userId, original);

    const invalidReplacement = validProfile({
      displayName: 'Should Roll Back',
      interestedInGenders: ['WOMAN'],
      connectionIntents: ['CASUAL_CONVERSATION'],
      promptAnswers: [
        { promptCode: 'MISSING_PROMPT', answer: 'Must not be saved' },
      ],
    });

    await expect(
      repository.upsert(userId, invalidReplacement),
    ).rejects.toBeDefined();
    await expect(repository.findByUserId(userId)).resolves.toEqual(original);
    await expectIdentityStatus(userId, 'VERIFIED');
  });

  function getRepository(): ProfileRepository {
    return moduleFixture.get<ProfileRepository>(PROFILE_REPOSITORY);
  }

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

  async function createUser(identityStatus: string): Promise<string> {
    const userId = randomUUID();
    await oracleService.withTransaction((connection) =>
      connection.execute(
        `INSERT INTO app_users (id, phone_e164, identity_status)
         VALUES (:userId, :phoneE164, :identityStatus)`,
        {
          userId,
          phoneE164: `+1555${Date.now()}${Math.floor(Math.random() * 10)}`,
          identityStatus,
        },
      ),
    );
    return userId;
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
