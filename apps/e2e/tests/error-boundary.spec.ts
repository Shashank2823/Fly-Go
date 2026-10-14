import { expect, test } from '@playwright/test';
import { istDate } from '../support/flows';

/**
 * A page that crashes while rendering (here: the search API returns a malformed body) shows a
 * friendly error screen inside the normal layout — the header and navigation keep working.
 */
test('a crashing page shows the error screen and the app stays usable', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.route('**/api/v1/flights?**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );

  await page.goto(`/flights?from=DEL&to=BOM&date=${istDate(2)}&adults=1`);
  await expect(page.getByRole('heading', { name: 'Something went wrong' })).toBeVisible();
  await expect(page).toHaveTitle('Something went wrong · FlyGo');
  expect(errors.some((e) => e.includes('Unhandled route error'))).toBe(true);

  // Navigation still works without a reload.
  await page.unroute('**/api/v1/flights?**');
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Flights' })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeVisible();
});
