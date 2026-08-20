import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

import { envSchema } from './common/config/env.schema';
import { MigrationRunner } from './common/database/migration-runner';
import {
  assertOracleServiceSchema,
  DEV_ORACLE_SCHEMA,
} from './common/database/oracle-schema.guard';
import { OracleModule } from './common/database/oracle.module';
import { OracleService } from './common/database/oracle.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => envSchema.parse(config),
    }),
    OracleModule,
  ],
})
class MigrationModule {}

export interface MigrationContext {
  get<T>(token: unknown): T;
  close(): Promise<void>;
}

type MigrationContextFactory = () => Promise<MigrationContext>;
type ErrorReporter = (message: string) => void;
type MigrationConfiguration = {
  getOrThrow<T>(propertyPath: string): T;
};

async function createMigrationContext(): Promise<MigrationContext> {
  return NestFactory.createApplicationContext(MigrationModule, {
    logger: false,
  });
}

export async function migrate(
  contextFactory: MigrationContextFactory = createMigrationContext,
): Promise<void> {
  const context = await contextFactory();

  try {
    await context.get<MigrationRunner>(MigrationRunner).run();
  } finally {
    await context.close();
  }
}

export async function migrateDevelopmentSchema(
  contextFactory: MigrationContextFactory = createMigrationContext,
  configuration?: MigrationConfiguration,
): Promise<void> {
  const context = await contextFactory();

  try {
    const config =
      configuration ?? context.get<MigrationConfiguration>(ConfigService);
    if (config.getOrThrow<string>('NODE_ENV') !== 'development') {
      throw new Error('DEV migration requires NODE_ENV=development');
    }
    if (
      config.getOrThrow<string>('ORACLE_USER').trim().toUpperCase() !==
      DEV_ORACLE_SCHEMA
    ) {
      throw new Error('DEV migration requires the SLOW_DATING_DEV Oracle user');
    }
    await assertOracleServiceSchema(
      context.get<OracleService>(OracleService),
      DEV_ORACLE_SCHEMA,
      'DEV migration',
    );
    await context.get<MigrationRunner>(MigrationRunner).run();
  } finally {
    await context.close();
  }
}

export async function runMigrationCli(
  migrateSchema: () => Promise<void> = migrate,
  reportError: ErrorReporter = (message) => console.error(message),
): Promise<number> {
  try {
    await migrateSchema();
    return 0;
  } catch {
    reportError(
      'Oracle migration failed. Verify the configured schema and connection.',
    );
    return 1;
  }
}

export async function runDevelopmentMigrationCli(
  migrateSchema: () => Promise<void> = migrateDevelopmentSchema,
  reportError: ErrorReporter = (message) => console.error(message),
): Promise<number> {
  try {
    await migrateSchema();
    return 0;
  } catch {
    reportError(
      'DEV Oracle migration failed. Verify the development schema and configuration.',
    );
    return 1;
  }
}

if (require.main === module) {
  void runMigrationCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
