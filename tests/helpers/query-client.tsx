import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

import { createAdminQueryClient } from '../../src/admin/query-client.js';

// Every render gets an isolated QueryClient so cached data never leaks
// between tests.
export function withQueryClient(ui: ReactNode, queryClient = createAdminQueryClient()): ReactElement {
  return <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>;
}

export function renderWithQueryClient(ui: ReactElement) {
  const queryClient = createAdminQueryClient();
  return {
    queryClient,
    ...render(withQueryClient(ui, queryClient)),
  };
}
