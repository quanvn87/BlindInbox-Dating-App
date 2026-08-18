import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import oracledb from 'oracledb';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { MigrationRunner } from './../src/common/database/migration-runner';
import { OracleService } from './../src/common/database/oracle.service';

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

    expect(result.rows).toEqual([{ VERSION: '001_auth' }]);
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
