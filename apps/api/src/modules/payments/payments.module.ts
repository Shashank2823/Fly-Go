import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { QueuesModule } from '../../queues/queues.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { PaymentEventsService } from './payment-events.service';
import { PaymentInitiationService } from './payment-initiation.service';
import { PaymentProcessingService } from './payment-processing.service';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import { PaymentsController } from './payments.controller';
import { PaymentsRepository } from './payments.repository';
import { MockPaymentProvider } from './providers/mock-payment.provider';
import { PAYMENT_PROVIDER } from './providers/payment-provider';

/**
 * Payments. The provider is bound here — swapping MockPaymentProvider for a real gateway is a
 * one-line change (plus a webhook controller that calls PaymentEventsService.ingest).
 */
@Module({
  imports: [BookingsModule, IdempotencyModule, QueuesModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsRepository,
    PaymentInitiationService,
    PaymentProcessingService,
    PaymentEventsService,
    PaymentReconciliationService,
    MockPaymentProvider,
    { provide: PAYMENT_PROVIDER, useExisting: MockPaymentProvider },
  ],
  exports: [
    PaymentProcessingService,
    PaymentEventsService,
    PaymentReconciliationService,
    MockPaymentProvider,
    PaymentsRepository,
  ],
})
export class PaymentsModule {}
