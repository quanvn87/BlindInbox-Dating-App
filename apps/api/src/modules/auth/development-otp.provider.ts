import { Logger } from '@nestjs/common';

import type { OtpProvider } from './otp.provider';

export type RuntimeEnvironment = 'development' | 'test' | 'production';

interface OtpLogger {
  log(message: string): void;
}

function maskPhone(phoneE164: string): string {
  if (phoneE164.length <= 6) {
    return '*'.repeat(phoneE164.length);
  }
  return `${phoneE164.slice(0, 3)}${'*'.repeat(phoneE164.length - 6)}${phoneE164.slice(-3)}`;
}

export class DevelopmentOtpProvider implements OtpProvider {
  constructor(
    private readonly environment: RuntimeEnvironment,
    private readonly logger: OtpLogger = new Logger(
      DevelopmentOtpProvider.name,
    ),
  ) {}

  send(phoneE164: string, code: string): Promise<void> {
    if (this.environment === 'development' || this.environment === 'test') {
      this.logger.log(`Development OTP ${code} for ${maskPhone(phoneE164)}`);
    }
    return Promise.resolve();
  }
}
