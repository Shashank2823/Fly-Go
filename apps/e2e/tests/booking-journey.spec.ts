import { expect, test } from '@playwright/test';
import {
  completePaymentButton,
  fillPassengerAndContinue,
  holdFirstFreeSeat,
  istDate,
  PASSWORD,
  uniqueEmail,
} from '../support/flows';
import { deleteEmails, waitForEmail } from '../support/mailpit';

test('register → search → seat → pay → e-ticket, notifications and email', async ({ page }) => {
  // Register through the real form.
  const email = uniqueEmail('journey');
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Asha Verma');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Nationality').selectOption('IN');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/$/);

  // Search from the home page.
  await page.getByLabel('From').fill('DEL');
  await page.getByRole('option', { name: /DEL/ }).first().click();
  await page.getByLabel('To').fill('BOM');
  await page.getByRole('option', { name: /BOM/ }).first().click();
  await page.getByLabel('Depart').fill(istDate(2));
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(/\/flights\?.*from=DEL.*to=BOM/);

  // Pick a flight and hold a seat.
  await page.getByRole('button', { name: 'Select seats' }).first().click();
  const { seat, reference } = await holdFirstFreeSeat(page);
  await expect(page.getByText(seat, { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel(/minutes \d+ seconds remaining/)).toBeVisible();
  await expect(page).toHaveTitle(`Seat hold ${reference} · FlyGo`);

  // Passenger details → checkout → pay.
  await fillPassengerAndContinue(page, { email });
  await completePaymentButton(page).click();
  await expect(page.getByText('Processing your payment…')).toBeVisible();

  // The worker settles the payment, confirms the booking and issues the ticket.
  await expect(page).toHaveURL(new RegExp(`/bookings/${reference}\\?confirmed=1`), {
    timeout: 30_000,
  });
  await expect(page.getByRole('heading', { name: 'Booking confirmed!' })).toBeVisible();
  await expect(page).toHaveTitle(`Booking ${reference} · FlyGo`);
  const view = page.getByRole('link', { name: 'View ticket' });
  await expect(view).toBeVisible({ timeout: 30_000 });

  // The PDF is served to its owner.
  const pdf = await page.request.get((await view.getAttribute('href'))!);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toBe('application/pdf');
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Download PDF' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(new RegExp(`${reference}.*\\.pdf$`));

  // In-app notifications (the bell polls every 30 s; a reload fetches immediately).
  await expect
    .poll(
      async () => {
        await page.reload();
        return page
          .getByRole('button', { name: 'Notifications, 2 unread' })
          .waitFor({ timeout: 3_000 })
          .then(
            () => true,
            () => false,
          );
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Notifications, 2 unread' }).click();
  const panel = page.getByRole('dialog', { name: 'Notifications' });
  await expect(panel.getByText('Booking confirmed')).toBeVisible();
  await expect(panel.getByText('E-ticket ready')).toBeVisible();

  // Confirmation email, delivered to Mailpit.
  const mail = await waitForEmail(email, `Booking confirmed · DEL → BOM · ${reference}`);
  expect(mail.text).toContain(reference);
  await deleteEmails([mail.id]);

  // My trips lists the booking.
  await page.goto('/bookings');
  await expect(page.getByText(reference)).toBeVisible();
});

test('signed-in pages send guests to sign in and back', async ({ page }) => {
  await page.goto('/bookings');
  await expect(page).toHaveURL(/\/login\?next=%2Fbookings/);
  await expect(page).toHaveTitle('Sign in · FlyGo');
});
