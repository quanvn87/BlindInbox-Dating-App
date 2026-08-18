import {
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';

import type { AuthRepository } from './auth.repository';
import type { ConsumeOtpChallengeResult } from './auth.repository';
import type { OtpProvider } from './otp.provider';
import { TokenService } from './token.service';
import {
  AuthError,
  OTP_LIFETIME_MS,
  OTP_MAXIMUM_ATTEMPTS,
  systemClock,
} from './auth.types';
import type { AuthTokens, Clock, OtpRequestResult } from './auth.types';

type RandomIntGenerator = (maximumExclusive: number) => number;
type IdGenerator = () => string;

export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly otpProvider: OtpProvider,
    private readonly tokenService: TokenService,
    private readonly otpPepper: string,
    private readonly clock: Clock = systemClock,
    private readonly randomIntGenerator: RandomIntGenerator = randomInt,
    private readonly idGenerator: IdGenerator = randomUUID,
  ) {}

  async requestOtp(phoneE164: string): Promise<OtpRequestResult> {
    const now = this.clock.now();
    const challengeId = this.idGenerator();
    const code = this.randomIntGenerator(1_000_000).toString().padStart(6, '0');
    const expiresAt = new Date(now.getTime() + OTP_LIFETIME_MS);

    await this.repository.createOtpChallenge({
      id: challengeId,
      phoneE164,
      codeDigest: this.digestOtp(challengeId, code),
      attempts: 0,
      expiresAt,
      consumedAt: null,
      createdAt: new Date(now),
    });
    await this.otpProvider.send(phoneE164, code);

    return { challengeId, expiresAt };
  }

  async verifyOtp(
    challengeId: string,
    code: string,
    deviceName: string,
  ): Promise<AuthTokens> {
    const now = this.clock.now();
    const challenge = await this.repository.findOtpChallengeById(challengeId);
    if (!challenge) {
      throw new AuthError('OTP_INVALID');
    }
    if (challenge.consumedAt) {
      throw new AuthError('OTP_CONSUMED');
    }
    if (challenge.expiresAt.getTime() <= now.getTime()) {
      throw new AuthError('OTP_EXPIRED');
    }
    if (challenge.attempts >= OTP_MAXIMUM_ATTEMPTS) {
      throw new AuthError('OTP_ATTEMPTS_EXCEEDED');
    }

    if (
      !this.digestsMatch(
        challenge.codeDigest,
        this.digestOtp(challengeId, code),
      )
    ) {
      const attempts = await this.repository.incrementOtpAttempts(
        challengeId,
        OTP_MAXIMUM_ATTEMPTS,
      );
      if (attempts === null || attempts >= OTP_MAXIMUM_ATTEMPTS) {
        throw new AuthError('OTP_ATTEMPTS_EXCEEDED');
      }
      throw new AuthError('OTP_INVALID');
    }

    const consumption = await this.repository.consumeOtpChallenge(
      challengeId,
      now,
      OTP_MAXIMUM_ATTEMPTS,
    );
    if (consumption !== 'CONSUMED') {
      throw this.consumptionError(consumption);
    }
    const user = await this.repository.findOrCreateUserByPhone(
      challenge.phoneE164,
    );
    return this.tokenService.issue(user, deviceName);
  }

  refresh(refreshToken: string): Promise<AuthTokens> {
    return this.tokenService.refresh(refreshToken);
  }

  logout(refreshToken: string): Promise<void> {
    return this.tokenService.logout(refreshToken);
  }

  private digestOtp(challengeId: string, code: string): string {
    return createHmac('sha256', this.otpPepper)
      .update(`${challengeId}:${code}`)
      .digest('hex');
  }

  private consumptionError(result: ConsumeOtpChallengeResult): AuthError {
    switch (result) {
      case 'EXPIRED':
        return new AuthError('OTP_EXPIRED');
      case 'ATTEMPTS_EXCEEDED':
        return new AuthError('OTP_ATTEMPTS_EXCEEDED');
      case 'NOT_FOUND':
        return new AuthError('OTP_INVALID');
      case 'ALREADY_CONSUMED':
      case 'CONSUMED':
        return new AuthError('OTP_CONSUMED');
    }
  }

  private digestsMatch(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, 'hex');
    const rightBuffer = Buffer.from(right, 'hex');
    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }
}
