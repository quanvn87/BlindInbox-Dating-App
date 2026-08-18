export interface OtpProvider {
  send(phoneE164: string, code: string): Promise<void>;
}

export const OTP_PROVIDER = 'OTP_PROVIDER';
