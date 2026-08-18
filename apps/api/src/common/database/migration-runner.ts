import { Injectable } from '@nestjs/common';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import oracledb from 'oracledb';
import { OracleService } from './oracle.service';

type MigrationRow = {
  VERSION: string;
};

@Injectable()
export class MigrationRunner {
  constructor(private readonly oracleService: OracleService) {}

  async run(): Promise<void> {
    const migrations = this.getMigrations();
    const appliedVersions = await this.getAppliedVersions();

    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) {
        continue;
      }

      await this.oracleService.withTransaction(async (connection) => {
        for (const statement of migration.statements) {
          await connection.execute(statement);
        }

        await connection.execute(
          'INSERT INTO schema_migrations (version) VALUES (:version)',
          { version: migration.version },
        );
      });
    }
  }

  private async getAppliedVersions(): Promise<Set<string>> {
    return this.oracleService.withConnection(async (connection) => {
      const tableResult = await connection.execute<{ TABLE_NAME: string }>(
        "SELECT table_name FROM user_tables WHERE table_name = 'SCHEMA_MIGRATIONS'",
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );

      if (!tableResult.rows?.length) {
        return new Set<string>();
      }

      const migrationResult = await connection.execute<MigrationRow>(
        'SELECT version FROM schema_migrations',
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );

      return new Set((migrationResult.rows ?? []).map((row) => row.VERSION));
    });
  }

  private getMigrations(): Array<{ version: string; statements: string[] }> {
    const migrationDirectory = this.getMigrationDirectory();

    return readdirSync(migrationDirectory)
      .filter((fileName) => fileName.endsWith('.sql'))
      .sort()
      .map((fileName) => ({
        version: fileName.replace(/\.sql$/, ''),
        statements: readFileSync(resolve(migrationDirectory, fileName), 'utf8')
          .split(/\r?\n-- statement\r?\n/)
          .map((statement) => statement.trim())
          .filter((statement) => statement.length > 0),
      }));
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
