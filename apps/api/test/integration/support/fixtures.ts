import type { PrismaService } from '../../../src/database/prisma.service';
import type { PrismaClient } from '../../../src/generated/prisma/client';
import { zonedDate, zonedTimeToUtc } from '../../../src/common/time/zoned-time';
import { seedMarkets } from '../../../prisma/seed/markets';
import { seedRoles } from '../../../prisma/seed/roles';

type Db = PrismaService | PrismaClient;

/** Empties every application table (test DB only). */
export async function resetDatabase(prisma: Db): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
  await seedRoles(prisma);
  await seedMarkets(prisma);
}

export interface FlightFixture {
  flightId: string;
  otherFlightId: string;
  departureAt: Date;
  date: string;
}

/**
 * Two airports (DEL → BOM), one airline, a tiny 2-row layout (1 business row "AC", 1 economy
 * row "ABC": rows 1–2) and two flights tomorrow at 09:30 and 18:00 IST.
 */
export async function createFlightFixture(
  prisma: Db,
  baseFareMinor = 500_000n,
): Promise<FlightFixture> {
  const [del, bom] = await Promise.all([
    prisma.airport.create({
      data: {
        iataCode: 'DEL',
        name: 'Indira Gandhi International Airport',
        city: 'New Delhi',
        countryCode: 'IN',
        timezone: 'Asia/Kolkata',
      },
    }),
    prisma.airport.create({
      data: {
        iataCode: 'BOM',
        name: 'Chhatrapati Shivaji Maharaj International Airport',
        city: 'Mumbai',
        countryCode: 'IN',
        timezone: 'Asia/Kolkata',
      },
    }),
  ]);
  const airline = await prisma.airline.create({ data: { iataCode: 'XI', name: 'Indus Skyways' } });
  const type = await prisma.aircraftType.create({
    data: { manufacturer: 'Airbus', model: 'A320neo' },
  });
  const layout = await prisma.seatLayout.create({
    data: {
      aircraftTypeId: type.id,
      version: 1,
      name: 'Test layout',
      cabins: {
        create: [
          { cabin: 'BUSINESS', firstRow: 1, lastRow: 1, columnPattern: 'A_C' },
          { cabin: 'ECONOMY', firstRow: 2, lastRow: 2, columnPattern: 'AB_C' },
        ],
      },
      seats: {
        create: [
          { rowNumber: 1, columnLetter: 'A', cabin: 'BUSINESS', features: ['WINDOW'] },
          { rowNumber: 1, columnLetter: 'C', cabin: 'BUSINESS', features: ['WINDOW'] },
          { rowNumber: 2, columnLetter: 'A', cabin: 'ECONOMY', features: ['WINDOW'] },
          {
            rowNumber: 2,
            columnLetter: 'B',
            cabin: 'ECONOMY',
            kind: 'EXTRA_LEGROOM',
            features: ['AISLE'],
          },
          { rowNumber: 2, columnLetter: 'C', cabin: 'ECONOMY', features: ['WINDOW', 'AISLE'] },
        ],
      },
    },
  });
  const plane = await prisma.aircraft.create({
    data: {
      airlineId: airline.id,
      aircraftTypeId: type.id,
      seatLayoutId: layout.id,
      registration: 'VT-TST01',
    },
  });

  const date = zonedDate(new Date(Date.now() + 86_400_000), 'Asia/Kolkata');
  const mk = async (time: string, number: string) => {
    const departureAt = zonedTimeToUtc(date, time, 'Asia/Kolkata');
    const flight = await prisma.flight.create({
      data: {
        airlineId: airline.id,
        flightNumber: number,
        originAirportId: del.id,
        destinationAirportId: bom.id,
        aircraftId: plane.id,
        seatLayoutId: layout.id,
        departureAt,
        arrivalAt: new Date(departureAt.getTime() + 130 * 60_000),
        fares: {
          create: [
            { cabin: 'ECONOMY', marketCode: 'IN', currency: 'INR', baseFareMinor },
            {
              cabin: 'BUSINESS',
              marketCode: 'IN',
              currency: 'INR',
              baseFareMinor: baseFareMinor * 3n,
            },
          ],
        },
      },
    });
    await prisma.$executeRaw`
      INSERT INTO flight_seats (id, flight_id, layout_seat_id, seat_label, cabin, kind, updated_at)
      SELECT gen_random_uuid(), ${flight.id}::uuid, ls.id, ls.row_number::text || ls.column_letter, ls.cabin, ls.kind, now()
      FROM layout_seats ls WHERE ls.seat_layout_id = ${layout.id}::uuid`;
    return flight;
  };
  const morning = await mk('09:30', 'XI101');
  const evening = await mk('18:00', 'XI103');
  return {
    flightId: morning.id,
    otherFlightId: evening.id,
    departureAt: morning.departureAt,
    date,
  };
}
