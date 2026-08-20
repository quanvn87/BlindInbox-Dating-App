import { MigrationRunner } from './common/database/migration-runner';
import { migrate, runMigrationCli, type MigrationContext } from './migrate';

describe('Oracle migration CLI', () => {
  it('runs migrations through MigrationRunner and closes the context', async () => {
    const run = jest.fn().mockResolvedValue(undefined);
    const close = jest.fn().mockResolvedValue(undefined);
    const get = jest.fn().mockReturnValue({ run });
    const context: MigrationContext = { get, close };

    await migrate(() => Promise.resolve(context));

    expect(get).toHaveBeenCalledWith(MigrationRunner);
    expect(run).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('closes the context when a migration fails', async () => {
    const migrationError = new Error('migration failed');
    const close = jest.fn().mockResolvedValue(undefined);
    const context: MigrationContext = {
      get: jest.fn().mockReturnValue({
        run: jest.fn().mockRejectedValue(migrationError),
      }),
      close,
    };

    await expect(migrate(() => Promise.resolve(context))).rejects.toBe(
      migrationError,
    );
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('returns failure without logging credential-bearing error details', async () => {
    const reportError = jest.fn();

    const exitCode = await runMigrationCli(
      () => Promise.reject(new Error('password=do-not-print')),
      reportError,
    );

    expect(exitCode).toBe(1);
    expect(reportError).toHaveBeenCalledWith(
      'Oracle migration failed. Verify the configured schema and connection.',
    );
    expect(JSON.stringify(reportError.mock.calls)).not.toContain(
      'do-not-print',
    );
  });
});
