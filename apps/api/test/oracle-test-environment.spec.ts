import { configureOracleTestEnvironment } from './oracle-test-environment';
import { migrateCanonicalOracleTestSchema } from './oracle-test-environment';

describe('Oracle TEST environment setup', () => {
  it('rejects TEST aliases that match the configured DEV user before remapping', () => {
    const environment: NodeJS.ProcessEnv = {
      ORACLE_USER: 'SLOW_DATING_DEV',
      ORACLE_TEST_USER: 'slow_dating_dev',
      ORACLE_TEST_PASSWORD: 'test-password',
      ORACLE_TEST_CONNECT_STRING: 'localhost:1521/XEPDB1',
    };

    expect(() => configureOracleTestEnvironment(environment)).toThrow(
      'TEST Oracle user must differ from the configured DEV Oracle user',
    );
    expect(environment.ORACLE_USER).toBe('SLOW_DATING_DEV');
  });

  it('rejects a mistyped TEST alias before remapping runtime credentials', () => {
    const environment: NodeJS.ProcessEnv = {
      ORACLE_USER: 'SLOW_DATING_DEV',
      ORACLE_TEST_USER: 'SLOW_DATING_TSET',
      ORACLE_TEST_PASSWORD: 'test-password',
      ORACLE_TEST_CONNECT_STRING: 'localhost:1521/XEPDB1',
    };

    expect(() => configureOracleTestEnvironment(environment)).toThrow(
      'ORACLE_TEST_USER must be SLOW_DATING_TEST',
    );
    expect(environment.ORACLE_USER).toBe('SLOW_DATING_DEV');
  });

  it('does not start migration when the connected TEST identity is noncanonical', async () => {
    const run = jest.fn();
    const execute = jest.fn().mockResolvedValue({
      rows: [
        { SESSION_USER: 'SLOW_DATING_DEV', CURRENT_SCHEMA: 'SLOW_DATING_DEV' },
      ],
    });
    const context = {
      get: jest.fn((token: { name?: string }) =>
        token.name === 'OracleService'
          ? {
              withConnection: (callback: (value: unknown) => unknown) =>
                callback({ execute }),
            }
          : { run },
      ),
    };

    await expect(
      migrateCanonicalOracleTestSchema(context as never),
    ).rejects.toThrow(
      'TEST migration requires the SLOW_DATING_TEST Oracle schema',
    );
    expect(run).not.toHaveBeenCalled();
  });
});
