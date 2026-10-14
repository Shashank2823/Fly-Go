import { expect, test } from '@playwright/test';
import { paymentsFor } from '../support/db';
import {
  completePaymentButton,
  fillPassengerAndContinue,
  holdFirstFreeSeat,
  openFlight,
  registerViaApi,
  uniqueEmail,
} from '../support/flows';
import { deleteEmails, waitForEmail } from '../support/mailpit';

/**
 * The mock gateway declines payments whose booking contact email has "+decline" in it
 * (a test trigger like Stripe's decline cards). The traveller is told they weren't charged,
 * keeps their seats, and can pay again — and a double-click never creates two payments.
 */
test('declined payment can be retried; double-click pays once', async ({ page }) => {
  await registerViaApi(page, 'Decline');
  await openFlight(page, 3);
  const { reference } = await holdFirstFreeSeat(page);

  await fillPassengerAndContinue(page, { email: 'asha+decline@example.com' });
  await completePaymentButton(page).click();
  await expect(
    page.getByText('Your payment was declined. You have not been charged — please try again.'),
  ).toBeVisible({ timeout: 30_000 });
  await expect(completePaymentButton(page)).toBeEnabled();
  expect(await paymentsFor(reference)).toEqual(['FAILED']);

  // Use different contact details, then pay again with an impatient double-click.
  await page.goto(`/book/${reference}`);
  const contactEmail = uniqueEmail('decline-retry');
  await fillPassengerAndContinue(page, { email: contactEmail });
  await completePaymentButton(page).dblclick();

  await expect(page).toHaveURL(new RegExp(`/bookings/${reference}\\?confirmed=1`), {
    timeout: 30_000,
  });
  await expect(page.getByRole('heading', { name: 'Booking confirmed!' })).toBeVisible();
  expect(await paymentsFor(reference)).toEqual(['FAILED', 'SUCCEEDED']);

  // The confirmation goes to the updated contact address.
  const mail = await waitForEmail(contactEmail, reference);
  await deleteEmails([mail.id]);
});
