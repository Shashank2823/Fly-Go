import type { Permission } from './permissions';

/** The caller as resolved by SessionAuthGuard from PostgreSQL on every request. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  nationality: string;
  roles: string[];
  permissions: Permission[];
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthenticatedUser;
  }
}

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    sessionVersion?: number;
    /** epoch ms of login; enforces the absolute session lifetime. */
    authenticatedAt?: number;
    csrfToken?: string;
  }
}
