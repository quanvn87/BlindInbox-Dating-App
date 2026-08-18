import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { AccessTokenClaims, TokenService } from './token.service';

export interface AccessTokenRequest {
  headers: { authorization?: string | string[] };
  accessToken: AccessTokenClaims;
}

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly tokenService: TokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AccessTokenRequest>();
    const authorization = request.headers.authorization;
    if (typeof authorization !== 'string') {
      throw new UnauthorizedException('Bearer access token required');
    }

    const match = /^Bearer (\S+)$/i.exec(authorization);
    if (!match) {
      throw new UnauthorizedException('Bearer access token required');
    }

    try {
      request.accessToken = this.tokenService.verifyAccessToken(match[1]);
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
