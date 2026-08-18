import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

const requestOtpSchema = z
  .object({
    phone: z.string().trim().min(1).max(50),
  })
  .strict();

export class RequestOtpDto {
  phone!: string;

  static parse(input: unknown): RequestOtpDto {
    const result = requestOtpSchema.safeParse(input);
    if (!result.success) {
      throw new BadRequestException('Invalid OTP request');
    }
    return Object.assign(new RequestOtpDto(), result.data);
  }
}
