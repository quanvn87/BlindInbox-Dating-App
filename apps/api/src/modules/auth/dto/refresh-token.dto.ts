import { BadRequestException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

const refreshTokenSchema = z
  .object({
    refreshToken: z.string().min(1).max(2048),
  })
  .strict();

export class RefreshTokenDto {
  @ApiProperty({ maxLength: 2048 })
  refreshToken!: string;

  static parse(input: unknown): RefreshTokenDto {
    const result = refreshTokenSchema.safeParse(input);
    if (!result.success) {
      throw new BadRequestException('Invalid refresh request');
    }
    return Object.assign(new RefreshTokenDto(), result.data);
  }
}
