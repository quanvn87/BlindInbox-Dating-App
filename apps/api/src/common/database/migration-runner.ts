import { Injectable } from '@nestjs/common';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import oracledb from 'oracledb';
import type { Connection } from 'oracledb';

import {
  assertCanonicalOracleSchema,
  DEV_ORACLE_SCHEMA,
  TEST_ORACLE_SCHEMA,
  type OracleSchemaIdentity,
} from './oracle-schema.guard';
import { OracleService } from './oracle.service';

type MigrationRow = { VERSION: string };
type MigrationRunRow = { VERSION: string; STATUS: MigrationRunStatus };
type OracleObjectRow = { OBJECT_NAME: string; OBJECT_TYPE: OracleObjectType };
type MigrationRunStatus = 'STARTED' | 'APPLIED';
type OracleObjectType = 'TABLE' | 'INDEX' | 'SEQUENCE' | 'VIEW';
type LocalEnvironment = 'development' | 'test';

interface MigrationObject {
  name: string;
  type: OracleObjectType;
}

interface Migration {
  version: string;
  statements: string[];
  objects: MigrationObject[];
}

export class PartialMigrationError extends Error {
  constructor(public readonly version: string) {
    super(
      `Partial Oracle migration detected for ${version}. ` +
        'Use the documented guarded local recovery command before retrying.',
    );
    this.name = 'PartialMigrationError';
  }
}

@Injectable()
export class MigrationRunner {
  constructor(private readonly oracleService: OracleService) {}

  async run(): Promise<void> {
    const migrations = this.getMigrations();

    await this.oracleService.withConnection(async (connection) => {
      await this.ensureMigrationRunTable(connection);
      const appliedVersions = await this.getAppliedVersions(connection);
      const migrationRuns = await this.getMigrationRuns(connection);
      await this.backfillAppliedRuns(
        connection,
        appliedVersions,
        migrationRuns,
      );
      const existingObjects = await this.getExistingObjects(connection);

      for (const migration of migrations) {
        if (appliedVersions.has(migration.version)) {
          continue;
        }
        if (
          migrationRuns.has(migration.version) ||
          migration.objects.some((object) =>
            existingObjects.has(this.objectKey(object)),
          )
        ) {
          await this.recordMigrationStarted(connection, migration.version);
          throw new PartialMigrationError(migration.version);
        }

        await this.recordMigrationStarted(connection, migration.version);
        for (const statement of migration.statements) {
          await connection.execute(statement);
        }
        await connection.execute(
          'INSERT INTO schema_migrations (version) VALUES (:version)',
          { version: migration.version },
        );
        await connection.execute(
          `UPDATE schema_migration_runs
           SET status = 'APPLIED', applied_at = SYS_EXTRACT_UTC(SYSTIMESTAMP)
           WHERE version = :version`,
          { version: migration.version },
        );
        await connection.commit();

        appliedVersions.add(migration.version);
        migrationRuns.set(migration.version, 'APPLIED');
        for (const object of migration.objects) {
          existingObjects.add(this.objectKey(object));
        }
      }
    });
  }

