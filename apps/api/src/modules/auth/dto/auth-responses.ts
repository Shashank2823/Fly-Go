import type { Permission } from '../../../common/auth/permissions';

export class MarketDto {
  code!: string;
  currency!: string;
}

export class MeResponse {
  fullName!: string;
  email!: string;
  phone!: string | null;
  nationality!: string;
  roles!: string[];
  permissions!: Permission[];
  market!: MarketDto;
}

export class AuthResponse {
  user!: MeResponse;
  /** New CSRF token bound to the regenerated session. */
  csrfToken!: string;
}

export class CsrfResponse {
  csrfToken!: string;
}
