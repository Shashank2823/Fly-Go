/** A small blocklist of the most common passwords that meet the length rule. */
const COMMON_PASSWORDS = new Set([
  '1234567890',
  '12345678910',
  '0123456789',
  'qwertyuiop',
  'password1',
  'password12',
  'password123',
  'password1234',
  'passw0rd123',
  'iloveyou123',
  'qwerty12345',
  'qwerty123456',
  'abcdefghij',
  'abc1234567',
  '1q2w3e4r5t',
  '1qaz2wsx3edc',
  'aaaaaaaaaa',
  'welcome123',
  'letmein123',
  'football123',
  'sunshine123',
  'admin12345',
  'administrator',
  'changeme123',
  'flygo12345',
  'flygopassword',
]);

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

/** Returns a user-facing reason when the password is unacceptable, otherwise null. */
export function passwordProblem(password: string, email: string): string | null {
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters`;
  if (password.length > PASSWORD_MAX) return `Password must be at most ${PASSWORD_MAX} characters`;
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return 'This password is too common';
  if (/^(.)\1+$/.test(password)) return 'Password cannot be a single repeated character';
  const local = email.split('@')[0]?.toLowerCase() ?? '';
  if (local.length >= 4 && lower.includes(local))
    return 'Password must not contain your email name';
  return null;
}
