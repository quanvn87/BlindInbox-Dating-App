import { config as loadEnvironment } from 'dotenv';
import { resolve } from 'node:path';

process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
loadEnvironment({ path: resolve(process.cwd(), '.env'), quiet: true });

const testOracleUser = process.env.ORACLE_TEST_USER;
const testOraclePassword = process.env.ORACLE_TEST_PASSWORD;
const testOracleConnectString = process.env.ORACLE_TEST_CONNECT_STRING;

if (!testOracleUser || !testOraclePassword || !testOracleConnectString) {
  throw new Error(
    'ORACLE_TEST_USER, ORACLE_TEST_PASSWORD, and ORACLE_TEST_CONNECT_STRING must be set for Oracle test execution',
  );
}

process.env.ORACLE_USER = testOracleUser;
process.env.ORACLE_PASSWORD = testOraclePassword;
process.env.ORACLE_CONNECT_STRING = testOracleConnectString;
process.env.JWT_ACCESS_SECRET = 'test-access-secret-at-least-32-characters';
process.env.OTP_PEPPER = 'test-otp-pepper-at-least-32-characters';
process.env.REFRESH_TOKEN_PEPPER = 'test-refresh-pepper-at-least-32-characters';
