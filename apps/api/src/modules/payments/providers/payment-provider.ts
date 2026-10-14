/**
 * Port for payment gateways (docs §11.1). The booking domain only talks to this interface,
 * so Razorpay/Stripe can replace the mock without touching bookings, seats or queues.
 */
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export type ProviderPaymentStatus = 'PROCESSING' | 'REQUIRES_ACTION' | 'SUCCEEDED' | 'FAILED';

export interface CreatePaymentInput {
  paymentId: string;
  amountMinor: bigint;
  currency: string;
  bookingReference: string;
  /** Booking contact email (real gateways use it for receipts; the mock reads a test marker). */
  customerEmail: string | null;
  /** Forwarded to the provider so a retried submission never charges twice. */
  idempotencyKey: string;
}

export interface CreatePaymentResult {
  providerPaymentId: string;
  status: ProviderPaymentStatus;
  failureCode?: string;
}

export interface ProviderPaymentState {
  providerPaymentId: string;
  status: ProviderPaymentStatus | 'REFUNDED';
  failureCode?: string;
}

export interface PaymentProvider {
  readonly name: string;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  getPayment(providerPaymentId: string): Promise<ProviderPaymentState | null>;
  refund(providerPaymentId: string, amountMinor: bigint, idempotencyKey: string): Promise<void>;
}

/** Normalised provider event, as stored in payment_events (docs §11.3). */
export interface ProviderEvent {
  provider: string;
  providerEventId: string;
  providerPaymentId: string;
  /** Our payment id, echoed back by providers via metadata (Stripe/Razorpay support this). */
  paymentId?: string;
  /** e.g. 'payment.succeeded', 'payment.failed'; unknown types are recorded and ignored. */
  type: string;
  failureCode?: string;
  providerCreatedAt?: Date;
  source: 'WEBHOOK' | 'SIMULATED' | 'RECONCILIATION';
  payload: Record<string, unknown>;
}
