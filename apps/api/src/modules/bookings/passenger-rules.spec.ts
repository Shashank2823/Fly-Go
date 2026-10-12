import { ageOn, isRealDate, typeForAge } from './passenger-rules';

describe('passenger rules', () => {
  it('computes age on a date, counting birthdays exactly', () => {
    expect(ageOn('2014-10-20', '2026-10-19')).toBe(11);
    expect(ageOn('2014-10-20', '2026-10-20')).toBe(12);
    expect(ageOn('2008-02-29', '2026-02-28')).toBe(17);
  });

  it('maps ages to passenger types', () => {
    expect(typeForAge(0)).toBe('INFANT');
    expect(typeForAge(1)).toBe('INFANT');
    expect(typeForAge(2)).toBe('CHILD');
    expect(typeForAge(11)).toBe('CHILD');
    expect(typeForAge(12)).toBe('ADULT');
  });

  it('rejects impossible calendar dates', () => {
    expect(isRealDate('2026-02-30')).toBe(false);
    expect(isRealDate('2024-02-29')).toBe(true);
  });
});
