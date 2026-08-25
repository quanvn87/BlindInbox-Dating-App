import { config as loadEnvironment } from 'dotenv';
import { resolve } from 'node:path';

import { configureOracleTestEnvironment } from './common/database/oracle-test-environment';
import { runTestRecoveryCli } from './migrate';

process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
loadEnvironment({ path: resolve(process.cwd(), '.env'), quiet: true });
configureOracleTestEnvironment();

void runTestRecoveryCli().then((exitCode) => {
  process.exitCode = exitCode;
});
