import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

const refreshTokenSchema = z
  .object({
    refreshToken: z.string().min(1).max(2048),
  })
  .strict();

export class RefreshTokenDto {
  refreshToken!: string;

  static parse(input: unknown): RefreshTokenDto {
    const result = refreshTokenSchema.safeParse(input);
    if (!result.success) {
      throw new BadRequestException('Invalid refresh request');
    }
    return Object.assign(new RefreshTokenDto(), result.data);
  }
}
