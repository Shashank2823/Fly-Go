import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { AppConfig } from '../../config/app-config';
import { type EmailTransport, type OutgoingEmail, PermanentEmailError } from './email-transport';

@Injectable()
export class SmtpEmailTransport implements EmailTransport, OnModuleDestroy {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: AppConfig) {
    this.from = config.get('MAIL_FROM');
    this.transporter = nodemailer.createTransport({
      host: config.get('SMTP_HOST'),
      port: config.get('SMTP_PORT'),
      secure: false,
      // Mailpit speaks plain SMTP locally; production providers use TLS.
      ignoreTLS: !config.isProduction,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  async send(email: OutgoingEmail): Promise<{ providerMessageId: string }> {
    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
        messageId: email.messageId,
      });
      return { providerMessageId: info.messageId };
    } catch (err) {
      const code = (err as { responseCode?: number }).responseCode;
      // 5xx SMTP replies (bad mailbox, policy rejection) won't succeed on retry.
      if (typeof code === 'number' && code >= 500)
        throw new PermanentEmailError(`SMTP ${code}: ${(err as Error).message}`);
      throw err;
    }
  }

  onModuleDestroy(): void {
    this.transporter.close();
  }
}
