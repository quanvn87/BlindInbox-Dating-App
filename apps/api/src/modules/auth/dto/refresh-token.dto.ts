import { BadRequestException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

const refreshTokenSchema = z
  .object({
    refreshToken: z.string().min(1).max(2048),
  })
  .strict();

export class RefreshTokenDto {
  @ApiProperty({
    minLength: 1,
    maxLength: 2048,
    description:
      'Must be a non-empty opaque token. It is used exactly as supplied and is neither trimmed nor normalized.',
  })
  refreshToken!: string;

  static parse(input: unknown): RefreshTokenDto {
    const result = refreshTokenSchema.safeParse(input);
    if (!result.success) {
      throw new BadRequestException('Invalid refresh request');
    }
    return Object.assign(new RefreshTokenDto(), result.data);
  }
}
