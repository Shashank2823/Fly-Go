import { expect, test } from '@playwright/test';
import { availableSeats, openFlight, registerViaApi } from '../support/flows';

/** Two travellers click "Hold" on the same seat at the same moment: exactly one gets it. */
test('two travellers racing for one seat — one wins, the other is told', async ({ browser }) => {
  const [ctxA, ctxB] = await Promise.all([browser.newContext(), browser.newContext()]);
  const [a, b] = await Promise.all([ctxA.newPage(), ctxB.newPage()]);
  try {
    await registerViaApi(a, 'RacerA');
    await registerViaApi(b, 'RacerB');
    await openFlight(a, 5);
    await b.goto(a.url());

    const label = (await availableSeats(a).first().getAttribute('aria-label'))!;
    const seat = /^Seat (\w+)/.exec(label)![1]!;
    const seatButton = new RegExp(`^Seat ${seat}, `);
    await a.getByRole('button', { name: seatButton }).click();
    await b.getByRole('button', { name: seatButton }).click();

    await Promise.all([
      a.getByRole('button', { name: 'Hold seats & continue' }).first().click(),
      b.getByRole('button', { name: 'Hold seats & continue' }).first().click(),
    ]);

    const outcome = async (p: typeof a) => {
      const won = p.waitForURL(/\/book\/[A-Z0-9]{6}$/, { timeout: 20_000 }).then(() => 'won');
      const lost = p
        .getByText(`Sorry — ${seat} was just taken by another traveller. Please pick again.`)
        .first()
        .waitFor({ timeout: 20_000 })
        .then(() => 'lost');
      return Promise.any([won, lost]);
    };
    const results = await Promise.all([outcome(a), outcome(b)]);
    expect([...results].sort()).toEqual(['lost', 'won']);

    // The loser's seat map now shows the seat as taken.
    const loser = results[0] === 'lost' ? a : b;
    await expect(
      loser.getByRole('button', { name: new RegExp(`^Seat ${seat}, .*temporarily held`) }),
    ).toBeVisible();
  } finally {
    await Promise.all([ctxA.close(), ctxB.close()]);
  }
});
