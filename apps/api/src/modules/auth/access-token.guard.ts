import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { AccessTokenClaims, TokenService } from './token.service';
import { AUTH_REPOSITORY, type AuthRepository } from './auth.repository';

export interface AccessTokenRequest {
  headers: { authorization?: string | string[] };
  accessToken: AccessTokenClaims;
}

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    @Inject(AUTH_REPOSITORY) private readonly repository: AuthRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AccessTokenRequest>();
    const authorization = request.headers.authorization;
    if (typeof authorization !== 'string') {
      throw new UnauthorizedException('Bearer access token required');
    }

    const match = /^Bearer (\S+)$/i.exec(authorization);
    if (!match) {
      throw new UnauthorizedException('Bearer access token required');
    }

    let claims: AccessTokenClaims;
    try {
      claims = this.tokenService.verifyAccessToken(match[1]);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
    if (claims.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    const user = await this.repository.findUserById(claims.sub);
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid or expired access token');
    }
    request.accessToken = claims;
    return true;
  }
}
