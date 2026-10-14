import {
  EmailJob,
  NotificationsJob,
  PaymentsJob,
  QueueName,
  TicketsJob,
} from '../../queues/queue-names';

export interface OutboxRoute {
  queue: QueueName;
  job: string;
  /** Extra static job data (e.g. which notification to create). */
  data?: Record<string, unknown>;
}

const notify = (type: string): OutboxRoute => ({
  queue: QueueName.Notifications,
  job: NotificationsJob.CreateNotification,
  data: { notificationType: type },
});

/**
 * Which background jobs each domain event triggers (docs §12.2). A failure in one branch
 * (e.g. email) never affects the others (e.g. ticket generation) — they are separate jobs.
 */
export const OUTBOX_ROUTES: Record<string, OutboxRoute[]> = {
  PaymentRequested: [{ queue: QueueName.Payments, job: PaymentsJob.SubmitPayment }],
  PaymentEventReceived: [{ queue: QueueName.Payments, job: PaymentsJob.ApplyPaymentEvent }],
  RefundRequired: [{ queue: QueueName.Payments, job: PaymentsJob.RefundPayment }],
  BookingConfirmed: [
    { queue: QueueName.Tickets, job: TicketsJob.GenerateTicket },
    { queue: QueueName.Email, job: EmailJob.SendBookingConfirmation },
    notify('BOOKING_CONFIRMED'),
  ],
  TicketIssued: [notify('TICKET_READY')],
  BookingExpired: [notify('BOOKING_EXPIRED')],
  PaymentFailed: [notify('PAYMENT_FAILED')],
  PaymentRefunded: [notify('PAYMENT_REFUNDED')],
};
