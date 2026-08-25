import { BadRequestException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

const verifyOtpSchema = z
  .object({
    challengeId: z.uuid(),
    code: z.string().regex(/^\d{6}$/),
    deviceName: z.string().trim().min(1).max(120),
  })
  .strict();

export class VerifyOtpDto {
  @ApiProperty({
    format: 'uuid',
    description: 'OTP challenge identifier returned by the request endpoint.',
  })
  challengeId!: string;

  @ApiProperty({
    pattern: '^\\d{6}$',
    description: 'Exactly six ASCII digits; whitespace is not trimmed.',
  })
  code!: string;

  @ApiProperty({
    minLength: 1,
    maxLength: 120,
    description: 'Must be nonblank after trimming.',
  })
  deviceName!: string;

  static parse(input: unknown): VerifyOtpDto {
    const result = verifyOtpSchema.safeParse(input);
    if (!result.success) {
      throw new BadRequestException('Invalid OTP verification request');
    }
    return Object.assign(new VerifyOtpDto(), result.data);
  }
}
