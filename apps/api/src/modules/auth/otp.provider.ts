export interface OtpProvider {
  send(phoneE164: string, code: string): Promise<void>;
}
