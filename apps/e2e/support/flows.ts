import { expect, type Page } from '@playwright/test';
import { WEB_URL } from './env';

export const PASSWORD = 'monsoon-chai-at-dawn';

/** A unique, recognisable address for this run (the domain never receives mail — Mailpit does). */
export const uniqueEmail = (tag: string) =>
  `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;

/** YYYY-MM-DD in India, `days` from today — matches how the app interprets search dates. */
export function istDate(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
}

/** Registers through the API (same session cookie as the page). Used where the UI form isn't under test. */
export async function registerViaApi(page: Page, name: string): Promise<string> {
  const email = uniqueEmail(name.toLowerCase());
  const csrf = await page.request.get('/api/v1/auth/csrf');
  const { csrfToken } = (await csrf.json()) as { csrfToken: string };
  const res = await page.request.post('/api/v1/auth/register', {
    headers: { 'X-CSRF-Token': csrfToken, Origin: WEB_URL },
    data: { fullName: `${name} Verma`, email, password: PASSWORD, nationality: 'IN' },
  });
  expect(res.status(), await res.text()).toBe(201);
  return email;
}

/** Opens DEL → BOM results for `days` ahead and picks the `nth` flight (0-based). */
export async function openFlight(page: Page, days: number, nth = 0): Promise<void> {
  await page.goto(`/flights?from=DEL&to=BOM&date=${istDate(days)}&adults=1`);
  const select = page.getByRole('button', { name: 'Select seats' });
  await expect(select.first()).toBeVisible();
  await select.nth(nth).click();
  await expect(page).toHaveURL(/\/flights\/[^/]+\/seats/);
}

/** Matches seat buttons in the "available" state (not "unavailable", "held", …). */
export const availableSeats = (page: Page) =>
  page
    .getByRole('button', { name: /^Seat \w+, .*\bavailable(,|$)/ })
    .and(page.locator('[aria-disabled="false"]'));

/** Selects the first free seat and holds it. Returns the seat label and booking reference. */
export async function holdFirstFreeSeat(page: Page): Promise<{ seat: string; reference: string }> {
  const seatButton = availableSeats(page).first();
  const label = (await seatButton.getAttribute('aria-label'))!;
  const seat = /^Seat (\w+)/.exec(label)![1]!;
  await seatButton.click();
  await page.getByRole('button', { name: 'Hold seats & continue' }).first().click();
  await expect(page).toHaveURL(/\/book\/[A-Z0-9]{6}$/);
  const reference = /\/book\/([A-Z0-9]{6})$/.exec(page.url())![1]!;
  return { seat, reference };
}

/** Fills the single adult passenger + contact form and continues to checkout. */
export async function fillPassengerAndContinue(
  page: Page,
  opts: { email: string; firstName?: string },
): Promise<void> {
  await page.getByRole('link', { name: 'Continue to passenger details' }).click();
  await expect(page.getByRole('heading', { name: 'Who’s travelling?' })).toBeVisible();
  await page.getByLabel('First name(s)').fill(opts.firstName ?? 'Asha');
  await page.getByLabel('Last name').fill('Verma');
  await page.getByLabel('Date of birth').fill('1994-05-17');
  await page.getByLabel('Nationality').selectOption('IN');
  await page.getByLabel('Email').fill(opts.email);
  await page.getByLabel('Mobile number').fill('+919876543210');
  await page.getByRole('button', { name: 'Continue to checkout' }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByRole('heading', { name: 'Review and pay' })).toBeVisible();
}

export const completePaymentButton = (page: Page) =>
  page.getByRole('button', { name: /Complete payment/ });
