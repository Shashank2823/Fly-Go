/**
 * Port for sending email (docs §9). SMTP to Mailpit in development; a provider such as SES or
 * SendGrid implements the same interface in production.
 */
export const EMAIL_TRANSPORT = Symbol('EMAIL_TRANSPORT');

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Stable id so a provider (or Mailpit) can recognise retries of the same logical message. */
  messageId: string;
}

export interface EmailTransport {
  send(email: OutgoingEmail): Promise<{ providerMessageId: string }>;
}

/** Thrown for failures that will not succeed on retry (e.g. recipient rejected). */
export class PermanentEmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentEmailError';
  }
}
