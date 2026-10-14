import { expect, test } from '@playwright/test';
import { expireHold, withDb } from '../support/db';
import { holdFirstFreeSeat, openFlight, registerViaApi } from '../support/flows';

/**
 * Seats are held for 10 minutes. Rather than wait, the test moves the expiry into the past;
 * the UI must stop the traveller, and the worker's sweeper must expire the booking, free the
 * seat and notify the traveller.
 */
test('an expired hold is released and the traveller is told', async ({ page }) => {
  await registerViaApi(page, 'Expiry');
  await openFlight(page, 4);
  const flightUrl = page.url();
  const { seat, reference } = await holdFirstFreeSeat(page);

  await expireHold(reference);
  await page.reload();
  await expect(page.getByText('This hold has expired')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Choose seats again' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue to passenger details' })).toHaveCount(0);

  // The sweeper runs every 30 s.
  await expect
    .poll(
      () =>
        withDb(async (db) => {
          const { rows } = await db.query<{ status: string }>(
            'SELECT status FROM bookings WHERE reference = $1',
            [reference],
          );
          return rows[0]?.status;
        }),
      { timeout: 60_000, intervals: [2_000] },
    )
    .toBe('EXPIRED');

  // The seat is bookable again…
  await page.goto(flightUrl);
  await expect(
    page.getByRole('button', { name: new RegExp(`^Seat ${seat}, .*\\bavailable`) }),
  ).toBeVisible();

  // …and the traveller has a notification explaining what happened.
  await expect
    .poll(
      async () => {
        await page.goto('/notifications');
        return page
          .getByText('Seat hold expired')
          .waitFor({ timeout: 3_000 })
          .then(
            () => true,
            () => false,
          );
      },
      { timeout: 30_000 },
    )
    .toBe(true);
});
