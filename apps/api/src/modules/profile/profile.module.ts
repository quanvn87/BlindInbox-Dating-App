import { Module } from '@nestjs/common';

import { OracleModule } from '../../common/database/oracle.module';
import { IdempotencyKeyPipe } from '../../common/http/idempotency-key.pipe';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { AuthModule } from '../auth/auth.module';
import { OracleProfileRepository } from './oracle-profile.repository';
import { ProfileController } from './profile.controller';
import { PROFILE_REPOSITORY } from './profile.repository';
import type { ProfileRepository } from './profile.repository';
import { ProfileService } from './profile.service';

@Module({
  imports: [OracleModule, AuthModule],
  controllers: [ProfileController],
  providers: [
    IdempotencyKeyPipe,
    AccessTokenGuard,
    OracleProfileRepository,
    {
      provide: PROFILE_REPOSITORY,
      useExisting: OracleProfileRepository,
    },
    {
      provide: ProfileService,
      inject: [PROFILE_REPOSITORY],
      useFactory: (repository: ProfileRepository): ProfileService =>
        new ProfileService(repository),
    },
  ],
  exports: [PROFILE_REPOSITORY],
})
export class ProfileModule {}
