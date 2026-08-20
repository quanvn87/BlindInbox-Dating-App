import oracledb from 'oracledb';

import { OracleService } from './oracle.service';

export const DEV_ORACLE_SCHEMA = 'SLOW_DATING_DEV';
export const TEST_ORACLE_SCHEMA = 'SLOW_DATING_TEST';

export interface OracleSchemaIdentity {
  SESSION_USER?: string;
  CURRENT_SCHEMA?: string;
}

function normalized(value: string | undefined): string {
  return value?.trim().toUpperCase() ?? '';
}

export function assertDistinctOracleUsers(
  developmentUser: string | undefined,
  testUser: string | undefined,
): void {
  if (normalized(developmentUser) === normalized(testUser)) {
    throw new Error(
      'TEST Oracle user must differ from the configured DEV Oracle user',
    );
  }
}

export function assertCanonicalOracleSchema(
  identity: OracleSchemaIdentity | undefined,
  expectedSchema: string,
  operation: string,
): void {
  const expected = normalized(expectedSchema);
  if (
    normalized(identity?.SESSION_USER) !== expected ||
    normalized(identity?.CURRENT_SCHEMA) !== expected
  ) {
    throw new Error(`${operation} requires the ${expected} Oracle schema`);
  }
}

export async function assertOracleServiceSchema(
  oracleService: OracleService,
  expectedSchema: string,
  operation: string,
): Promise<void> {
  const result = await oracleService.withConnection((connection) =>
    connection.execute<OracleSchemaIdentity>(
      `SELECT USER AS session_user,
              SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA') AS current_schema
       FROM dual`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    ),
  );
  assertCanonicalOracleSchema(result.rows?.[0], expectedSchema, operation);
}
