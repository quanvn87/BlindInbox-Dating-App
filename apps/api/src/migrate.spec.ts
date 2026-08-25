import {
  migrateDevelopmentSchema,
  recoverDevelopmentSchema,
  runDevelopmentMigrationCli,
  type MigrationContext,
} from './migrate';
import { PartialMigrationError } from './common/database/migration-runner';

describe('Oracle migration CLI', () => {
  it('rejects a non-development environment before migrating', async () => {
    const close = jest.fn().mockResolvedValue(undefined);
    const context = {
      get: jest.fn(),
      close,
    } as unknown as MigrationContext;

    await expect(
      migrateDevelopmentSchema(() => Promise.resolve(context), {
        getOrThrow: jest.fn((key: string) =>
          key === 'NODE_ENV' ? 'test' : 'SLOW_DATING_DEV',
        ),
      }),
    ).rejects.toThrow('DEV migration requires NODE_ENV=development');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('rejects a TEST Oracle user before migrating DEV', async () => {
    const run = jest.fn();
    const close = jest.fn().mockResolvedValue(undefined);
    const context = {
      get: jest.fn().mockReturnValue({ run }),
      close,
    } as unknown as MigrationContext;

    await expect(
      migrateDevelopmentSchema(() => Promise.resolve(context), {
        getOrThrow: jest.fn((key: string) =>
          key === 'NODE_ENV' ? 'development' : 'SLOW_DATING_TEST',
        ),
      }),
    ).rejects.toThrow('DEV migration requires the SLOW_DATING_DEV Oracle user');
    expect(run).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('recovers and reapplies DEV only after checking the connected identity', async () => {
    const calls: string[] = [];
    const runner = {
      recoverLocalSchema: jest.fn().mockImplementation(() => {
        calls.push('recover');
        return Promise.resolve();
      }),
      run: jest.fn().mockImplementation(() => {
        calls.push('run');
        return Promise.resolve();
      }),
    };
    const oracleService = {
      withConnection: (callback: (connection: unknown) => unknown) =>
        callback({
          execute: jest.fn().mockImplementation(() => {
            calls.push('identity');
            return Promise.resolve({
              rows: [
                {
                  SESSION_USER: 'SLOW_DATING_DEV',
                  CURRENT_SCHEMA: 'SLOW_DATING_DEV',
                },
              ],
            });
          }),
        }),
    };
    const close = jest.fn().mockResolvedValue(undefined);
    const context = {
      get: jest.fn((token: { name?: string }) =>
        token.name === 'MigrationRunner' ? runner : oracleService,
      ),
      close,
    } as unknown as MigrationContext;

    await recoverDevelopmentSchema(() => Promise.resolve(context), {
      getOrThrow: jest.fn((key: string) =>
        key === 'NODE_ENV' ? 'development' : 'SLOW_DATING_DEV',
      ),
    });

    expect(calls).toEqual(['identity', 'recover', 'run']);
    expect(runner.recoverLocalSchema).toHaveBeenCalledWith('development');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('directs a detected partial migration to the guarded DEV recovery command', async () => {
    const messages: string[] = [];

    await expect(
      runDevelopmentMigrationCli(
        () => Promise.reject(new PartialMigrationError('002_profile')),
        (message) => messages.push(message),
      ),
    ).resolves.toBe(1);

    expect(messages).toEqual([
      'Partial Oracle migration detected. Run npm run migrate:recover:dev before retrying.',
    ]);
    expect(messages.join(' ')).not.toContain('002_profile');
  });
});
