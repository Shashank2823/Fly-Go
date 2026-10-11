import { Permission, permissionsFor } from './permissions';

describe('permissionsFor', () => {
  it('gives customers access to their own bookings and tickets only', () => {
    expect(permissionsFor(['USER'])).toEqual([Permission.BookingReadOwn, Permission.TicketReadOwn]);
  });

  it('never grants admin permissions to a regular user', () => {
    const perms = permissionsFor(['USER']);
    expect(perms).not.toContain(Permission.BookingReadAny);
    expect(perms).not.toContain(Permission.FlightManage);
  });

  it('gives admins every permission', () => {
    expect(permissionsFor(['ADMIN'])).toEqual(Object.values(Permission).sort());
  });

  it('merges permissions from multiple roles without duplicates', () => {
    const perms = permissionsFor(['USER', 'SUPPORT']);
    expect(new Set(perms).size).toBe(perms.length);
    expect(perms).toContain(Permission.BookingReadAny);
  });

  it('ignores unknown role codes', () => {
    expect(permissionsFor(['ROOT'])).toEqual([]);
  });
});
