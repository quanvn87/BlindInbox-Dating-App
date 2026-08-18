import { createHmac, randomBytes, randomUUID } from 'node:crypto';

import type { AuthRepository } from './auth.repository';
import {
  ACCESS_TOKEN_LIFETIME_SECONDS,
  AuthError,
  REFRESH_TOKEN_LIFETIME_MS,
  systemClock,
} from './auth.types';
import type { AuthTokens, AuthUser, Clock, RefreshSession } from './auth.types';

type RandomBytesGenerator = (size: number) => Buffer;
type IdGenerator = () => string;

interface TokenMaterial {
  refreshToken: string;
  session: RefreshSession;
}

export class TokenService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly jwtAccessSecret: string,
    private readonly refreshTokenPepper: string,
    private readonly clock: Clock = systemClock,
    private readonly randomBytesGenerator: RandomBytesGenerator = randomBytes,
    private readonly idGenerator: IdGenerator = randomUUID,
  ) {}

  async issue(user: AuthUser, deviceName: string): Promise<AuthTokens> {
    const now = this.clock.now();
    const material = this.createRefreshTokenMaterial(user.id, deviceName, now);
    await this.repository.createRefreshSession(material.session);
    return this.createAuthTokens(user, material, now);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const now = this.clock.now();
    const currentDigest = this.digestRefreshToken(refreshToken);
    const current =
      await this.repository.findRefreshSessionByDigest(currentDigest);
    if (
      !current ||
      current.revokedAt ||
      current.expiresAt.getTime() <= now.getTime()
    ) {
      throw new AuthError('REFRESH_TOKEN_INVALID');
    }

    const user = await this.repository.findUserById(current.userId);
    if (!user) {
      throw new AuthError('REFRESH_TOKEN_INVALID');
    }

    const replacement = this.createRefreshTokenMaterial(
      current.userId,
      current.deviceName,
      now,
    );
    const rotated = await this.repository.rotateRefreshSession(
      currentDigest,
      replacement.session,
      now,
    );
    if (!rotated) {
      throw new AuthError('REFRESH_TOKEN_INVALID');
    }
    return this.createAuthTokens(user, replacement, now);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.repository.revokeRefreshSessionByDigest(
      this.digestRefreshToken(refreshToken),
      this.clock.now(),
    );
  }

  private createRefreshTokenMaterial(
    userId: string,
    deviceName: string,
    now: Date,
  ): TokenMaterial {
    const refreshToken = this.randomBytesGenerator(32).toString('base64url');
    return {
      refreshToken,
      session: {
        id: this.idGenerator(),
        userId,
        tokenDigest: this.digestRefreshToken(refreshToken),
        deviceName,
        expiresAt: new Date(now.getTime() + REFRESH_TOKEN_LIFETIME_MS),
        revokedAt: null,
        createdAt: new Date(now),
      },
    };
  }

  private createAuthTokens(
    user: AuthUser,
    material: TokenMaterial,
    now: Date,
  ): AuthTokens {
    const issuedAt = Math.floor(now.getTime() / 1000);
    const expiresAt = issuedAt + ACCESS_TOKEN_LIFETIME_SECONDS;
    return {
      accessToken: this.signAccessToken({
        sub: user.id,
        sessionId: material.session.id,
        status: user.status,
        iat: issuedAt,
        exp: expiresAt,
      }),
      accessExpiresAt: new Date(expiresAt * 1000).toISOString(),
      refreshToken: material.refreshToken,
      refreshExpiresAt: material.session.expiresAt.toISOString(),
    };
  }

  private signAccessToken(payload: Record<string, string | number>): string {
    const header = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    ).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const unsignedToken = `${header}.${body}`;
    const signature = createHmac('sha256', this.jwtAccessSecret)
      .update(unsignedToken)
      .digest('base64url');
    return `${unsignedToken}.${signature}`;
  }

  private digestRefreshToken(token: string): string {
    return createHmac('sha256', this.refreshTokenPepper)
      .update(token)
      .digest('hex');
  }
}
