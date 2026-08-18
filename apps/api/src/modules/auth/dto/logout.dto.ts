import { BadRequestException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

const logoutSchema = z
  .object({
    refreshToken: z.string().min(1).max(2048),
  })
  .strict();

export class LogoutDto {
  @ApiProperty({ maxLength: 2048 })
  refreshToken!: string;

  static parse(input: unknown): LogoutDto {
    const result = logoutSchema.safeParse(input);
    if (!result.success) {
      throw new BadRequestException('Invalid logout request');
    }
    return Object.assign(new LogoutDto(), result.data);
  }
}
