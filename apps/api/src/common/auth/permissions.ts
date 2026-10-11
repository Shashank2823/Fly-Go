/**
 * Role → permission mapping (docs §8.3). Roles are stored in PostgreSQL and never accepted
 * from a request; permissions are code constants so guards stay stable when the admin UI
 * later introduces a role/permission table.
 */
export const RoleCode = {
  User: 'USER',
  Support: 'SUPPORT',
  Admin: 'ADMIN',
} as const;
export type RoleCode = (typeof RoleCode)[keyof typeof RoleCode];

/** Stable IDs matching prisma/seed/roles.ts. */
export const ROLE_IDS: Record<RoleCode, number> = { USER: 1, SUPPORT: 2, ADMIN: 3 };

export const Permission = {
  BookingReadOwn: 'booking:read:own',
  BookingReadAny: 'booking:read:any',
  BookingCancelAny: 'booking:cancel:any',
  TicketReadOwn: 'ticket:read:own',
  TicketReadAny: 'ticket:read:any',
  FlightManage: 'flight:manage',
  InventoryManage: 'inventory:manage',
  UserReadAny: 'user:read:any',
  AuditRead: 'audit:read',
  QueueInspect: 'queue:inspect',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

const USER_PERMISSIONS: Permission[] = [Permission.BookingReadOwn, Permission.TicketReadOwn];

const ROLE_PERMISSIONS: Record<RoleCode, Permission[]> = {
  USER: USER_PERMISSIONS,
  SUPPORT: [
    ...USER_PERMISSIONS,
    Permission.BookingReadAny,
    Permission.TicketReadAny,
    Permission.UserReadAny,
  ],
  ADMIN: Object.values(Permission),
};

export function permissionsFor(roles: readonly string[]): Permission[] {
  const set = new Set<Permission>();
  for (const role of roles) {
    for (const p of ROLE_PERMISSIONS[role as RoleCode] ?? []) set.add(p);
  }
  return [...set].sort();
}
