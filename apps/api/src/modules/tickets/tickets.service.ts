import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { Permission } from '../../common/auth/permissions';
import { AppError } from '../../common/errors/app-error';
import { toZonedIso } from '../../common/time/zoned-time';
import type { TicketSnapshotDoc } from '../../database/mongo/collections';
import { PrismaService } from '../../database/prisma.service';
import { TransactionRunner } from '../../database/transaction-runner';
import { FILE_STORAGE, type FileStorage } from '../../infrastructure/storage/file-storage';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { renderTicketPdf, TICKET_TEMPLATE_VERSION } from './pdf/ticket-pdf.renderer';
import { TicketSnapshotsRepository } from './ticket-snapshots.repository';

/** A GENERATING claim older than this is assumed abandoned (worker crashed) and can be retaken. */
const STALE_CLAIM_MS = 2 * 60_000;

export type GenerateOutcome = 'ISSUED' | 'ALREADY_ISSUED' | 'IN_PROGRESS' | 'NO_TICKET';

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/**
 * E-ticket generation (docs §13). Order of effects, each idempotent:
 *   claim ticket (PG) → snapshot (Mongo, insert-once) → render PDF (deterministic) →
 *   store file → mark ISSUED + outbox TicketIssued (PG, one transaction).
 * A crash anywhere is safe to retry; the same snapshot always produces the same bytes.
 */
