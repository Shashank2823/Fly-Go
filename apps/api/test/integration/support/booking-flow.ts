import { zonedDate } from '../../../src/common/time/zoned-time';
import type { FlightFixture } from './fixtures';
import type { signedInAgent } from './users';

type Agent = Awaited<ReturnType<typeof signedInAgent>>;

/** A birth date making someone `years` old (minus a margin) on the fixture's departure date. */
export function dobForAge(fx: FlightFixture, years: number): string {
  const dep = zonedDate(fx.departureAt, 'Asia/Kolkata');
  const [y, m, d] = dep.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y - years, m - 1, d - 30)).toISOString().slice(0, 10);
}

export const contact = { email: 'asha@example.com', phone: '+919876543210' };

export const adult = (
  fx: FlightFixture,
  ordinal: number,
  seatLabel: string,
  firstName = 'Asha',
) => ({
  ordinal,
  type: 'ADULT',
  firstName,
  lastName: 'Verma',
  dateOfBirth: dobForAge(fx, 30),
  nationality: 'IN',
  seatLabel,
});

/** hold → passengers → checkout; returns the reference and priceVersion ready to pay. */
export async function readyToPay(a: Agent, fx: FlightFixture, seats = ['2A']) {
  const hold = await a
    .hold({
      flightId: fx.flightId,
      cabin: 'ECONOMY',
      passengers: { adults: seats.length, children: 0, infants: 0 },
      seats,
    })
    .expect(201);
  const reference = hold.body.reference as string;
  await a
    .put(`/api/v1/bookings/${reference}/passengers`, {
      contact,
      passengers: seats.map((s, i) =>
        adult(fx, i + 1, s, `Traveller${String.fromCharCode(65 + i)}`),
      ),
    })
    .expect(200);
  const quote = await a.post(`/api/v1/bookings/${reference}/checkout`).expect(200);
  return { reference, priceVersion: quote.body.priceVersion as number, total: quote.body.total };
}
