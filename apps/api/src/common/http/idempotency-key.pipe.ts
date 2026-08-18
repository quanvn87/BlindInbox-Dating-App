import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { z } from 'zod';

@Injectable()
export class IdempotencyKeyPipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    const result = z.uuid().safeParse(value);
    if (!result.success) {
      throw new BadRequestException('Idempotency-Key must be a valid UUID');
    }
    return result.data;
  }
}
