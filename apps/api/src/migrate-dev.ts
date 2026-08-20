import { runDevelopmentMigrationCli } from './migrate';

void runDevelopmentMigrationCli().then((exitCode) => {
  process.exitCode = exitCode;
});
