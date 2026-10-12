import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/api-error';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Retry transient failures only; 4xx responses are definitive.
      retry: (count, error) =>
        count < 2 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
    },
  },
});

// Development-only debugging aid: inspect server state from the browser console.
if (import.meta.env.DEV)
  (globalThis as { __flygoQueryClient?: QueryClient }).__flygoQueryClient = queryClient;
