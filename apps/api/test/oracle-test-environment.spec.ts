import { configureOracleTestEnvironment } from './oracle-test-environment';

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
});
