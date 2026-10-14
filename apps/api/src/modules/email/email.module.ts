import { Module } from '@nestjs/common';
import { EMAIL_TRANSPORT } from './email-transport';
import { EmailMessagesRepository } from './email-messages.repository';
import { EmailService } from './email.service';
import { SmtpEmailTransport } from './smtp-email.transport';

@Module({
  providers: [
    EmailService,
    EmailMessagesRepository,
    SmtpEmailTransport,
    { provide: EMAIL_TRANSPORT, useExisting: SmtpEmailTransport },
  ],
  exports: [EmailService, EmailMessagesRepository],
})
export class EmailModule {}
