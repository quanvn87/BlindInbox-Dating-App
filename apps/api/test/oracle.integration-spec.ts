import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import oracledb from 'oracledb';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { MigrationRunner } from './../src/common/database/migration-runner';
import { OracleService } from './../src/common/database/oracle.service';

const PROFILE_TABLES_IN_DROP_ORDER = [
  'PROFILE_PROMPT_ANSWERS',
  'PROFILE_CONNECTION_INTENTS',
  'PROFILE_INTERESTED_GENDERS',
  'PROFILES',
] as const;
const CANONICAL_TEST_SCHEMA = 'SLOW_DATING_TEST';

async function resetProfileMigration(oracleService: OracleService) {
  await oracleService.withTransaction(async (connection) => {
    const targetResult = await connection.execute<{
      SESSION_USER: string;
      CURRENT_SCHEMA: string;
    }>(
      `SELECT USER AS session_user,
              SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA') AS current_schema
       FROM dual`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const target = targetResult.rows?.[0];
    if (
      process.env.ORACLE_TEST_USER?.toUpperCase() !== CANONICAL_TEST_SCHEMA ||
      target?.SESSION_USER !== CANONICAL_TEST_SCHEMA ||
      target.CURRENT_SCHEMA !== CANONICAL_TEST_SCHEMA
    ) {
      throw new Error(
        `Refusing to reset profile migration outside ${CANONICAL_TEST_SCHEMA}`,
      );
    }

    const tablesResult = await connection.execute<{ TABLE_NAME: string }>(
      `SELECT table_name
       FROM user_tables
       WHERE table_name IN (
         'PROFILE_PROMPT_ANSWERS',
         'PROFILE_CONNECTION_INTENTS',
         'PROFILE_INTERESTED_GENDERS',
         'PROFILES'
       )`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const existingTables = new Set(
      (tablesResult.rows ?? []).map(({ TABLE_NAME }) => TABLE_NAME),
    );
    for (const tableName of PROFILE_TABLES_IN_DROP_ORDER) {
      if (existingTables.has(tableName)) {
        await connection.execute(`DROP TABLE ${tableName} PURGE`);
      }
    }

    const migrationTableResult = await connection.execute<{
      TABLE_NAME: string;
    }>(
      "SELECT table_name FROM user_tables WHERE table_name = 'SCHEMA_MIGRATIONS'",
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (migrationTableResult.rows?.length) {
      await connection.execute(
        "DELETE FROM schema_migrations WHERE version = '003_profile'",
      );
    }
  });
}

function assertSafeSessionTimeZone(timeZone: string): string {
  if (!/^[A-Za-z0-9_+\-/:]+$/.test(timeZone)) {
    throw new Error('Unexpected Oracle session time zone');
  }
  return timeZone;
}

describe('Oracle integration', () => {
  let app: INestApplication<App>;
  let moduleFixture: TestingModule;
  let migrationRunner: MigrationRunner;
  let oracleService: OracleService;

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();

    migrationRunner = moduleFixture.get(MigrationRunner);
    oracleService = moduleFixture.get(OracleService);
    await resetProfileMigration(oracleService);
  });

  it('pings Oracle and applies each migration once', async () => {
    await oracleService.ping();
    await migrationRunner.run();
    await migrationRunner.run();

    const result = await oracleService.withConnection((connection) =>
      connection.execute<{ VERSION: string }>(
        'SELECT version FROM schema_migrations ORDER BY version',
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      ),
    );

    expect(result.rows).toEqual([
      { VERSION: '001_auth' },
      { VERSION: '002_profile_catalog' },
      { VERSION: '003_profile' },
    ]);
  });

  it('seeds the canonical active profile catalogs and location ancestry', async () => {
    await migrationRunner.run();

    const catalogs = await oracleService.withConnection(async (connection) => {
      const genders = await connection.execute<{ CODE: string }>(
        'SELECT code FROM gender_catalog WHERE is_active = 1 ORDER BY sort_order',
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const intents = await connection.execute<{ CODE: string }>(
        'SELECT code FROM connection_intent_catalog WHERE is_active = 1 ORDER BY sort_order',
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const locations = await connection.execute<{
        CODE: string;
        DISPLAY_NAME: string;
        LOCATION_LEVEL: string;
        PARENT_CODE: string | null;
      }>(
        `SELECT code, display_name, location_level, parent_code
         FROM location_nodes
         ORDER BY code`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      return { genders, intents, locations };
    });

    expect(catalogs.genders.rows).toEqual([
      { CODE: 'MAN' },
      { CODE: 'WOMAN' },
      { CODE: 'NON_BINARY' },
      { CODE: 'SELF_DESCRIBED' },
    ]);
    expect(catalogs.intents.rows).toEqual([
      { CODE: 'CASUAL_CONVERSATION' },
      { CODE: 'FRIENDSHIP' },
      { CODE: 'LONG_TERM_DATING' },
      { CODE: 'SHORT_TERM_DATING' },
      { CODE: 'OPEN_TO_EXPLORE' },
    ]);
    expect(catalogs.locations.rows).toEqual([
      {
        CODE: 'VN-HCM',
        DISPLAY_NAME: 'Thành phố Hồ Chí Minh',
        LOCATION_LEVEL: 'PROVINCE',
        PARENT_CODE: null,
      },
      {
        CODE: 'VN-HCM-Q1',
        DISPLAY_NAME: 'Quận 1',
        LOCATION_LEVEL: 'DISTRICT',
        PARENT_CODE: 'VN-HCM',
      },
      {
        CODE: 'VN-HCM-Q1-BT',
        DISPLAY_NAME: 'Phường Bến Thành',
        LOCATION_LEVEL: 'WARD',
        PARENT_CODE: 'VN-HCM-Q1',
      },
      {
        CODE: 'VN-HN',
        DISPLAY_NAME: 'Thành phố Hà Nội',
        LOCATION_LEVEL: 'PROVINCE',
        PARENT_CODE: null,
      },
    ]);
  });

  it('creates profile relations with primary and foreign-key constraints', async () => {
    await migrationRunner.run();

    const schema = await oracleService.withConnection(async (connection) => {
      const tables = await connection.execute<{ TABLE_NAME: string }>(
        `SELECT table_name
         FROM user_tables
         WHERE table_name IN (
           'PROFILES',
           'PROFILE_INTERESTED_GENDERS',
           'PROFILE_CONNECTION_INTENTS',
           'PROFILE_PROMPT_ANSWERS'
         )
         ORDER BY table_name`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const constraintCounts = await connection.execute<{
        TABLE_NAME: string;
        CONSTRAINT_TYPE: string;
        CONSTRAINT_COUNT: number;
      }>(
        `SELECT table_name, constraint_type, COUNT(*) AS constraint_count
         FROM user_constraints
         WHERE table_name IN (
           'PROFILES',
           'PROFILE_INTERESTED_GENDERS',
           'PROFILE_CONNECTION_INTENTS',
           'PROFILE_PROMPT_ANSWERS'
         )
         AND constraint_type IN ('P', 'R')
         GROUP BY table_name, constraint_type
         ORDER BY table_name, constraint_type`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const compositeKeys = await connection.execute<{
        TABLE_NAME: string;
        KEY_COLUMNS: string;
      }>(
        `SELECT constraints.table_name,
                LISTAGG(columns.column_name, ',')
                  WITHIN GROUP (ORDER BY columns.position) AS key_columns
         FROM user_constraints constraints
         JOIN user_cons_columns columns
           ON columns.constraint_name = constraints.constraint_name
         WHERE constraints.table_name IN (
           'PROFILE_INTERESTED_GENDERS',
           'PROFILE_CONNECTION_INTENTS',
           'PROFILE_PROMPT_ANSWERS'
         )
         AND constraints.constraint_type = 'P'
         GROUP BY constraints.table_name
         ORDER BY constraints.table_name`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      return { tables, constraintCounts, compositeKeys };
    });

    expect(schema.tables.rows).toEqual([
      { TABLE_NAME: 'PROFILES' },
      { TABLE_NAME: 'PROFILE_CONNECTION_INTENTS' },
      { TABLE_NAME: 'PROFILE_INTERESTED_GENDERS' },
      { TABLE_NAME: 'PROFILE_PROMPT_ANSWERS' },
    ]);
    expect(schema.constraintCounts.rows).toEqual([
      {
        TABLE_NAME: 'PROFILES',
        CONSTRAINT_TYPE: 'P',
        CONSTRAINT_COUNT: 1,
      },
      {
        TABLE_NAME: 'PROFILES',
        CONSTRAINT_TYPE: 'R',
        CONSTRAINT_COUNT: 4,
      },
      {
        TABLE_NAME: 'PROFILE_CONNECTION_INTENTS',
        CONSTRAINT_TYPE: 'P',
        CONSTRAINT_COUNT: 1,
      },
      {
        TABLE_NAME: 'PROFILE_CONNECTION_INTENTS',
        CONSTRAINT_TYPE: 'R',
        CONSTRAINT_COUNT: 2,
      },
      {
        TABLE_NAME: 'PROFILE_INTERESTED_GENDERS',
        CONSTRAINT_TYPE: 'P',
        CONSTRAINT_COUNT: 1,
      },
      {
        TABLE_NAME: 'PROFILE_INTERESTED_GENDERS',
        CONSTRAINT_TYPE: 'R',
        CONSTRAINT_COUNT: 2,
      },
      {
        TABLE_NAME: 'PROFILE_PROMPT_ANSWERS',
        CONSTRAINT_TYPE: 'P',
        CONSTRAINT_COUNT: 1,
      },
      {
        TABLE_NAME: 'PROFILE_PROMPT_ANSWERS',
        CONSTRAINT_TYPE: 'R',
        CONSTRAINT_COUNT: 2,
      },
    ]);
    expect(schema.compositeKeys.rows).toEqual([
      {
        TABLE_NAME: 'PROFILE_CONNECTION_INTENTS',
        KEY_COLUMNS: 'USER_ID,INTENT_CODE',
      },
      {
        TABLE_NAME: 'PROFILE_INTERESTED_GENDERS',
        KEY_COLUMNS: 'USER_ID,GENDER_CODE',
      },
      {
        TABLE_NAME: 'PROFILE_PROMPT_ANSWERS',
        KEY_COLUMNS: 'USER_ID,PROMPT_CODE',
      },
    ]);
  });

  it('stores paired song values longer than 500 characters', async () => {
    await migrationRunner.run();
    const userId = randomUUID();
    const longSongValue = 'x'.repeat(600);

    const lengths = await oracleService.withTransaction(async (connection) => {
      await connection.execute(
        `INSERT INTO app_users (id, phone_e164)
         VALUES (:userId, :phoneE164)`,
        { userId, phoneE164: `+1555${Date.now()}` },
      );
      await connection.execute(
        `INSERT INTO profiles (
           user_id, display_name, birth_date, gender_identity_code,
           home_location_code, favorite_song_title, favorite_song_artist
         ) VALUES (
           :userId, N'Long Song', DATE '2000-01-01', 'MAN',
           'VN-HCM', :songTitle, :songArtist
         )`,
        {
          userId,
          songTitle: longSongValue,
          songArtist: longSongValue,
        },
      );
      await connection.execute(
        `INSERT INTO profile_interested_genders (user_id, gender_code)
         VALUES (:userId, 'MAN')`,
        { userId },
      );
      await connection.execute(
        `INSERT INTO profile_connection_intents (user_id, intent_code)
         VALUES (:userId, 'FRIENDSHIP')`,
        { userId },
      );
      const result = await connection.execute<{
        TITLE_LENGTH: number;
        ARTIST_LENGTH: number;
      }>(
        `SELECT LENGTH(favorite_song_title) AS title_length,
                LENGTH(favorite_song_artist) AS artist_length
         FROM profiles
         WHERE user_id = :userId`,
        { userId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      await connection.execute('DELETE FROM profiles WHERE user_id = :userId', {
        userId,
      });
      await connection.execute('DELETE FROM app_users WHERE id = :userId', {
        userId,
      });
      return result.rows?.[0];
    });

    expect(lengths).toEqual({ TITLE_LENGTH: 600, ARTIST_LENGTH: 600 });
  });

  it('stores profile default timestamps with UTC zone and instant semantics', async () => {
    await migrationRunner.run();
    const userId = randomUUID();

    const timestampState = await oracleService.withConnection(
      async (connection) => {
        const originalTimeZoneResult = await connection.execute<{
          SESSION_TIME_ZONE: string;
        }>('SELECT SESSIONTIMEZONE AS session_time_zone FROM dual', [], {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
        });
        const originalTimeZone = assertSafeSessionTimeZone(
          originalTimeZoneResult.rows?.[0]?.SESSION_TIME_ZONE ?? 'UTC',
        );

        try {
          await connection.execute("ALTER SESSION SET TIME_ZONE = '-07:00'");
          await connection.execute(
            `INSERT INTO app_users (id, phone_e164)
             VALUES (:userId, :phoneE164)`,
            { userId, phoneE164: `+1555${Date.now()}` },
          );
          await connection.execute(
            `INSERT INTO profiles (
               user_id, display_name, birth_date, gender_identity_code,
               home_location_code
             ) VALUES (
               :userId, N'UTC Profile', DATE '2000-01-01', 'MAN', 'VN-HCM'
             )`,
            { userId },
          );
          await connection.execute(
            `INSERT INTO profile_interested_genders (user_id, gender_code)
             VALUES (:userId, 'MAN')`,
            { userId },
          );
          await connection.execute(
            `INSERT INTO profile_connection_intents (user_id, intent_code)
             VALUES (:userId, 'FRIENDSHIP')`,
            { userId },
          );
          await connection.commit();

          const result = await connection.execute<{
            CREATED_OFFSET: string;
            UPDATED_OFFSET: string;
            CREATED_DELTA_SECONDS: number;
            UPDATED_DELTA_SECONDS: number;
          }>(
            `SELECT TO_CHAR(created_at, 'TZH:TZM') AS created_offset,
                    TO_CHAR(updated_at, 'TZH:TZM') AS updated_offset,
                    ABS(
                      (CAST(SYS_EXTRACT_UTC(SYSTIMESTAMP) AS DATE) -
                       CAST(SYS_EXTRACT_UTC(created_at) AS DATE)) * 86400
                    ) AS created_delta_seconds,
                    ABS(
                      (CAST(SYS_EXTRACT_UTC(SYSTIMESTAMP) AS DATE) -
                       CAST(SYS_EXTRACT_UTC(updated_at) AS DATE)) * 86400
                    ) AS updated_delta_seconds
             FROM profiles
             WHERE user_id = :userId`,
            { userId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT },
          );
          return result.rows?.[0];
        } finally {
          try {
            await connection.execute(
              'DELETE FROM profiles WHERE user_id = :userId',
              { userId },
            );
            await connection.execute(
              'DELETE FROM app_users WHERE id = :userId',
              { userId },
            );
            await connection.commit();
          } finally {
            await connection.execute(
              `ALTER SESSION SET TIME_ZONE = '${originalTimeZone}'`,
            );
          }
        }
      },
    );

    expect(timestampState).toMatchObject({
      CREATED_OFFSET: '+00:00',
      UPDATED_OFFSET: '+00:00',
    });
    expect(timestampState?.CREATED_DELTA_SECONDS).toBeLessThan(30);
    expect(timestampState?.UPDATED_DELTA_SECONDS).toBeLessThan(30);
  });

  it('reports ready when Oracle is reachable', async () => {
    await request(app.getHttpServer())
      .get('/v1/health/ready')
      .expect(200)
      .expect({ status: 'ready', oracle: 'up' });
  });

  it('rolls back a transaction when its callback throws', async () => {
    const userId = randomUUID();

    await expect(
      oracleService.withTransaction(async (connection) => {
        await connection.execute(
          `INSERT INTO app_users (id, phone_e164)
           VALUES (:userId, :phoneE164)`,
          { userId, phoneE164: `+1555${Date.now()}` },
        );
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    const result = await oracleService.withConnection((connection) =>
      connection.execute<{ COUNT: number }>(
        'SELECT COUNT(*) AS count FROM app_users WHERE id = :userId',
        { userId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      ),
    );

    const count = result.rows?.[0]?.COUNT;

    await oracleService.withTransaction((connection) =>
      connection.execute('DELETE FROM app_users WHERE id = :userId', {
        userId,
      }),
    );

    expect(count).toBe(0);
  });

  afterAll(async () => {
    await app?.close();
  });
});
