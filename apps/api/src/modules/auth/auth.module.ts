import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { OracleModule } from '../../common/database/oracle.module';
import { IdempotencyKeyPipe } from '../../common/http/idempotency-key.pipe';
import { AuthController } from './auth.controller';
import { AUTH_REPOSITORY } from './auth.repository';
import type { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import {
  DevelopmentOtpProvider,
  RuntimeEnvironment,
} from './development-otp.provider';
import { OracleAuthRepository } from './oracle-auth.repository';
import { OTP_PROVIDER } from './otp.provider';
import type { OtpProvider } from './otp.provider';
import { TokenService } from './token.service';

@Module({
  imports: [OracleModule],
  controllers: [AuthController],
  providers: [
    IdempotencyKeyPipe,
    OracleAuthRepository,
    {
      provide: AUTH_REPOSITORY,
      useExisting: OracleAuthRepository,
    },
    {
      provide: OTP_PROVIDER,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): OtpProvider =>
        new DevelopmentOtpProvider(
          configService.getOrThrow<RuntimeEnvironment>('NODE_ENV'),
        ),
    },
    {
      provide: TokenService,
      inject: [AUTH_REPOSITORY, ConfigService],
      useFactory: (
        repository: AuthRepository,
        configService: ConfigService,
      ): TokenService =>
        new TokenService(
          repository,
          configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
          configService.getOrThrow<string>('REFRESH_TOKEN_PEPPER'),
        ),
    },
    {
      provide: AuthService,
      inject: [AUTH_REPOSITORY, OTP_PROVIDER, TokenService, ConfigService],
      useFactory: (
        repository: AuthRepository,
        otpProvider: OtpProvider,
        tokenService: TokenService,
        configService: ConfigService,
      ): AuthService =>
        new AuthService(
          repository,
          otpProvider,
          tokenService,
          configService.getOrThrow<string>('OTP_PEPPER'),
        ),
    },
  ],
  exports: [TokenService],
})
export class AuthModule {}
