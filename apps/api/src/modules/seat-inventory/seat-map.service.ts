import { HttpStatus, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { AppError } from '../../common/errors/app-error';
import { toMoney } from '../../common/money/money';
import { AppConfig } from '../../config/app-config';
import { PrismaService } from '../../database/prisma.service';
import { MarketsService } from '../markets/markets.service';
import type { SeatMapResponse, ViewerSeatState } from './seat-map.responses';
import { SeatInventoryRepository } from './seat-inventory.repository';

/**
 * Builds the seat map from the flight's layout snapshot plus live inventory. Never cached:
 * it is one indexed query of a few hundred rows, and staleness would only confuse users.
 */
@Injectable()
export class SeatMapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seats: SeatInventoryRepository,
    private readonly markets: MarketsService,
    private readonly config: AppConfig,
  ) {}

  async forFlight(flightId: string, viewer?: AuthenticatedUser): Promise<SeatMapResponse> {
    const flight = await this.prisma.flight.findUnique({
      where: { id: flightId },
      select: { id: true, seatLayout: { select: { cabins: { orderBy: { firstRow: 'asc' } } } } },
    });
    if (!flight) throw new AppError('FLIGHT_NOT_FOUND', HttpStatus.NOT_FOUND, 'Flight not found');

    const market = await this.markets.resolve(viewer?.nationality);
    const [rows, rules, mine] = await Promise.all([
      this.seats.seatMap(flightId),
      this.markets.activeRules(market.code),
      viewer
        ? this.seats.activeBookingIdsForUser(viewer.id, flightId)
        : Promise.resolve(new Set<string>()),
    ]);
    const surchargeByKind = new Map(
      rules
        .filter((r) => r.kind === 'SEAT_KIND_SURCHARGE' && r.seatKind)
        .map((r) => [r.seatKind!, r.value]),
    );
    const now = Date.now();

    const state = (r: (typeof rows)[number]): ViewerSeatState => {
      if (r.status === 'HELD') {
        if (!r.hold_expires_at || r.hold_expires_at.getTime() < now) return 'AVAILABLE';
        return r.booking_id && mine.has(r.booking_id) ? 'HELD_BY_YOU' : 'HELD';
      }
      return r.status;
    };

    return {
      flightId,
      cabins: flight.seatLayout.cabins.map((c) => ({
        cabin: c.cabin,
        firstRow: c.firstRow,
        lastRow: c.lastRow,
        columns: c.columnPattern.split('').map((ch) => (ch === '_' ? null : ch)),
      })),
      seats: rows.map((r) => {
        const extra = surchargeByKind.get(r.kind);
        return {
          label: r.seat_label,
          row: r.row_number,
          column: r.column_letter,
          cabin: r.cabin,
          kind: r.kind,
          features: r.features,
          state: state(r),
          surcharge: extra ? toMoney(extra, market.currency) : null,
        };
      }),
      holdTtlSeconds: this.config.get('HOLD_TTL_SECONDS'),
      generatedAt: new Date(now).toISOString(),
    };
  }
}
