import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from './api-error';
import { apiRequest, setCsrfToken } from './client';

export interface CurrentUser {
  fullName: string;
  email: string;
  phone: string | null;
  nationality: string;
  roles: string[];
  permissions: string[];
  market: { code: string; currency: string };
}

interface AuthResponse {
  user: CurrentUser;
  csrfToken: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  fullName: string;
  nationality: string;
  phone?: string;
}

export const meQueryKey = ['auth', 'me'] as const;

/** The signed-in user, or null for visitors. Server state — never trusted for authorization. */
export function useCurrentUser() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: async () => {
      try {
        return await apiRequest<CurrentUser>('/auth/me');
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 5 * 60_000,
  });
}

function useSessionMutation<TInput>(path: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) => apiRequest<AuthResponse>(path, { method: 'POST', body: input }),
    onSuccess: ({ user, csrfToken }) => {
      // The session id was regenerated server-side, so the old CSRF token is void.
      setCsrfToken(csrfToken);
      queryClient.setQueryData(meQueryKey, user);
    },
  });
}

export const useLogin = () => useSessionMutation<LoginInput>('/auth/login');
export const useRegister = () => useSessionMutation<RegisterInput>('/auth/register');

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest<void>('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      setCsrfToken(null);
      queryClient.setQueryData(meQueryKey, null);
      // Drop anything user-specific (bookings, notifications) cached for the old session.
      void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
    },
  });
}