@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tx: TransactionRunner,
    private readonly snapshots: TicketSnapshotsRepository,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  async generate(bookingId: string): Promise<GenerateOutcome> {
    const ticket = await this.prisma.ticket.findFirst({
      where: { bookingId },
      orderBy: { version: 'desc' },
    });
    if (!ticket) return 'NO_TICKET';
    if (ticket.status === 'ISSUED') return 'ALREADY_ISSUED';
    if (ticket.status === 'VOIDED') return 'NO_TICKET';

    const claimed = await this.prisma.ticket.updateMany({
      where: {
        id: ticket.id,
        OR: [
          { status: { in: ['PENDING', 'FAILED'] } },
          { status: 'GENERATING', updatedAt: { lt: new Date(Date.now() - STALE_CLAIM_MS) } },
        ],
      },
      data: { status: 'GENERATING', attempts: { increment: 1 } },
    });
    if (claimed.count === 0) return 'IN_PROGRESS';

    try {
      const snapshot = await this.snapshots.upsertOnce(await this.buildSnapshot(bookingId, ticket));
      const pdf = await renderTicketPdf(snapshot);
      const digest = sha256(pdf);
      const storageKey = `tickets/${snapshot.reference}/v${snapshot.version}.pdf`;
      await this.storage.put(storageKey, pdf);

      await this.tx.run(async (tx) => {
        const updated = await tx.ticket.updateMany({
          where: { id: ticket.id, status: 'GENERATING' },
          data: {
            status: 'ISSUED',
            issuedAt: snapshot.issuedAt,
            snapshotRef: snapshot._id.toHexString(),
            storageKey,
            sha256: digest,
            lastError: null,
          },
        });
        if (updated.count === 0) return;
        const booking = await tx.booking.findUniqueOrThrow({
          where: { id: bookingId },
          select: { reference: true, userId: true },
        });
        await this.audit.record(
          {
            actorUserId: null,
            actorType: 'SYSTEM',
            action: 'TICKET_ISSUED',
            entityType: 'ticket',
            entityId: ticket.id,
            after: { version: ticket.version, sha256: digest },
          },
          tx,
        );
        await this.outbox.add(tx, {
          aggregateType: 'ticket',
          aggregateId: ticket.id,
          eventType: 'TicketIssued',
          payload: {
            bookingId,
            reference: booking.reference,
            userId: booking.userId,
            ticketNumber: ticket.ticketNumber,
          },
        });
      });
      this.logger.log({ bookingId, ticketId: ticket.id, bytes: pdf.length }, 'Ticket issued');
      return 'ISSUED';
    } catch (err) {
      await this.prisma.ticket.updateMany({
        where: { id: ticket.id, status: 'GENERATING' },
        data: {
          status: 'FAILED',
          lastError: (err instanceof Error ? err.message : String(err)).slice(0, 500),
        },
      });
      throw err;
    }
  }

  /** Owner-scoped PDF for download/viewing. Rebuilds the file from its snapshot if storage lost it. */
  async pdfForUser(
    user: AuthenticatedUser,
    reference: string,
  ): Promise<{ pdf: Buffer; filename: string }> {
    const anyBooking = user.permissions.includes(Permission.TicketReadAny);
    const booking = await this.prisma.booking.findFirst({
      where: { reference, ...(anyBooking ? {} : { userId: user.id }) },
      select: { id: true, status: true },
    });
    if (!booking)
      throw new AppError('BOOKING_NOT_FOUND', HttpStatus.NOT_FOUND, 'Booking not found');

    const ticket = await this.prisma.ticket.findFirst({
      where: { bookingId: booking.id },
      orderBy: { version: 'desc' },
    });
    if (booking.status !== 'CONFIRMED' || !ticket) {
      throw new AppError(
        'TICKET_NOT_AVAILABLE',
        HttpStatus.NOT_FOUND,
        'This booking has no e-ticket',
      );
    }
    if (ticket.status !== 'ISSUED' || !ticket.storageKey || !ticket.snapshotRef) {
      throw new AppError(
        'TICKET_NOT_READY',
        HttpStatus.CONFLICT,
        'Your e-ticket is still being prepared',
        {
          status: ticket.status,
          retryAfterSeconds: 3,
        },
      );
    }

    let pdf = await this.storage.get(ticket.storageKey);
    if (!pdf) {
      const snapshot = await this.snapshots.findById(ticket.snapshotRef);
      if (!snapshot)
        throw new Error(`Ticket snapshot ${ticket.snapshotRef} missing for ${reference}`);
      pdf = await renderTicketPdf(snapshot);
      if (sha256(pdf) !== ticket.sha256)
        this.logger.warn({ reference }, 'Rebuilt ticket differs from issued checksum');
      await this.storage.put(ticket.storageKey, pdf);
      this.logger.warn({ reference }, 'Ticket file was missing — rebuilt from snapshot');
    }
    return { pdf, filename: `FlyGo-${reference}.pdf` };
  }

  private async buildSnapshot(
    bookingId: string,
    ticket: { version: number; ticketNumber: string; createdAt: Date },
  ): Promise<TicketSnapshotDoc> {
    const b = await this.prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: {
        flight: {
          include: {
            airline: true,
            origin: true,
            destination: true,
            aircraft: { include: { aircraftType: true } },
          },
        },
        passengers: {
          orderBy: { ordinal: 'asc' },
          include: { seat: { include: { flightSeat: { select: { seatLabel: true } } } } },
        },
        payments: { where: { status: 'SUCCEEDED' }, take: 1 },
      },
    });
    const lines = await this.prisma.bookingPriceLine.findMany({
      where: { bookingId, priceVersion: b.priceVersion },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const ordinalById = new Map(b.passengers.map((p) => [p.id, p.ordinal]));
    const payment = b.payments[0];
    const f = b.flight;
    return {
      bookingId,
      version: ticket.version,
      reference: b.reference,
      ticketNumber: ticket.ticketNumber,
      // Fixed per ticket version → deterministic PDF bytes on every retry.
      issuedAt: b.confirmedAt ?? ticket.createdAt,
      templateVersion: TICKET_TEMPLATE_VERSION,
      cabin: b.cabin,
      flight: {
        airline: { code: f.airline.iataCode, name: f.airline.name },
        flightNumber: f.flightNumber,
        aircraft: f.aircraft.aircraftType.model,
        origin: { iata: f.origin.iataCode, city: f.origin.city, name: f.origin.name },
        destination: {
          iata: f.destination.iataCode,
          city: f.destination.city,
          name: f.destination.name,
        },
        departureLocal: toZonedIso(f.departureAt, f.origin.timezone),
        arrivalLocal: toZonedIso(f.arrivalAt, f.destination.timezone),
        durationMinutes: Math.round((f.arrivalAt.getTime() - f.departureAt.getTime()) / 60_000),
      },
      passengers: b.passengers.map((p) => ({
        ordinal: p.ordinal,
        type: p.type,
        firstName: p.firstName,
        lastName: p.lastName,
        seatLabel: p.seat?.flightSeat.seatLabel ?? null,
      })),
      price: {
        currency: b.currency,
        totalMinor: (b.totalMinor ?? 0n).toString(),
        lines: lines.map((l) => ({
          description: l.description,
          passengerOrdinal: l.passengerId ? (ordinalById.get(l.passengerId) ?? null) : null,
          amountMinor: l.amountMinor.toString(),
        })),
      },
      payment: {
        status: payment?.status ?? 'SUCCEEDED',
        amountMinor: (payment?.amountMinor ?? b.totalMinor ?? 0n).toString(),
        currency: payment?.currency ?? b.currency,
        paidAt: payment?.succeededAt ?? null,
      },
      contactEmail: b.contactEmail,
      createdAt: new Date(),
    };
  }
}
