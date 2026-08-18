import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
const localEnvironmentPath = resolve(process.cwd(), '.env');

if (existsSync(localEnvironmentPath)) {
  const localEnvironment = new Map(
    readFileSync(localEnvironmentPath, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.includes('='))
      .map((line) => {
        const separatorIndex = line.indexOf('=');
        return [
          line.slice(0, separatorIndex),
          line.slice(separatorIndex + 1),
        ] as const;
      }),
  );

  process.env.ORACLE_USER ??= localEnvironment.get('ORACLE_TEST_USER');
  process.env.ORACLE_PASSWORD ??= localEnvironment.get('ORACLE_TEST_PASSWORD');
  process.env.ORACLE_CONNECT_STRING ??= localEnvironment.get(
    'ORACLE_CONNECT_STRING',
  );
}

process.env.JWT_ACCESS_SECRET = 'test-access-secret-at-least-32-characters';
process.env.OTP_PEPPER = 'test-otp-pepper-at-least-32-characters';
process.env.REFRESH_TOKEN_PEPPER = 'test-refresh-pepper-at-least-32-characters';
