import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../config/app-config';
import { PrismaService } from '../../database/prisma.service';
import { toZonedIso } from '../../common/time/zoned-time';
import { EMAIL_TRANSPORT, type EmailTransport, PermanentEmailError } from './email-transport';
import { EmailMessagesRepository } from './email-messages.repository';
import {
  BOOKING_CONFIRMATION_TEMPLATE_VERSION,
  renderBookingConfirmation,
} from './templates/booking-confirmation.template';

const CABIN: Record<string, string> = {
  ECONOMY: 'Economy',
  PREMIUM_ECONOMY: 'Premium Economy',
  BUSINESS: 'Business',
  FIRST: 'First',
};

export type SendOutcome = 'SENT' | 'ALREADY_SENT' | 'IN_PROGRESS' | 'SKIPPED';

const inr = (minor: bigint, currency: string) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(Number(minor) / 100);

/**
 * Confirmation emails (docs §9). The Mongo email_messages document is the authoritative
 * delivery record: created once per logical email (dedupeKey), claimed before sending, and
 * updated with every attempt. "SENT" means accepted by the SMTP server — not delivered.
 * Known limit: a crash after SMTP accepts but before SENT is recorded can send a duplicate.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: EmailMessagesRepository,
    @Inject(EMAIL_TRANSPORT) private readonly transport: EmailTransport,
    private readonly config: AppConfig,
  ) {}

  static confirmationKey(reference: string) {
    return `booking:${reference}:confirmation:v${BOOKING_CONFIRMATION_TEMPLATE_VERSION}`;
  }

  /**
   * @param finalAttempt when true, a transient failure is recorded as FAILED instead of
   *   RETRY_SCHEDULED (the queue has no retries left; reconciliation may try again later).
   */
  async sendBookingConfirmation(bookingId: string, finalAttempt = false): Promise<SendOutcome> {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        user: { select: { fullName: true, email: true } },
        flight: { include: { airline: true, origin: true, destination: true } },
        passengers: {
          orderBy: { ordinal: 'asc' },
          include: { seat: { include: { flightSeat: { select: { seatLabel: true } } } } },
        },
        tickets: { orderBy: { version: 'desc' }, take: 1 },
      },
    });
    if (!b || b.status !== 'CONFIRMED') return 'SKIPPED';

    const to = b.contactEmail ?? b.user.email;
    const lead = b.passengers[0];
    const rendered = renderBookingConfirmation({
      reference: b.reference,
      travellerName: lead ? lead.firstName : b.user.fullName.split(' ')[0]!,
      airline: b.flight.airline.name,
      flightNumber: b.flight.flightNumber,
      origin: { iata: b.flight.origin.iataCode, city: b.flight.origin.city },
      destination: { iata: b.flight.destination.iataCode, city: b.flight.destination.city },
      departureLocal: toZonedIso(b.flight.departureAt, b.flight.origin.timezone),
      arrivalLocal: toZonedIso(b.flight.arrivalAt, b.flight.destination.timezone),
      cabin: CABIN[b.cabin] ?? b.cabin,
      passengers: b.passengers.map((p) => ({
        name: `${p.firstName} ${p.lastName}`,
        seat: p.seat?.flightSeat.seatLabel ?? null,
      })),
      total: inr(b.totalMinor ?? 0n, b.currency),
      ticketReady: b.tickets[0]?.status === 'ISSUED',
      bookingUrl: `${this.config.get('WEB_ORIGIN')}/bookings/${b.reference}`,
    });

    const dedupeKey = EmailService.confirmationKey(b.reference);
    const now = new Date();
    const existing = await this.messages.ensure({
      dedupeKey,
      type: 'BOOKING_CONFIRMATION',
      templateVersion: BOOKING_CONFIRMATION_TEMPLATE_VERSION,
      bookingId,
      reference: b.reference,
      userId: b.userId,
      to,
      subject: rendered.subject,
      status: 'QUEUED',
      attempts: [],
      lockedUntil: null,
      sentAt: null,
      providerMessageId: null,
      createdAt: now,
      updatedAt: now,
    });
    if (existing.status === 'SENT') return 'ALREADY_SENT';

    const claimed = await this.messages.claim(dedupeKey, now);
    if (!claimed) return 'IN_PROGRESS';

    try {
      const { providerMessageId } = await this.transport.send({
        to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        messageId: `<${dedupeKey.replace(/:/g, '.')}@flygo.local>`,
      });
      await this.messages.markSent(dedupeKey, {
        at: new Date(),
        outcome: 'SENT',
        providerMessageId,
      });
      this.logger.log({ reference: b.reference, providerMessageId }, 'Confirmation email sent');
      return 'SENT';
    } catch (err) {
      const permanent = err instanceof PermanentEmailError;
      await this.messages.markFailedAttempt(
        dedupeKey,
        {
          at: new Date(),
          outcome: permanent ? 'PERMANENT_ERROR' : 'TRANSIENT_ERROR',
          error: (err as Error).message.slice(0, 300),
        },
        permanent || finalAttempt,
      );
      throw err;
    }
  }
}
