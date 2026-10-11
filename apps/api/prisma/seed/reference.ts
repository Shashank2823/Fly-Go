import type { PrismaClient } from '../../src/generated/prisma/client';
import { AIRPORTS } from './data/airports';
import { AIRLINES, LAYOUTS, seatsForCabin } from './data/fleet';

export async function seedReferenceData(prisma: PrismaClient): Promise<void> {
  for (const a of AIRPORTS) {
    await prisma.airport.upsert({ where: { iataCode: a.iataCode }, create: a, update: a });
  }
  for (const a of AIRLINES) {
    await prisma.airline.upsert({
      where: { iataCode: a.iataCode },
      create: a,
      update: { name: a.name },
    });
  }

  for (const spec of LAYOUTS) {
    const type = await prisma.aircraftType.upsert({
      where: { model: spec.model },
      create: { model: spec.model, manufacturer: spec.manufacturer },
      update: { manufacturer: spec.manufacturer },
    });

    // Layouts are immutable once flights reference them: create version 1 only if missing.
    let layout = await prisma.seatLayout.findUnique({
      where: { aircraftTypeId_version: { aircraftTypeId: type.id, version: 1 } },
    });
    if (!layout) {
      layout = await prisma.seatLayout.create({
        data: {
          aircraftTypeId: type.id,
          version: 1,
          name: spec.name,
          cabins: { create: spec.cabins },
          seats: { create: spec.cabins.flatMap((c) => seatsForCabin(c, spec.rowKinds)) },
        },
      });
    }

    const airlines = await prisma.airline.findMany({ orderBy: { iataCode: 'asc' } });
    for (const airline of airlines) {
      for (let i = 1; i <= spec.fleetSize; i++) {
        const registration = `VT-${airline.iataCode}${spec.model.startsWith('A') ? 'A' : 'B'}${String(i).padStart(2, '0')}`;
        await prisma.aircraft.upsert({
          where: { registration },
          create: {
            registration,
            airlineId: airline.id,
            aircraftTypeId: type.id,
            seatLayoutId: layout.id,
          },
          update: {},
        });
      }
    }
  }
  console.log(
    `Seeded ${AIRPORTS.length} airports, ${AIRLINES.length} airlines, ${LAYOUTS.length} aircraft layouts.`,
  );
}
