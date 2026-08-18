import { Global, Module } from '@nestjs/common';
import { MigrationRunner } from './migration-runner';
import { OracleService } from './oracle.service';

@Global()
@Module({
  providers: [OracleService, MigrationRunner],
  exports: [OracleService, MigrationRunner],
})
export class OracleModule {}
