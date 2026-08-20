import { runDevelopmentRecoveryCli } from './migrate';

void runDevelopmentRecoveryCli().then((exitCode) => {
  process.exitCode = exitCode;
});
