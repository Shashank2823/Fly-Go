import { zonedDate, zonedTimeToUtc } from '../../src/common/time/zoned-time';
import type { CabinClass, PrismaClient } from '../../src/generated/prisma/client';
import { DEPARTURE_SLOTS, ROUTES } from './data/routes';

const DAYS_AHEAD = 21;

/** Deterministic pseudo-random in [0, 1) so re-running the seed yields the same schedule/fares. */
function rand(...parts: (string | number)[]): number {
  let h = 2166136261;
  for (const ch of parts.join('|')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10_000) / 10_000;
}

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/** INR base fare in paise: distance-driven, demand-adjusted, rounded to ₹10. */
function baseFare(
  minutes: number,
  international: boolean,
  cabin: CabinClass,
  daysAhead: number,
  seed: string,
): bigint {
  const economy = 1_500 + minutes * (international ? 45 : 28);
  const demand = 0.85 + rand(seed, 'demand') * 0.5; // 0.85–1.35
  const lastMinute = 1 + Math.max(0, 7 - daysAhead) * 0.06;
  const cabinFactor = cabin === 'BUSINESS' ? (international ? 3.8 : 3.2) : 1;
  return BigInt(roundTo(economy * demand * lastMinute * cabinFactor, 10) * 100);
}

export async function seedFlights(prisma: PrismaClient): Promise<void> {
  const airports = new Map((await prisma.airport.findMany()).map((a) => [a.iataCode, a]));
  const airlines = await prisma.airline.findMany({ orderBy: { iataCode: 'asc' } });
  const aircraft = await prisma.aircraft.findMany({
    include: { aircraftType: true },
    orderBy: { registration: 'asc' },
  });

  const directional = ROUTES.flatMap((r, i) => [
    { ...r, from: r.a, to: r.b, index: i * 2 },
    { ...r, from: r.b, to: r.a, index: i * 2 + 1 },
  ]);

  const flights: {
    airlineId: string;
    flightNumber: string;
    originAirportId: string;
    destinationAirportId: string;
    aircraftId: string;
    seatLayoutId: string;
    departureAt: Date;
    arrivalAt: Date;
  }[] = [];
  const fares: { key: string; cabin: CabinClass; baseFareMinor: bigint }[] = [];

  const todayIst = zonedDate(new Date(), 'Asia/Kolkata');
  for (let day = 0; day <= DAYS_AHEAD; day++) {
    const date = new Date(Date.parse(`${todayIst}T00:00:00Z`) + day * 86_400_000)
      .toISOString()
      .slice(0, 10);

    for (const route of directional) {
      const origin = airports.get(route.from)!;
      const destination = airports.get(route.to)!;
      const slotsPerDay = route.international ? 1 : 2;
      const model = route.international ? '787-9' : 'A320neo';

      for (let slot = 0; slot < slotsPerDay; slot++) {
        const airline = airlines[(route.index + slot) % airlines.length]!;
        const fleet = aircraft.filter(
          (a) => a.airlineId === airline.id && a.aircraftType.model === model,
        );
        const plane = fleet[(route.index * 3 + slot + day) % fleet.length]!;
        const time =
          DEPARTURE_SLOTS[Math.floor(rand(route.from, route.to, slot) * DEPARTURE_SLOTS.length)]!;
        // Two daily slots on a route must differ.
        const slotTime =
          slot === 0
            ? time
            : DEPARTURE_SLOTS[(DEPARTURE_SLOTS.indexOf(time) + 3) % DEPARTURE_SLOTS.length]!;
        const departureAt = zonedTimeToUtc(date, slotTime, origin.timezone);
        const flightNumber = `${airline.iataCode}${100 + route.index * 2 + slot}`;

        flights.push({
          airlineId: airline.id,
          flightNumber,
          originAirportId: origin.id,
          destinationAirportId: destination.id,
          aircraftId: plane.id,
          seatLayoutId: plane.seatLayoutId,
          departureAt,
          arrivalAt: new Date(departureAt.getTime() + route.minutes * 60_000),
        });
        const key = `${airline.id}|${flightNumber}|${departureAt.toISOString()}`;
        for (const cabin of ['ECONOMY', 'BUSINESS'] as const) {
          fares.push({
            key,
            cabin,
            baseFareMinor: baseFare(route.minutes, !!route.international, cabin, day, key),
          });
        }
      }
    }
  }

  const created = await prisma.flight.createMany({ data: flights, skipDuplicates: true });

  // Map natural keys to IDs for fares (covers flights created by earlier seed runs too).
  const rows = await prisma.flight.findMany({
    where: {
      departureAt: { gte: new Date(Math.min(...flights.map((f) => f.departureAt.getTime()))) },
    },
    select: { id: true, airlineId: true, flightNumber: true, departureAt: true },
  });
  const idByKey = new Map(
    rows.map((f) => [`${f.airlineId}|${f.flightNumber}|${f.departureAt.toISOString()}`, f.id]),
  );
  const fareRows = fares
    .filter((f) => idByKey.has(f.key))
    .map((f) => ({
      flightId: idByKey.get(f.key)!,
      cabin: f.cabin,
      marketCode: 'IN',
      currency: 'INR',
      baseFareMinor: f.baseFareMinor,
    }));
  const createdFares = await prisma.flightFare.createMany({ data: fareRows, skipDuplicates: true });

  // Seat inventory generated in SQL from each flight's layout snapshot (only for flights without it).
  const seats = await prisma.$executeRaw`
    INSERT INTO flight_seats (id, flight_id, layout_seat_id, seat_label, cabin, kind, status, version, updated_at)
    SELECT gen_random_uuid(), f.id, ls.id, ls.row_number::text || ls.column_letter, ls.cabin, ls.kind,
           'AVAILABLE', 0, now()
    FROM flights f
    JOIN layout_seats ls ON ls.seat_layout_id = f.seat_layout_id
    WHERE NOT EXISTS (SELECT 1 FROM flight_seats s WHERE s.flight_id = f.id)`;

  console.log(
    `Seeded flights: ${created.count} new (of ${flights.length} planned), ${createdFares.count} fares, ${seats} seats.`,
  );
}
