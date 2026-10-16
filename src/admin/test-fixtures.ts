import type { AdminIdentity } from './client.js';

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
