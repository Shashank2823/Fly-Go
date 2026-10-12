import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { AppConfig } from '../../../config/app-config';
import { REDIS_CLIENT } from '../../../infrastructure/redis/redis.module';
import { PaymentsJob, QueueName } from '../../../queues/queue-names';
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  ProviderEvent,
  ProviderPaymentState,
} from './payment-provider';

const LEDGER_TTL_SECONDS = 7 * 24 * 3600;
const ledgerKey = (providerPaymentId: string) => `mockpay:${providerPaymentId}`;

/**
 * DEVELOPMENT-ONLY gateway (refused in production by config validation). Behaves like a real
 * asynchronous gateway: accepts the payment as PROCESSING, then "calls our webhook" later by
 * enqueuing a delayed event that goes through the same ingestion path a real webhook would.
 * Outcome is success unless MOCK_PAYMENT_OUTCOME=fail. Its ledger lives in Redis so
 * reconciliation (getPayment) and refunds work like the real thing.
 */
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  private readonly logger = new Logger(MockPaymentProvider.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectQueue(QueueName.Payments) private readonly payments: Queue,
    private readonly config: AppConfig,
  ) {}

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const providerPaymentId = `mockpay_${input.idempotencyKey.replace(/-/g, '')}`;
    const outcome = this.config.get('MOCK_PAYMENT_OUTCOME');

    // Idempotent: the same key returns the existing payment and never "charges" twice.
    const created = await this.redis.set(
      ledgerKey(providerPaymentId),
      JSON.stringify({
        status: 'PROCESSING',
        amountMinor: input.amountMinor.toString(),
        currency: input.currency,
        outcome,
      }),
      'EX',
      LEDGER_TTL_SECONDS,
      'NX',
    );
    if (created) {
      const event: ProviderEvent = {
        provider: this.name,
        providerEventId: `evt_${providerPaymentId}_${outcome}`,
        providerPaymentId,
        paymentId: input.paymentId,
        type: outcome === 'success' ? 'payment.succeeded' : 'payment.failed',
        failureCode: outcome === 'success' ? undefined : 'card_declined',
        source: 'SIMULATED',
        payload: {
          amountMinor: input.amountMinor.toString(),
          currency: input.currency,
          mock: true,
        },
      };
      await this.payments.add(
        PaymentsJob.MockProviderEvent,
        { ...event, providerCreatedAt: new Date().toISOString() },
        { delay: this.config.get('MOCK_PAYMENT_DELAY_MS'), jobId: event.providerEventId },
      );
      this.logger.log(
        { paymentId: input.paymentId, providerPaymentId, outcome },
        'Mock payment accepted',
      );
    }
    return { providerPaymentId, status: 'PROCESSING' };
  }

  /** Called when the simulated webhook fires: settle the mock ledger like a real gateway would. */
  async settle(providerPaymentId: string, status: 'SUCCEEDED' | 'FAILED'): Promise<void> {
    const raw = await this.redis.get(ledgerKey(providerPaymentId));
    if (!raw) return;
    const entry = JSON.parse(raw) as Record<string, unknown>;
    if (entry.status === 'PROCESSING') {
      await this.redis.set(
        ledgerKey(providerPaymentId),
        JSON.stringify({ ...entry, status }),
        'KEEPTTL',
      );
    }
  }

  async getPayment(providerPaymentId: string): Promise<ProviderPaymentState | null> {
    const raw = await this.redis.get(ledgerKey(providerPaymentId));
    if (!raw) return null;
    const entry = JSON.parse(raw) as { status: ProviderPaymentState['status'] };
    return { providerPaymentId, status: entry.status };
  }

  async refund(providerPaymentId: string): Promise<void> {
    const raw = await this.redis.get(ledgerKey(providerPaymentId));
    if (!raw) return;
    const entry = JSON.parse(raw) as Record<string, unknown>;
    await this.redis.set(
      ledgerKey(providerPaymentId),
      JSON.stringify({ ...entry, status: 'REFUNDED' }),
      'KEEPTTL',
    );
  }
}