  async recoverLocalSchema(environment: LocalEnvironment): Promise<void> {
    if (environment !== 'development' && environment !== 'test') {
      throw new Error('Local migration recovery requires DEV or TEST');
    }
    const expectedSchema =
      environment === 'development' ? DEV_ORACLE_SCHEMA : TEST_ORACLE_SCHEMA;
    const operation = `${expectedSchema} local migration recovery`;
    const objects = this.getMigrations().flatMap(
      (migration) => migration.objects,
    );

    await this.oracleService.withConnection(async (connection) => {
      const identityResult = await connection.execute<OracleSchemaIdentity>(
        `SELECT USER AS session_user,
                SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA') AS current_schema
         FROM dual`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      assertCanonicalOracleSchema(
        identityResult.rows?.[0],
        expectedSchema,
        operation,
      );

      const existingObjects = await this.getExistingObjects(connection);
      for (const object of objects.reverse()) {
        if (!existingObjects.has(this.objectKey(object))) {
          continue;
        }
        await connection.execute(this.dropStatement(object));
        existingObjects.delete(this.objectKey(object));
      }

      if (existingObjects.has('TABLE:SCHEMA_MIGRATION_RUNS')) {
        await connection.execute(
          'DROP TABLE schema_migration_runs CASCADE CONSTRAINTS PURGE',
        );
      }
    });
  }

  private async ensureMigrationRunTable(connection: Connection): Promise<void> {
    const result = await connection.execute<{ TABLE_NAME: string }>(
      "SELECT table_name FROM user_tables WHERE table_name = 'SCHEMA_MIGRATION_RUNS'",
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (result.rows?.length) {
      return;
    }

    await connection.execute(
      `CREATE TABLE schema_migration_runs (
         version VARCHAR2(100) PRIMARY KEY,
         status VARCHAR2(20) NOT NULL,
         started_at TIMESTAMP WITH TIME ZONE DEFAULT SYS_EXTRACT_UTC(SYSTIMESTAMP) NOT NULL,
         applied_at TIMESTAMP WITH TIME ZONE NULL,
         CONSTRAINT ck_schema_migration_run_status
           CHECK (status IN ('STARTED', 'APPLIED'))
       )`,
    );
  }

  private async getAppliedVersions(
    connection: Connection,
  ): Promise<Set<string>> {
    const tableResult = await connection.execute<{ TABLE_NAME: string }>(
      "SELECT table_name FROM user_tables WHERE table_name = 'SCHEMA_MIGRATIONS'",
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (!tableResult.rows?.length) {
      return new Set<string>();
    }

    const result = await connection.execute<MigrationRow>(
      'SELECT version FROM schema_migrations',
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    return new Set((result.rows ?? []).map((row) => row.VERSION));
  }

  private async getMigrationRuns(
    connection: Connection,
  ): Promise<Map<string, MigrationRunStatus>> {
    const result = await connection.execute<MigrationRunRow>(
      'SELECT version, status FROM schema_migration_runs',
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    return new Map(
      (result.rows ?? []).map((row) => [row.VERSION, row.STATUS] as const),
    );
  }

  private async backfillAppliedRuns(
    connection: Connection,
    appliedVersions: Set<string>,
    migrationRuns: Map<string, MigrationRunStatus>,
  ): Promise<void> {
    let changed = false;
    for (const version of appliedVersions) {
      if (migrationRuns.get(version) === 'APPLIED') {
        continue;
      }
      await connection.execute(
        `MERGE INTO schema_migration_runs target
         USING (SELECT :version AS version FROM dual) source
         ON (target.version = source.version)
         WHEN MATCHED THEN UPDATE SET
           target.status = 'APPLIED',
           target.applied_at = SYS_EXTRACT_UTC(SYSTIMESTAMP)
         WHEN NOT MATCHED THEN INSERT (
           version, status, started_at, applied_at
         ) VALUES (
           source.version, 'APPLIED', SYS_EXTRACT_UTC(SYSTIMESTAMP),
           SYS_EXTRACT_UTC(SYSTIMESTAMP)
         )`,
        { version },
      );
      migrationRuns.set(version, 'APPLIED');
      changed = true;
    }
    if (changed) {
      await connection.commit();
    }
  }

  private async recordMigrationStarted(
    connection: Connection,
    version: string,
  ): Promise<void> {
    await connection.execute(
      `MERGE INTO schema_migration_runs target
       USING (SELECT :version AS version FROM dual) source
       ON (target.version = source.version)
       WHEN NOT MATCHED THEN INSERT (version, status)
         VALUES (source.version, 'STARTED')`,
      { version },
    );
    await connection.commit();
  }

  private async getExistingObjects(
    connection: Connection,
  ): Promise<Set<string>> {
    const result = await connection.execute<OracleObjectRow>(
      `SELECT object_name, object_type
       FROM user_objects
       WHERE object_type IN ('TABLE', 'INDEX', 'SEQUENCE', 'VIEW')`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    return new Set(
      (result.rows ?? []).map((row) => `${row.OBJECT_TYPE}:${row.OBJECT_NAME}`),
    );
  }

  private getMigrations(): Migration[] {
    const migrationDirectory = this.getMigrationDirectory();

    return readdirSync(migrationDirectory)
      .filter((fileName) => fileName.endsWith('.sql'))
      .sort()
      .map((fileName) => {
        const statements = readFileSync(
          resolve(migrationDirectory, fileName),
          'utf8',
        )
          .split(/\r?\n-- statement\r?\n/)
          .map((statement) => statement.trim())
          .filter((statement) => statement.length > 0);
        return {
          version: fileName.replace(/\.sql$/, ''),
          statements,
          objects: statements.flatMap((statement) => {
            const match =
              /^CREATE\s+(?:UNIQUE\s+)?(TABLE|INDEX|SEQUENCE|VIEW)\s+([A-Z][A-Z0-9_$#]*)/i.exec(
                statement,
              );
            if (!match) {
              return [];
            }
            return [
              {
                type: match[1].toUpperCase() as OracleObjectType,
                name: match[2].toUpperCase(),
              },
            ];
          }),
        };
      });
  }

  private objectKey(object: MigrationObject): string {
    return `${object.type}:${object.name}`;
  }

  private dropStatement(object: MigrationObject): string {
    if (object.type === 'TABLE') {
      return `DROP TABLE ${object.name} CASCADE CONSTRAINTS PURGE`;
    }
    return `DROP ${object.type} ${object.name}`;
  }

  private getMigrationDirectory(): string {
    const fromRepositoryRoot = resolve(
      process.cwd(),
      'infra/oracle/migrations',
    );
    const fromApiDirectory = resolve(
      process.cwd(),
      '../../infra/oracle/migrations',
    );

    if (existsSync(fromRepositoryRoot)) {
      return fromRepositoryRoot;
    }

    return fromApiDirectory;
  }
}
