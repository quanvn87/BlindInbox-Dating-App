import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';

import type { AuthRepository } from './auth.repository';
import {
  AccessTokenGuard,
  type AccessTokenRequest,
} from './access-token.guard';
import type { AccessTokenClaims, TokenService } from './token.service';

function claims(status: AccessTokenClaims['status']): AccessTokenClaims {
  return {
    sub: 'user-1',
    sessionId: 'session-1',
    status,
    iat: 1,
    exp: 2,
  };
}

function context(request: Partial<AccessTokenRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

describe('AccessTokenGuard', () => {
  it.each(['SUSPENDED', 'DELETED'] as const)(
    'rejects a token carrying %s status',
    async (status) => {
      const findUserById = jest.fn();
      const tokenService = {
        verifyAccessToken: jest.fn().mockReturnValue(claims(status)),
      } as unknown as TokenService;
      const repository = {
        findUserById,
      } as unknown as AuthRepository;
      const guard = new AccessTokenGuard(tokenService, repository);

      await expect(
        guard.canActivate(
          context({ headers: { authorization: 'Bearer access-token' } }),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(findUserById).not.toHaveBeenCalled();
    },
  );

  it('rejects a formerly ACTIVE token after the current user is suspended', async () => {
    const tokenService = {
      verifyAccessToken: jest.fn().mockReturnValue(claims('ACTIVE')),
    } as unknown as TokenService;
    const repository = {
      findUserById: jest.fn().mockResolvedValue({
        id: 'user-1',
        phoneE164: 'redacted',
        status: 'SUSPENDED',
      }),
    } as unknown as AuthRepository;
    const guard = new AccessTokenGuard(tokenService, repository);

    await expect(
      guard.canActivate(
        context({ headers: { authorization: 'Bearer access-token' } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('does not disguise repository failures as invalid credentials', async () => {
    const repositoryFailure = new Error('Oracle unavailable');
    const tokenService = {
      verifyAccessToken: jest.fn().mockReturnValue(claims('ACTIVE')),
    } as unknown as TokenService;
    const repository = {
      findUserById: jest.fn().mockRejectedValue(repositoryFailure),
    } as unknown as AuthRepository;
    const guard = new AccessTokenGuard(tokenService, repository);

    await expect(
      guard.canActivate(
        context({ headers: { authorization: 'Bearer access-token' } }),
      ),
    ).rejects.toBe(repositoryFailure);
  });
});
