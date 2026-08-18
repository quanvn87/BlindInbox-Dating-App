import { ApiProperty } from '@nestjs/swagger';

export class AuthTokens {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ format: 'date-time' })
  accessExpiresAt!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty({ format: 'date-time' })
  refreshExpiresAt!: string;
}

export class OtpRequestResult {
  @ApiProperty({ format: 'uuid' })
  challengeId!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;
}
