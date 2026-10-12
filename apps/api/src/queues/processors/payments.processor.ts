import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';
import { PaymentEventsService } from '../../modules/payments/payment-events.service';
import { PaymentProcessingService } from '../../modules/payments/payment-processing.service';
import { MockPaymentProvider } from '../../modules/payments/providers/mock-payment.provider';
import type { ProviderEvent } from '../../modules/payments/providers/payment-provider';
import { PaymentsJob, QueueName } from '../queue-names';

interface PaymentJobData {
  paymentId?: string;
  paymentEventId?: string;
  correlationId?: string | null;
}

/**
 * Payments queue (docs §11.2). Thin: each job delegates to an idempotent service method, so
 * BullMQ retries (8 attempts, exponential back-off) are always safe.
 */
@Processor(QueueName.Payments, { concurrency: 5 })
export class PaymentsProcessor extends WorkerHost {
  private readonly logger = new Logger(PaymentsProcessor.name);

  constructor(
    private readonly processing: PaymentProcessingService,
    private readonly events: PaymentEventsService,
    private readonly mockProvider: MockPaymentProvider,
  ) {
    super();
  }

  async process(
    job: Job<PaymentJobData & Partial<ProviderEvent> & { providerCreatedAt?: string }>,
  ): Promise<void> {
    const ctx = {
      jobId: job.id,
      job: job.name,
      attempt: job.attemptsMade + 1,
      correlationId: job.data.correlationId,
    };
    switch (job.name) {
      case PaymentsJob.SubmitPayment:
        if (!job.data.paymentId) throw new UnrecoverableError('paymentId missing');
        this.logger.log(
          { ...ctx, paymentId: job.data.paymentId },
          'Submitting payment to provider',
        );
        return this.processing.submit(job.data.paymentId);

      case PaymentsJob.ApplyPaymentEvent:
        if (!job.data.paymentEventId) throw new UnrecoverableError('paymentEventId missing');
        return this.processing.applyEvent(job.data.paymentEventId);

      case PaymentsJob.RefundPayment:
        if (!job.data.paymentId) throw new UnrecoverableError('paymentId missing');
        this.logger.warn({ ...ctx, paymentId: job.data.paymentId }, 'Refunding payment');
        return this.processing.refund(job.data.paymentId);

      case PaymentsJob.MockProviderEvent: {
        // The mock gateway "calling our webhook": settle its ledger, then ingest like a real webhook.
        const e = job.data as ProviderEvent & { providerCreatedAt?: string };
        await this.mockProvider.settle(
          e.providerPaymentId,
          e.type === 'payment.succeeded' ? 'SUCCEEDED' : 'FAILED',
        );
        await this.events.ingest({
          ...e,
          providerCreatedAt: e.providerCreatedAt ? new Date(e.providerCreatedAt) : undefined,
        });
        return;
      }

      default:
        throw new UnrecoverableError(`Unknown payments job: ${job.name}`);
    }
  }
}
