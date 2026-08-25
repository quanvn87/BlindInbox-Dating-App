import { MigrationRunner } from './migration-runner';
import {
  assertDistinctOracleUsers,
  assertOracleServiceSchema,
  TEST_ORACLE_SCHEMA,
} from './oracle-schema.guard';
import { OracleService } from './oracle.service';

export interface OracleTestContext {
  get<T>(token: unknown): T;
}

export function configureOracleTestEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): void {
  const developmentUser = environment.ORACLE_USER;
  const testOracleUser = environment.ORACLE_TEST_USER;
  const testOraclePassword = environment.ORACLE_TEST_PASSWORD;
  const testOracleConnectString = environment.ORACLE_TEST_CONNECT_STRING;

  if (!testOracleUser || !testOraclePassword || !testOracleConnectString) {
    throw new Error(
      'ORACLE_TEST_USER, ORACLE_TEST_PASSWORD, and ORACLE_TEST_CONNECT_STRING must be set for Oracle test execution',
    );
  }
  assertDistinctOracleUsers(developmentUser, testOracleUser);
  if (testOracleUser.trim().toUpperCase() !== TEST_ORACLE_SCHEMA) {
    throw new Error('ORACLE_TEST_USER must be SLOW_DATING_TEST');
  }

  environment.ORACLE_USER = testOracleUser;
  environment.ORACLE_PASSWORD = testOraclePassword;
  environment.ORACLE_CONNECT_STRING = testOracleConnectString;
  environment.JWT_ACCESS_SECRET = 'test-access-secret-at-least-32-characters';
  environment.OTP_PEPPER = 'test-otp-pepper-at-least-32-characters';
  environment.REFRESH_TOKEN_PEPPER =
    'test-refresh-pepper-at-least-32-characters';
}

export async function migrateCanonicalOracleTestSchema(
  context: OracleTestContext,
): Promise<void> {
  const oracleService = context.get<OracleService>(OracleService);
  await assertOracleServiceSchema(
    oracleService,
    TEST_ORACLE_SCHEMA,
    'TEST migration',
  );
  await context.get<MigrationRunner>(MigrationRunner).run();
}
