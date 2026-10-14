import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';
import { TicketsService } from '../../modules/tickets/tickets.service';
import { QueueName, TicketsJob } from '../queue-names';

/** Ticket PDFs (docs §13). CPU-light but I/O-bound; 4 in parallel per worker. */
@Processor(QueueName.Tickets, { concurrency: 4 })
export class TicketsProcessor extends WorkerHost {
  private readonly logger = new Logger(TicketsProcessor.name);

  constructor(private readonly tickets: TicketsService) {
    super();
  }

  async process(job: Job<{ bookingId?: string; correlationId?: string | null }>): Promise<string> {
    if (job.name !== TicketsJob.GenerateTicket)
      throw new UnrecoverableError(`Unknown tickets job: ${job.name}`);
    if (!job.data.bookingId) throw new UnrecoverableError('bookingId missing');
    const outcome = await this.tickets.generate(job.data.bookingId);
    this.logger.log(
      { jobId: job.id, attempt: job.attemptsMade + 1, bookingId: job.data.bookingId, outcome },
      'Ticket job done',
    );
    // Another worker holds a fresh claim: retry later rather than report success.
    if (outcome === 'IN_PROGRESS') throw new Error('Ticket generation already in progress');
    return outcome;
  }
}
