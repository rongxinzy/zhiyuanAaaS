import { describe, expect, test } from 'vitest';

import { hasAdminConsoleAccess, type AdminIdentity } from './client.js';

const fullPermissions = [
  'users.read', 'users.write', 'roles.read', 'roles.write', 'teams.read', 'teams.write',
  'skills.read', 'skills.write', 'skills.assign', 'models.read', 'models.write', 'models.assign',
  'credentials.read', 'credentials.write', 'credentials.assign', 'licenses.read', 'licenses.revoke',
  'events.read', 'events.write', 'data_plane.write',
];

function identity(overrides: Partial<AdminIdentity> = {}): AdminIdentity {
  return {
    user: { id: 'u1', displayName: '管理员' },
    deployment: { id: 'demo', name: '演示部署' },
    deploymentId: 'demo',
    enterprise: { id: 'demo', name: '演示部署' },
    roles: [],
    permissions: [],
    sessionExpiresAt: '2026-09-04T00:00:00Z',
    passwordChangeRequired: false,
    ...overrides,
  };
}

describe('admin console access', () => {
  test('accepts the bootstrap administrator role', () => {
    expect(hasAdminConsoleAccess(identity({ roles: ['admin'] }))).toBe(true);
  });

  test('accepts a custom role with the complete console permission set', () => {
    expect(hasAdminConsoleAccess(identity({ roles: ['operations-admin'], permissions: fullPermissions }))).toBe(true);
  });

  test('rejects a partial permission set instead of showing a broken full console', () => {
    expect(hasAdminConsoleAccess(identity({ roles: ['operations-admin'], permissions: fullPermissions.slice(0, -1) }))).toBe(false);
  });
});
