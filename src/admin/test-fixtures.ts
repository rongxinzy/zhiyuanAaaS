import { vi } from 'vitest';
import type { AdminConsoleClient, AdminIdentity } from './client.js';
import type { PortalClient, PortalMe } from './portal.js';

export const administratorIdentity: AdminIdentity = {
  user: { id: 'admin-1', displayName: '管理员' },
  deployment: { id: 'demo', name: '演示部署' },
  deploymentId: 'demo',
  enterprise: { id: 'demo', name: '演示部署' },
  roles: ['admin'],
  permissions: [],
  sessionExpiresAt: '2026-09-04T00:00:00Z',
  passwordChangeRequired: false,
};

// --- Workbench (employee-facing) fixtures ---

export const workbenchIdentity: AdminIdentity = {
  ...administratorIdentity,
  user: { id: 'user-1', displayName: '张三' },
  roles: [],
};

export const workbenchMe: PortalMe = {
  user: { id: 'user-1', displayName: '张三', kind: 'human' },
  teams: [{ id: 'sales-dept', name: '销售团队' }],
  quota: { limit: 2, used: 0, owned: 0, pending: 0 },
  policyMode: 'approval',
  defaultModel: 'bench-glm',
};

// Structural stub of the portal client's workbench surface; every method is
// a vi.fn so tests assert calls and override per case.
export function workbenchPortal(overrides: Record<string, unknown> = {}): PortalClient {
  return {
    me: vi.fn().mockResolvedValue(workbenchMe),
    listEmployees: vi.fn().mockResolvedValue([]),
    myRequests: vi.fn().mockResolvedValue([]),
    getRequest: vi.fn(),
    apply: vi.fn(),
    mintChatSession: vi.fn().mockResolvedValue(true),
    mintPortalSession: vi.fn().mockResolvedValue(200),
    ...overrides,
  } as unknown as PortalClient;
}

export function workbenchClient(): AdminConsoleClient {
  return { getAccessToken: vi.fn().mockResolvedValue('aep-token') } as unknown as AdminConsoleClient;
}
