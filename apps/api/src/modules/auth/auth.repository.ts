import type { AuthUser, OtpChallenge, RefreshSession } from './auth.types';

export const AUTH_REPOSITORY = 'AUTH_REPOSITORY';

export type ConsumeOtpChallengeResult =
  | 'CONSUMED'
  | 'NOT_FOUND'
  | 'ALREADY_CONSUMED'
  | 'EXPIRED'
  | 'ATTEMPTS_EXCEEDED';

export interface AuthRepository {
  createOtpChallenge(challenge: OtpChallenge): Promise<void>;
  findOtpChallengeById(id: string): Promise<OtpChallenge | null>;
  incrementOtpAttempts(
    id: string,
    maximumAttempts: number,
  ): Promise<number | null>;
  /**
   * Atomically consumes only an unconsumed, unexpired challenge below the
   * attempt limit, then reports why a conditional consume did not occur.
   */
  consumeOtpChallenge(
    id: string,
    consumedAt: Date,
    maximumAttempts: number,
  ): Promise<ConsumeOtpChallengeResult>;
  /** Atomically returns an existing phone user or creates it once. */
  findOrCreateUserByPhone(phoneE164: string): Promise<AuthUser>;
  findUserById(id: string): Promise<AuthUser | null>;
  createRefreshSession(session: RefreshSession): Promise<void>;
  findRefreshSessionByDigest(
    tokenDigest: string,
  ): Promise<RefreshSession | null>;
  /**
   * In one transaction, conditionally revokes the active, unexpired current
   * digest and inserts its replacement. Any failure must roll back both.
   */
  rotateRefreshSession(
    currentTokenDigest: string,
    replacement: RefreshSession,
    rotatedAt: Date,
  ): Promise<boolean>;
  revokeRefreshSessionByDigest(
    tokenDigest: string,
    revokedAt: Date,
  ): Promise<void>;
}
