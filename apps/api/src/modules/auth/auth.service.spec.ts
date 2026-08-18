import { createHmac } from 'node:crypto';

import { AuthRepository } from './auth.repository';
import type { ConsumeOtpChallengeResult } from './auth.repository';
import { AuthService } from './auth.service';
import { DevelopmentOtpProvider } from './development-otp.provider';
import { OtpProvider } from './otp.provider';
import { TokenService } from './token.service';
import {
  AuthError,
  AuthUser,
  Clock,
  OtpChallenge,
  RefreshSession,
} from './auth.types';

const OTP_PEPPER = 'test-otp-pepper-at-least-32-characters';
const REFRESH_PEPPER = 'test-refresh-pepper-at-least-32-characters';
const JWT_SECRET = 'test-access-secret-at-least-32-characters';
const START = new Date('2026-08-18T03:00:00.000Z');

class MutableClock implements Clock {
  constructor(public current: Date) {}

  now(): Date {
    return new Date(this.current);
  }
}

class CapturingOtpProvider implements OtpProvider {
  readonly deliveries: Array<{ phoneE164: string; code: string }> = [];

  send(phoneE164: string, code: string): Promise<void> {
    this.deliveries.push({ phoneE164, code });
    return Promise.resolve();
  }
}

class FakeAuthRepository implements AuthRepository {
  readonly challenges = new Map<string, OtpChallenge>();
  readonly users = new Map<string, AuthUser>();
  readonly sessions = new Map<string, RefreshSession>();
  beforeConsumeOtpChallenge: (() => void) | null = null;

  createOtpChallenge(challenge: OtpChallenge): Promise<void> {
    this.challenges.set(challenge.id, { ...challenge });
    return Promise.resolve();
  }

  findOtpChallengeById(id: string): Promise<OtpChallenge | null> {
    const challenge = this.challenges.get(id);
    return Promise.resolve(challenge ? { ...challenge } : null);
  }

  incrementOtpAttempts(
    id: string,
    maximumAttempts: number,
  ): Promise<number | null> {
    const challenge = this.challenges.get(id);
    if (!challenge || challenge.attempts >= maximumAttempts) {
      return Promise.resolve(null);
    }
    challenge.attempts += 1;
    return Promise.resolve(challenge.attempts);
  }

  consumeOtpChallenge(
    id: string,
    consumedAt: Date,
    maximumAttempts: number,
  ): Promise<ConsumeOtpChallengeResult> {
    this.beforeConsumeOtpChallenge?.();
    const challenge = this.challenges.get(id);
    if (!challenge) {
      return Promise.resolve('NOT_FOUND');
    }
    if (challenge.consumedAt) {
      return Promise.resolve('ALREADY_CONSUMED');
    }
    if (challenge.expiresAt.getTime() <= consumedAt.getTime()) {
      return Promise.resolve('EXPIRED');
    }
    if (challenge.attempts >= maximumAttempts) {
      return Promise.resolve('ATTEMPTS_EXCEEDED');
    }
    challenge.consumedAt = consumedAt;
    return Promise.resolve('CONSUMED');
  }

  findOrCreateUserByPhone(phoneE164: string): Promise<AuthUser> {
    const existing = [...this.users.values()].find(
      (user) => user.phoneE164 === phoneE164,
    );
    if (existing) {
      return Promise.resolve({ ...existing });
    }
    const user: AuthUser = {
      id: `user-${this.users.size + 1}`,
      phoneE164,
      status: 'ACTIVE',
    };
    this.users.set(user.id, user);
    return Promise.resolve({ ...user });
  }

  findUserById(id: string): Promise<AuthUser | null> {
    const user = this.users.get(id);
    return Promise.resolve(user ? { ...user } : null);
  }

  createRefreshSession(session: RefreshSession): Promise<void> {
    this.sessions.set(session.id, { ...session });
    return Promise.resolve();
  }

  findRefreshSessionByDigest(
    tokenDigest: string,
  ): Promise<RefreshSession | null> {
    const session = [...this.sessions.values()].find(
      (candidate) => candidate.tokenDigest === tokenDigest,
    );
    return Promise.resolve(session ? { ...session } : null);
  }

  rotateRefreshSession(
    currentTokenDigest: string,
    replacement: RefreshSession,
    rotatedAt: Date,
  ): Promise<boolean> {
    const current = [...this.sessions.values()].find(
      (candidate) => candidate.tokenDigest === currentTokenDigest,
    );
    if (
      !current ||
      current.revokedAt ||
      current.expiresAt.getTime() <= rotatedAt.getTime()
    ) {
      return Promise.resolve(false);
    }
    current.revokedAt = rotatedAt;
    this.sessions.set(replacement.id, { ...replacement });
    return Promise.resolve(true);
  }

