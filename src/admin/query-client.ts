import { QueryClient } from '@tanstack/react-query';

// Behaviour-preserving defaults: the hand-rolled effects TanStack Query
// replaces had no retries and no window-focus refetch, so both stay off.
// Individual queries opt in where the old code polled (refetchInterval).
export function createAdminQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  });
}
