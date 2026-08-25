import { BadRequestException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

const requestOtpSchema = z
  .object({
    phone: z.string().trim().min(1).max(50),
  })
  .strict();

export class RequestOtpDto {
  @ApiProperty({
    example: '+84901234567',
    minLength: 1,
    maxLength: 50,
    description:
      'Must be nonblank after trimming and parse as a valid Vietnamese phone number without an extension. National or E.164 input is accepted and normalized to Vietnamese E.164 before use.',
  })
  phone!: string;

  static parse(input: unknown): RequestOtpDto {
    const result = requestOtpSchema.safeParse(input);
    if (!result.success) {
      throw new BadRequestException('Invalid OTP request');
    }
    return Object.assign(new RequestOtpDto(), result.data);
  }
}
