import { Client } from 'pg';
import { e2eEnv } from './env';

/** Direct access to the flygo_e2e database for setting up edge cases and asserting state. */
export async function withDb<T>(fn: (db: Client) => Promise<T>): Promise<T> {
  const db = new Client({ connectionString: e2eEnv().DATABASE_URL });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

export const paymentsFor = (reference: string) =>
  withDb(async (db) => {
    const { rows } = await db.query<{ status: string }>(
      `SELECT p.status FROM payments p JOIN bookings b ON b.id = p.booking_id
        WHERE b.reference = $1 ORDER BY p.created_at`,
      [reference],
    );
    return rows.map((r) => r.status);
  });

/** Moves a hold's expiry into the past, as if the traveller had waited out the 10 minutes. */
export const expireHold = (reference: string) =>
  withDb(async (db) => {
    await db.query('BEGIN');
    await db.query(
      `UPDATE flight_seats SET hold_expires_at = now() - interval '1 second'
        WHERE status = 'HELD' AND booking_id = (SELECT id FROM bookings WHERE reference = $1)`,
      [reference],
    );
    await db.query(
      `UPDATE bookings SET hold_expires_at = now() - interval '1 second' WHERE reference = $1`,
      [reference],
    );
    await db.query('COMMIT');
  });
