import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

import { envSchema } from './common/config/env.schema';
import {
  MigrationRunner,
  PartialMigrationError,
} from './common/database/migration-runner';
import {
  assertOracleServiceSchema,
  DEV_ORACLE_SCHEMA,
  TEST_ORACLE_SCHEMA,
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

export async function migrateDevelopmentSchema(
  contextFactory: MigrationContextFactory = createMigrationContext,
  configuration?: MigrationConfiguration,
): Promise<void> {
  const context = await contextFactory();

  try {
    await assertDevelopmentContext(context, configuration, 'DEV migration');
    await context.get<MigrationRunner>(MigrationRunner).run();
  } finally {
    await context.close();
  }
}

export async function recoverDevelopmentSchema(
  contextFactory: MigrationContextFactory = createMigrationContext,
  configuration?: MigrationConfiguration,
): Promise<void> {
  const context = await contextFactory();

  try {
    await assertDevelopmentContext(
      context,
      configuration,
      'DEV migration recovery',
    );
    const runner = context.get<MigrationRunner>(MigrationRunner);
    await runner.recoverLocalSchema('development');
    await runner.run();
  } finally {
    await context.close();
  }
}

export async function recoverTestSchema(
  contextFactory: MigrationContextFactory = createMigrationContext,
  configuration?: MigrationConfiguration,
): Promise<void> {
  const context = await contextFactory();

  try {
    const config =
      configuration ?? context.get<MigrationConfiguration>(ConfigService);
    if (config.getOrThrow<string>('NODE_ENV') !== 'test') {
      throw new Error('TEST migration recovery requires NODE_ENV=test');
    }
    if (
      config.getOrThrow<string>('ORACLE_USER').trim().toUpperCase() !==
      TEST_ORACLE_SCHEMA
    ) {
      throw new Error(
        'TEST migration recovery requires the SLOW_DATING_TEST Oracle user',
      );
    }
    await assertOracleServiceSchema(
      context.get<OracleService>(OracleService),
      TEST_ORACLE_SCHEMA,
      'TEST migration recovery',
    );
    const runner = context.get<MigrationRunner>(MigrationRunner);
    await runner.recoverLocalSchema('test');
    await runner.run();
  } finally {
    await context.close();
  }
}

export async function runDevelopmentMigrationCli(
  migrateSchema: () => Promise<void> = migrateDevelopmentSchema,
  reportError: ErrorReporter = (message) => console.error(message),
): Promise<number> {
  try {
    await migrateSchema();
    return 0;
  } catch (error) {
    reportError(
      error instanceof PartialMigrationError
        ? 'Partial Oracle migration detected. Run npm run migrate:recover:dev before retrying.'
        : 'DEV Oracle migration failed. Verify the development schema and configuration.',
    );
    return 1;
  }
}

export async function runDevelopmentRecoveryCli(
  recoverSchema: () => Promise<void> = recoverDevelopmentSchema,
  reportError: ErrorReporter = (message) => console.error(message),
): Promise<number> {
  try {
    await recoverSchema();
    return 0;
  } catch {
    reportError(
      'DEV Oracle recovery failed. Verify the development schema and configuration.',
    );
    return 1;
  }
}

export async function runTestRecoveryCli(
  recoverSchema: () => Promise<void> = recoverTestSchema,
  reportError: ErrorReporter = (message) => console.error(message),
): Promise<number> {
  try {
    await recoverSchema();
    return 0;
  } catch {
    reportError(
      'TEST Oracle recovery failed. Verify the canonical test schema and configuration.',
    );
    return 1;
  }
}

async function assertDevelopmentContext(
  context: MigrationContext,
  configuration: MigrationConfiguration | undefined,
  operation: string,
): Promise<void> {
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
    operation,
  );
}