  revokeRefreshSessionByDigest(
    tokenDigest: string,
    revokedAt: Date,
  ): Promise<void> {
    const session = [...this.sessions.values()].find(
      (candidate) => candidate.tokenDigest === tokenDigest,
    );
    if (session && !session.revokedAt) {
      session.revokedAt = revokedAt;
    }
    return Promise.resolve();
  }
}

function digestOtp(challengeId: string, code: string): string {
  return createHmac('sha256', OTP_PEPPER)
    .update(`${challengeId}:${code}`)
    .digest('hex');
}

function digestRefresh(token: string): string {
  return createHmac('sha256', REFRESH_PEPPER).update(token).digest('hex');
}

function decodeJwtPart<T>(token: string, index: number): T {
  return JSON.parse(
    Buffer.from(token.split('.')[index], 'base64url').toString(),
  ) as T;
}

function createHarness() {
  const repository = new FakeAuthRepository();
  const provider = new CapturingOtpProvider();
  const clock = new MutableClock(START);
  const ids = ['challenge-1', 'session-1', 'session-2', 'session-3'];
  const refreshBytes = [
    Buffer.alloc(32, 1),
    Buffer.alloc(32, 2),
    Buffer.alloc(32, 3),
  ];
  const tokenService = new TokenService(
    repository,
    JWT_SECRET,
    REFRESH_PEPPER,
    clock,
    () => refreshBytes.shift()!,
    () => ids.shift()!,
  );
  const service = new AuthService(
    repository,
    provider,
    tokenService,
    OTP_PEPPER,
    clock,
    () => 42,
    () => ids.shift()!,
  );

  return { clock, provider, repository, service };
}

async function requestAndVerify(
  harness: ReturnType<typeof createHarness>,
  deviceName = 'Pixel 9',
) {
  const requested = await harness.service.requestOtp('+84901234567');
  const code = harness.provider.deliveries.at(-1)!.code;
  const tokens = await harness.service.verifyOtp(
    requested.challengeId,
    code,
    deviceName,
  );
  return { requested, tokens };
}

describe('AuthService OTP domain', () => {
  it('preserves a canonical Vietnamese E.164 phone and stores only its OTP HMAC digest', async () => {
    const harness = createHarness();

    const result = await harness.service.requestOtp('+84901234567');

    expect(result).toEqual({
      challengeId: 'challenge-1',
      expiresAt: new Date('2026-08-18T03:05:00.000Z'),
    });
    expect(harness.provider.deliveries).toEqual([
      { phoneE164: '+84901234567', code: '000042' },
    ]);
    expect(harness.repository.challenges.get('challenge-1')).toMatchObject({
      phoneE164: '+84901234567',
      codeDigest: digestOtp('challenge-1', '000042'),
      attempts: 0,
      consumedAt: null,
    });
    expect(
      JSON.stringify(harness.repository.challenges.get('challenge-1')),
    ).not.toContain('000042');
  });

  it('allows at most five wrong attempts', async () => {
    const harness = createHarness();
    const { challengeId } = await harness.service.requestOtp('+84901234567');

    for (let attempt = 1; attempt < 5; attempt += 1) {
      await expect(
        harness.service.verifyOtp(challengeId, '999999', 'Pixel 9'),
      ).rejects.toMatchObject<AuthError>({ code: 'OTP_INVALID' });
    }
    await expect(
      harness.service.verifyOtp(challengeId, '999999', 'Pixel 9'),
    ).rejects.toMatchObject<AuthError>({ code: 'OTP_ATTEMPTS_EXCEEDED' });
    await expect(
      harness.service.verifyOtp(challengeId, '000042', 'Pixel 9'),
    ).rejects.toMatchObject<AuthError>({ code: 'OTP_ATTEMPTS_EXCEEDED' });
    expect(harness.repository.challenges.get(challengeId)?.attempts).toBe(5);
  });

  it('rejects an OTP at its five-minute expiry boundary', async () => {
    const harness = createHarness();
    const { challengeId } = await harness.service.requestOtp('+84901234567');
    harness.clock.current = new Date('2026-08-18T03:05:00.000Z');

    await expect(
      harness.service.verifyOtp(challengeId, '000042', 'Pixel 9'),
    ).rejects.toMatchObject<AuthError>({ code: 'OTP_EXPIRED' });
  });

  it('rejects replay of a consumed challenge', async () => {
    const harness = createHarness();
    const { challengeId } = await harness.service.requestOtp('+84901234567');
    await harness.service.verifyOtp(challengeId, '000042', 'Pixel 9');

    await expect(
      harness.service.verifyOtp(challengeId, '000042', 'Pixel 9'),
    ).rejects.toMatchObject<AuthError>({ code: 'OTP_CONSUMED' });
  });

  it('does not consume a correct OTP that expires after the initial read', async () => {
    const harness = createHarness();
    const { challengeId } = await harness.service.requestOtp('+84901234567');
    harness.repository.beforeConsumeOtpChallenge = () => {
      harness.repository.challenges.get(challengeId)!.expiresAt = START;
    };

    await expect(
      harness.service.verifyOtp(challengeId, '000042', 'Pixel 9'),
    ).rejects.toMatchObject<AuthError>({ code: 'OTP_EXPIRED' });
    expect(harness.repository.sessions.size).toBe(0);
  });

  it('does not consume a correct OTP after a concurrent fifth failure', async () => {
    const harness = createHarness();
    const { challengeId } = await harness.service.requestOtp('+84901234567');
    harness.repository.challenges.get(challengeId)!.attempts = 4;
    harness.repository.beforeConsumeOtpChallenge = () => {
      harness.repository.challenges.get(challengeId)!.attempts = 5;
    };

    await expect(
      harness.service.verifyOtp(challengeId, '000042', 'Pixel 9'),
    ).rejects.toMatchObject<AuthError>({ code: 'OTP_ATTEMPTS_EXCEEDED' });
    expect(harness.repository.sessions.size).toBe(0);
  });
});

