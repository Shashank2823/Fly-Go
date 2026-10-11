import { passwordProblem } from './password-policy';

describe('passwordProblem', () => {
  const email = 'asha.verma@example.com';

  it.each([
    ['short', /at least 10/],
    ['password123', /too common/],
    ['zzzzzzzzzzzz', /repeated/],
    ['Asha.Verma!2026', /email name/],
    ['x'.repeat(129), /at most 128/],
  ])('rejects %s', (password, reason) => {
    expect(passwordProblem(password, email)).toMatch(reason);
  });

  it('accepts a reasonable passphrase', () => {
    expect(passwordProblem('monsoon-chai-at-dawn', email)).toBeNull();
  });
});
