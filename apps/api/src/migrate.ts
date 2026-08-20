import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { envSchema } from './common/config/env.schema';
import { MigrationRunner } from './common/database/migration-runner';
import { OracleModule } from './common/database/oracle.module';

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
  get(token: typeof MigrationRunner): MigrationRunner;
  close(): Promise<void>;
}

type MigrationContextFactory = () => Promise<MigrationContext>;
type ErrorReporter = (message: string) => void;

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
    await context.get(MigrationRunner).run();
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

if (require.main === module) {
  void runMigrationCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
