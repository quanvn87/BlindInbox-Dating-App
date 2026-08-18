import { Module } from '@nestjs/common';
import { OracleModule } from '../../common/database/oracle.module';
import { HealthController } from './health.controller';

@Module({
  imports: [OracleModule],
  controllers: [HealthController],
})
export class HealthModule {}
