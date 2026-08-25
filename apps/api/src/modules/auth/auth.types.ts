export const OTP_LIFETIME_MS = 5 * 60 * 1000;
export const OTP_MAXIMUM_ATTEMPTS = 5;
export const ACCESS_TOKEN_LIFETIME_SECONDS = 15 * 60;
export const REFRESH_TOKEN_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

export interface AuthUser {
  id: string;
  phoneE164: string;
  status: UserStatus;
}

export interface OtpChallenge {
  id: string;
  phoneE164: string;
  codeDigest: string;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

export interface RefreshSession {
  id: string;
  userId: string;
  tokenDigest: string;
  deviceName: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface OtpRequestResult {
  challengeId: string;
  expiresAt: Date;
}

export interface AuthTokens {
  accessToken: string;
  accessExpiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
}

export type AuthErrorCode =
  | 'OTP_INVALID'
  | 'OTP_EXPIRED'
  | 'OTP_ATTEMPTS_EXCEEDED'
  | 'OTP_CONSUMED'
  | 'ACCOUNT_INACTIVE'
  | 'REFRESH_TOKEN_INVALID';

export class AuthError extends Error {
  constructor(public readonly code: AuthErrorCode) {
    super(code);
    this.name = 'AuthError';
  }
}
