import { PaymentsJob, QueueName } from '../../queues/queue-names';

export interface OutboxRoute {
  queue: QueueName;
  job: string;
}

/**
 * Which background jobs each domain event triggers (docs §12.2). Events without routes yet
 * (e.g. BookingConfirmed until tickets/emails land in Phase 6) are marked published and kept
 * in the table for audit.
 */
export const OUTBOX_ROUTES: Record<string, OutboxRoute[]> = {
  PaymentRequested: [{ queue: QueueName.Payments, job: PaymentsJob.SubmitPayment }],
  PaymentEventReceived: [{ queue: QueueName.Payments, job: PaymentsJob.ApplyPaymentEvent }],
  RefundRequired: [{ queue: QueueName.Payments, job: PaymentsJob.RefundPayment }],
};
