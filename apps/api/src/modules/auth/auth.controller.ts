import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

import { IdempotencyKeyPipe } from '../../common/http/idempotency-key.pipe';
import { AuthService } from './auth.service';
import { AuthError } from './auth.types';
import type {
  AuthTokens as AuthTokensContract,
  OtpRequestResult as OtpRequestResultContract,
} from './auth.types';
import { AuthTokens, OtpRequestResult } from './dto/auth-tokens.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@Controller('auth')
@ApiTags('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly idempotencyKeyPipe: IdempotencyKeyPipe,
  ) {}

  @Post('otp/request')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ type: RequestOtpDto })
  @ApiAcceptedResponse({ type: OtpRequestResult })
  @ApiBadRequestResponse({ description: 'Invalid request or idempotency key' })
  requestOtp(
    @Headers('idempotency-key') idempotencyKey: unknown,
    @Body() body: unknown,
  ): Promise<OtpRequestResultContract> {
    this.idempotencyKeyPipe.transform(idempotencyKey);
    const dto = RequestOtpDto.parse(body);
    return this.authService.requestOtp(
      this.normalizeVietnamesePhone(dto.phone),
    );
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ type: VerifyOtpDto })
  @ApiOkResponse({ type: AuthTokens })
  @ApiBadRequestResponse({ description: 'Invalid or expired OTP' })
  @ApiConflictResponse({ description: 'OTP challenge was already consumed' })
  verifyOtp(
    @Headers('idempotency-key') idempotencyKey: unknown,
    @Body() body: unknown,
  ): Promise<AuthTokensContract> {
    this.idempotencyKeyPipe.transform(idempotencyKey);
    const dto = VerifyOtpDto.parse(body);
    return this.mapAuthErrors(() =>
      this.authService.verifyOtp(dto.challengeId, dto.code, dto.deviceName),
    );
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiOkResponse({ type: AuthTokens })
  @ApiBadRequestResponse({ description: 'Invalid request or idempotency key' })
  @ApiUnauthorizedResponse({ description: 'Refresh token is invalid' })
  refresh(
    @Headers('idempotency-key') idempotencyKey: unknown,
    @Body() body: unknown,
  ): Promise<AuthTokensContract> {
    this.idempotencyKeyPipe.transform(idempotencyKey);
    const dto = RefreshTokenDto.parse(body);
    return this.mapAuthErrors(() => this.authService.refresh(dto.refreshToken));
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ type: LogoutDto })
  @ApiNoContentResponse({ description: 'Session revoked' })
  @ApiBadRequestResponse({ description: 'Invalid request or idempotency key' })
  async logout(
    @Headers('idempotency-key') idempotencyKey: unknown,
    @Body() body: unknown,
  ): Promise<void> {
    this.idempotencyKeyPipe.transform(idempotencyKey);
    const dto = LogoutDto.parse(body);
    await this.authService.logout(dto.refreshToken);
  }

  private normalizeVietnamesePhone(rawPhone: string): string {
    const phone = parsePhoneNumberFromString(rawPhone, {
      defaultCountry: 'VN',
      extract: false,
    });
    if (!phone?.isValid() || phone.country !== 'VN' || phone.ext) {
      throw new BadRequestException('Invalid Vietnamese phone number');
    }
    return phone.number;
  }

  private async mapAuthErrors<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error: unknown) {
      if (!(error instanceof AuthError)) {
        throw error;
      }
      if (error.code === 'OTP_CONSUMED') {
        throw new ConflictException({ code: error.code });
      }
      if (error.code === 'REFRESH_TOKEN_INVALID') {
        throw new UnauthorizedException({ code: error.code });
      }
      throw new BadRequestException({ code: error.code });
    }
  }
}
