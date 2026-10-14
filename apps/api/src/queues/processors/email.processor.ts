import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';
import { PermanentEmailError } from '../../modules/email/email-transport';
import { EmailService } from '../../modules/email/email.service';
import { EmailJob, QueueName } from '../queue-names';

/**
 * Email delivery (docs §9). A failed email never affects the booking — it is retried with
 * exponential back-off (8 attempts), and the reconciliation job picks it up again later.
 */
@Processor(QueueName.Email, { concurrency: 5 })
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly email: EmailService) {
    super();
  }

  async process(job: Job<{ bookingId?: string; correlationId?: string | null }>): Promise<string> {
    if (job.name !== EmailJob.SendBookingConfirmation)
      throw new UnrecoverableError(`Unknown email job: ${job.name}`);
    if (!job.data.bookingId) throw new UnrecoverableError('bookingId missing');
    const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    try {
      const outcome = await this.email.sendBookingConfirmation(job.data.bookingId, finalAttempt);
      if (outcome === 'IN_PROGRESS') throw new Error('Email is being sent by another worker');
      return outcome;
    } catch (err) {
      this.logger.warn(
        {
          jobId: job.id,
          attempt: job.attemptsMade + 1,
          bookingId: job.data.bookingId,
          err: (err as Error).message,
        },
        'Confirmation email attempt failed',
      );
      if (err instanceof PermanentEmailError) throw new UnrecoverableError(err.message);
      throw err;
    }
  }
}
