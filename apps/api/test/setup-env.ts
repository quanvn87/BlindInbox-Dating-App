import { config as loadEnvironment } from 'dotenv';
import { resolve } from 'node:path';

import { configureOracleTestEnvironment } from './oracle-test-environment';

process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
loadEnvironment({ path: resolve(process.cwd(), '.env'), quiet: true });

configureOracleTestEnvironment();
