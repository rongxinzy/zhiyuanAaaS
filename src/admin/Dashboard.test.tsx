// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { Dashboard } from './Dashboard.js';
import type { PortalUsageStats } from './portal.js';

afterEach(cleanup);

const stats: PortalUsageStats = {
  totals: {
    conversations: 42,
    runs: 120,
    todayConversations: 3,
    todayRuns: 9,
    employees: 5,
    readyEmployees: 4,
  },
  byDepartment: { 'rd-dept': { employees: 2, ready: 2 } },
  threadsByDepartment7d: { 'rd-dept': 12 },
  modelCalls7d: { 'bench-glm': 30 },
} as unknown as PortalUsageStats;

describe('platform dashboard', () => {
  test('renders the usage aggregates from the portal', async () => {
    const portal = { usageStats: vi.fn().mockResolvedValue(stats) };
    render(<Dashboard client={{ getAccessToken: vi.fn() } as never} portal={portal as never} />);

    await waitFor(() => expect(screen.getAllByText('42')).toHaveLength(1));
    expect(portal.usageStats).toHaveBeenCalledTimes(1);
  });

  test('surfaces the portal error inline', async () => {
    const portal = { usageStats: vi.fn().mockRejectedValue(new Error('HTTP 503')) };
    render(<Dashboard client={{ getAccessToken: vi.fn() } as never} portal={portal as never} />);

    expect(await screen.findByText('HTTP 503')).toBeInTheDocument();
  });
});
