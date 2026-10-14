import { isDeclineTestEmail } from './mock-payment.provider';

describe('isDeclineTestEmail', () => {
  it.each([
    ['asha+decline@example.com', true],
    ['ASHA+Decline@example.com', true],
    ['asha+decline+e2e-42@example.com', true],
    ['asha@example.com', false],
    ['asha+declined@example.com', false],
    ['asha@decline.example.com', false],
    ['asha+e2e@example.com', false],
    [null, false],
  ])('%s → %s', (email, expected) => {
    expect(isDeclineTestEmail(email)).toBe(expected);
  });
});