describe('AuthService token domain', () => {
  it('issues a 15-minute access JWT with only the required domain claims', async () => {
    const harness = createHarness();
    const { tokens } = await requestAndVerify(harness);
    const header = decodeJwtPart<{ alg: string; typ: string }>(
      tokens.accessToken,
      0,
    );
    const payload = decodeJwtPart<{
      sub: string;
      sessionId: string;
      status: string;
      iat: number;
      exp: number;
    }>(tokens.accessToken, 1);

    expect(header).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(payload).toEqual({
      sub: 'user-1',
      sessionId: 'session-1',
      status: 'ACTIVE',
      iat: 1787022000,
      exp: 1787022900,
    });
    expect(tokens.accessExpiresAt).toBe('2026-08-18T03:15:00.000Z');
  });

  it('stores only a digest for a 32-byte refresh token with a 30-day lifetime', async () => {
    const harness = createHarness();
    const { tokens } = await requestAndVerify(harness, 'Pixel 9');
    const session = harness.repository.sessions.get('session-1');

    expect(Buffer.from(tokens.refreshToken, 'base64url')).toHaveLength(32);
    expect(tokens.refreshExpiresAt).toBe('2026-09-17T03:00:00.000Z');
    expect(session).toMatchObject({
      id: 'session-1',
      userId: 'user-1',
      tokenDigest: digestRefresh(tokens.refreshToken),
      deviceName: 'Pixel 9',
      expiresAt: new Date('2026-09-17T03:00:00.000Z'),
      revokedAt: null,
    });
    expect(JSON.stringify(session)).not.toContain(tokens.refreshToken);
  });

  it('atomically rotates a refresh token and rejects the old token', async () => {
    const harness = createHarness();
    const { tokens: original } = await requestAndVerify(harness);

    const rotated = await harness.service.refresh(original.refreshToken);

    expect(rotated.refreshToken).not.toBe(original.refreshToken);
    expect(harness.repository.sessions.get('session-1')?.revokedAt).toEqual(
      START,
    );
    expect(harness.repository.sessions.get('session-2')).toMatchObject({
      userId: 'user-1',
      deviceName: 'Pixel 9',
      tokenDigest: digestRefresh(rotated.refreshToken),
      revokedAt: null,
    });
    await expect(
      harness.service.refresh(original.refreshToken),
    ).rejects.toMatchObject<AuthError>({ code: 'REFRESH_TOKEN_INVALID' });
  });

  it('revokes refresh tokens by device session on logout', async () => {
    const harness = createHarness();
    const { tokens } = await requestAndVerify(harness);

    await harness.service.logout(tokens.refreshToken);

    expect(harness.repository.sessions.get('session-1')?.revokedAt).toEqual(
      START,
    );
    await expect(
      harness.service.refresh(tokens.refreshToken),
    ).rejects.toMatchObject<AuthError>({ code: 'REFRESH_TOKEN_INVALID' });
  });
});

describe('DevelopmentOtpProvider', () => {
  it.each(['development', 'test'] as const)(
    'logs the code with a masked phone in %s',
    async (environment) => {
      const messages: string[] = [];
      const provider = new DevelopmentOtpProvider(environment, {
        log: (message) => messages.push(message),
      });

      await provider.send('+84901234567', '123456');

      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain('123456');
      expect(messages[0]).toContain('+84******567');
      expect(messages[0]).not.toContain('+84901234567');
    },
  );

  it('does not expose an OTP in production', async () => {
    const messages: string[] = [];
    const provider = new DevelopmentOtpProvider('production', {
      log: (message) => messages.push(message),
    });

    await provider.send('+84901234567', '123456');

    expect(messages).toEqual([]);
  });
});
