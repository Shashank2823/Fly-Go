import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { PrismaService } from '../../database/prisma.service';
import { PaymentsJob, QueueName } from '../../queues/queue-names';
import { PaymentEventsService } from './payment-events.service';
import { PAYMENT_PROVIDER, type PaymentProvider } from './providers/payment-provider';

const NOT_SUBMITTED_AFTER_MS = 60_000;
const PROCESSING_TOO_LONG_MS = 3 * 60_000;

/**
 * Safety net for lost work (docs §11.4): payments never sent to the provider are re-queued,
 * and payments stuck in PROCESSING are resolved by asking the provider directly. Findings go
 * through the normal event inbox, so the apply step stays the single place that changes state.
 */
@Injectable()
export class PaymentReconciliationService {
  private readonly logger = new Logger(PaymentReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: PaymentEventsService,
    @InjectQueue(QueueName.Payments) private readonly payments: Queue,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  async reconcile(): Promise<{ resubmitted: number; resolved: number }> {
    const now = Date.now();
    let resubmitted = 0;
    let resolved = 0;

    const unsent = await this.prisma.payment.findMany({
      where: {
        status: 'INITIATED',
        providerPaymentId: null,
        createdAt: { lt: new Date(now - NOT_SUBMITTED_AFTER_MS) },
      },
      take: 100,
    });
    for (const p of unsent) {
      await this.payments.add(
        PaymentsJob.SubmitPayment,
        { paymentId: p.id },
        { jobId: `reconcile-${p.id}-${Math.floor(now / 60_000)}` },
      );
      resubmitted++;
    }

    const stuck = await this.prisma.payment.findMany({
      where: {
        status: 'PROCESSING',
        provider: this.provider.name,
        providerPaymentId: { not: null },
        updatedAt: { lt: new Date(now - PROCESSING_TOO_LONG_MS) },
      },
      take: 100,
    });
    for (const p of stuck) {
      const state = await this.provider.getPayment(p.providerPaymentId!);
      if (state?.status !== 'SUCCEEDED' && state?.status !== 'FAILED') continue;
      const { recorded } = await this.events.ingest({
        provider: this.provider.name,
        providerEventId: `reconcile_${p.providerPaymentId}_${state.status.toLowerCase()}`,
        providerPaymentId: p.providerPaymentId!,
        paymentId: p.id,
        type: state.status === 'SUCCEEDED' ? 'payment.succeeded' : 'payment.failed',
        failureCode: state.failureCode,
        source: 'RECONCILIATION',
        payload: { reconciledAt: new Date(now).toISOString() },
      });
      if (recorded) resolved++;
    }

    if (resubmitted || resolved)
      this.logger.warn({ resubmitted, resolved }, 'Payment reconciliation acted');
    return { resubmitted, resolved };
  }
}
