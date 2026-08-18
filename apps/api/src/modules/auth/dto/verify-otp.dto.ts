import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

const verifyOtpSchema = z
  .object({
    challengeId: z.uuid(),
    code: z.string().regex(/^\d{6}$/),
    deviceName: z.string().trim().min(1).max(120),
  })
  .strict();

export class VerifyOtpDto {
  challengeId!: string;
  code!: string;
  deviceName!: string;

  static parse(input: unknown): VerifyOtpDto {
    const result = verifyOtpSchema.safeParse(input);
    if (!result.success) {
      throw new BadRequestException('Invalid OTP verification request');
    }
    return Object.assign(new VerifyOtpDto(), result.data);
  }
}
