import { Injectable, Logger } from '@nestjs/common';
import { TransactionRunner } from '../../database/transaction-runner';
import { OutboxService } from '../outbox/outbox.service';
import type { ProviderEvent } from './providers/payment-provider';

/**
 * The payment "inbox" (docs §11.3). Every provider signal — webhook, simulated mock callback or
 * reconciliation finding — is recorded once (UNIQUE provider + provider_event_id) before it is
 * acted on. Duplicates are ignored here; the apply step runs asynchronously via the outbox.
 */
@Injectable()
export class PaymentEventsService {
  private readonly logger = new Logger(PaymentEventsService.name);

  constructor(
    private readonly tx: TransactionRunner,
    private readonly outbox: OutboxService,
  ) {}

  async ingest(event: ProviderEvent): Promise<{ recorded: boolean; paymentEventId?: string }> {
    return this.tx.run(async (tx) => {
      const payment =
        (await tx.payment.findUnique({
          where: {
            provider_providerPaymentId: {
              provider: event.provider,
              providerPaymentId: event.providerPaymentId,
            },
          },
        })) ??
        (event.paymentId ? await tx.payment.findUnique({ where: { id: event.paymentId } }) : null);

      const rows = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO payment_events (id, provider, provider_event_id, payment_id, type, source, provider_created_at, payload, status)
        VALUES (gen_random_uuid(), ${event.provider}, ${event.providerEventId}, ${payment?.id ?? null}::uuid, ${event.type},
                ${event.source}::payment_event_source, ${event.providerCreatedAt ?? null},
                ${JSON.stringify({ ...event.payload, failureCode: event.failureCode ?? null })}::jsonb, 'RECEIVED')
        ON CONFLICT (provider, provider_event_id) DO NOTHING
        RETURNING id`;
      const inserted = rows[0];
      if (!inserted) {
        this.logger.log(
          { providerEventId: event.providerEventId },
          'Duplicate provider event ignored',
        );
        return { recorded: false };
      }

      await this.outbox.add(tx, {
        aggregateType: 'payment',
        aggregateId: payment?.id ?? inserted.id,
        eventType: 'PaymentEventReceived',
        payload: { paymentEventId: inserted.id },
      });
      return { recorded: true, paymentEventId: inserted.id };
    });
  }
}
