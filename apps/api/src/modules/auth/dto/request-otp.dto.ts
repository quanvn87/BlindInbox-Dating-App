import { BadRequestException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

const requestOtpSchema = z
  .object({
    phone: z.string().trim().min(1).max(50),
  })
  .strict();

export class RequestOtpDto {
  @ApiProperty({ example: '+84901234567', maxLength: 50 })
  phone!: string;

  static parse(input: unknown): RequestOtpDto {
    const result = requestOtpSchema.safeParse(input);
    if (!result.success) {
      throw new BadRequestException('Invalid OTP request');
    }
    return Object.assign(new RequestOtpDto(), result.data);
  }
}
