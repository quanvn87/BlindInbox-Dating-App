import {
  assertOracleServiceSchema,
  assertCanonicalOracleSchema,
  assertDistinctOracleUsers,
} from './oracle-schema.guard';

describe('Oracle schema guards', () => {
  it('rejects TEST aliases configured with the DEV Oracle user', () => {
    expect(() =>
      assertDistinctOracleUsers('SLOW_DATING_DEV', 'slow_dating_dev'),
    ).toThrow(
      'TEST Oracle user must differ from the configured DEV Oracle user',
    );
  });

  it('accepts distinct DEV and TEST Oracle users', () => {
    expect(() =>
      assertDistinctOracleUsers('SLOW_DATING_DEV', 'SLOW_DATING_TEST'),
    ).not.toThrow();
  });

  it('rejects a destructive TEST operation for an unexpected connected schema', () => {
    expect(() =>
      assertCanonicalOracleSchema(
        { SESSION_USER: 'SLOW_DATING_DEV', CURRENT_SCHEMA: 'SLOW_DATING_DEV' },
        'SLOW_DATING_TEST',
        'TEST cleanup',
      ),
    ).toThrow('TEST cleanup requires the SLOW_DATING_TEST Oracle schema');
  });

  it('accepts the canonical connected TEST schema', () => {
    expect(() =>
      assertCanonicalOracleSchema(
        {
          SESSION_USER: 'SLOW_DATING_TEST',
          CURRENT_SCHEMA: 'SLOW_DATING_TEST',
        },
        'SLOW_DATING_TEST',
        'TEST cleanup',
      ),
    ).not.toThrow();
  });

  it('queries the connected schema before authorizing TEST cleanup', async () => {
    const execute = jest.fn().mockResolvedValue({
      rows: [
        { SESSION_USER: 'SLOW_DATING_DEV', CURRENT_SCHEMA: 'SLOW_DATING_DEV' },
      ],
    });
    const oracleService = {
      withConnection: (
        callback: (connection: { execute: typeof execute }) => unknown,
      ) => callback({ execute }),
    };

    await expect(
      assertOracleServiceSchema(
        oracleService as never,
        'SLOW_DATING_TEST',
        'TEST cleanup',
      ),
    ).rejects.toThrow(
      'TEST cleanup requires the SLOW_DATING_TEST Oracle schema',
    );
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
