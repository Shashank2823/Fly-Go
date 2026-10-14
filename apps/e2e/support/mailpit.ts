import { expect } from '@playwright/test';
import { MAILPIT_URL } from './env';

interface MailpitSummary {
  ID: string;
  Subject: string;
  To: { Address: string }[];
}

/** Waits until Mailpit has received a message for `to` whose subject contains `subject`. */
export async function waitForEmail(
  to: string,
  subject: string,
): Promise<{ id: string; text: string }> {
  let found: MailpitSummary | undefined;
  await expect
    .poll(
      async () => {
        const res = await fetch(
          `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
        );
        const body = (await res.json()) as { messages: MailpitSummary[] };
        found = body.messages.find((m) => m.Subject.includes(subject));
        return !!found;
      },
      { timeout: 45_000, message: `email "${subject}" to ${to}` },
    )
    .toBe(true);
  const msg = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${found!.ID}`)).json()) as {
    Text: string;
  };
  return { id: found!.ID, text: msg.Text };
}

/** Removes this run's messages so the shared Mailpit inbox doesn't fill up with test mail. */
export async function deleteEmails(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await fetch(`${MAILPIT_URL}/api/v1/messages`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ IDs: ids }),
  });
}
