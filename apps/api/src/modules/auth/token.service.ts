import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';

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

export interface AccessTokenClaims {
  sub: string;
  sessionId: string;
  status: AuthUser['status'];
  iat: number;
  exp: number;
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

  verifyAccessToken(token: string): AccessTokenClaims {
    try {
      const parts = token.split('.');
      if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
        throw new Error('Malformed access token');
      }

      const [encodedHeader, encodedPayload, encodedSignature] = parts;
      const header = this.decodeJwtPart<unknown>(encodedHeader);
      if (
        !this.isRecord(header) ||
        header.alg !== 'HS256' ||
        header.typ !== 'JWT'
      ) {
        throw new Error('Unsupported access token');
      }

      const unsignedToken = `${encodedHeader}.${encodedPayload}`;
      const expectedSignature = createHmac('sha256', this.jwtAccessSecret)
        .update(unsignedToken)
        .digest();
      const suppliedSignature = Buffer.from(encodedSignature, 'base64url');
      if (
        suppliedSignature.length !== expectedSignature.length ||
        !timingSafeEqual(suppliedSignature, expectedSignature)
      ) {
        throw new Error('Invalid access token signature');
      }

      const payload = this.decodeJwtPart<unknown>(encodedPayload);
      if (!this.isAccessTokenClaims(payload)) {
        throw new Error('Invalid access token claims');
      }
      const nowSeconds = Math.floor(this.clock.now().getTime() / 1000);
      if (payload.exp <= nowSeconds || payload.exp <= payload.iat) {
        throw new Error('Expired access token');
      }

      return payload;
    } catch {
      throw new Error('Invalid access token');
    }
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

  private decodeJwtPart<T>(part: string): T {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as T;
  }

  private isAccessTokenClaims(value: unknown): value is AccessTokenClaims {
    return (
      this.isRecord(value) &&
      typeof value.sub === 'string' &&
      value.sub.length > 0 &&
      typeof value.sessionId === 'string' &&
      value.sessionId.length > 0 &&
      ['ACTIVE', 'SUSPENDED', 'DELETED'].includes(String(value.status)) &&
      Number.isInteger(value.iat) &&
      Number.isInteger(value.exp)
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
