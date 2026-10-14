/**
 * Queue topology (docs §12.2). Queues are added as their phases land:
 * maintenance (2), payments (5), tickets / email / notifications (6).
 */
export const QueueName = {
  Maintenance: 'maintenance',
  Payments: 'payments',
  Tickets: 'tickets',
  Email: 'email',
  Notifications: 'notifications',
} as const;
export type QueueName = (typeof QueueName)[keyof typeof QueueName];

export const MaintenanceJob = {
  WorkerHeartbeat: 'worker-heartbeat',
  ExpireHolds: 'expire-holds',
  OutboxRelay: 'outbox-relay',
  ReconcilePayments: 'reconcile-payments',
  ReconcileTickets: 'reconcile-tickets',
  RetryEmails: 'retry-failed-emails',
} as const;
export type MaintenanceJob = (typeof MaintenanceJob)[keyof typeof MaintenanceJob];

export const PaymentsJob = {
  /** Send an INITIATED payment to the provider. */
  SubmitPayment: 'submit-payment',
  /** Apply a recorded provider event (webhook, simulated or reconciliation) to the payment and booking. */
  ApplyPaymentEvent: 'apply-payment-event',
  /** Refund a payment that succeeded for a booking that could not be confirmed. */
  RefundPayment: 'refund-payment',
  /** Development only: the mock gateway "calling our webhook" after a delay. */
  MockProviderEvent: 'mock-provider-event',
} as const;
export type PaymentsJob = (typeof PaymentsJob)[keyof typeof PaymentsJob];

export const TicketsJob = { GenerateTicket: 'generate-ticket' } as const;
export const EmailJob = { SendBookingConfirmation: 'send-booking-confirmation' } as const;
export const NotificationsJob = { CreateNotification: 'create-notification' } as const;

/** BullMQ key prefix — keeps FlyGo keys separate from cache/session keys in Redis. */
export const QUEUE_PREFIX = 'flygo:bull';

export const WORKER_HEARTBEAT_KEY = 'worker:heartbeat';
export const WORKER_HEARTBEAT_STALE_MS = 45_000;
