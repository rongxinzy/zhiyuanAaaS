import { describe, expect, test } from 'vitest';

import { AdminConsoleClient, AdminPermission, hasAdminConsoleAccess, hasAdminPermission, hasAnyAdminConsoleAccess, type AdminIdentity } from './client.js';

const fullPermissions = [
  'users.read', 'users.write', 'roles.read', 'roles.write', 'teams.read', 'teams.write',
  'skills.read', 'skills.write', 'skills.assign', 'models.read', 'models.write', 'models.assign',
  'credentials.read', 'credentials.write', 'credentials.assign', 'licenses.read', 'licenses.write', 'licenses.revoke',
  'sessions.write', 'events.read', 'events.write', 'data_plane.write',
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

  test('allows a partial permission set into its readable console surface', () => {
    const partial = identity({ roles: ['model-reader'], permissions: ['models.read'] });
    expect(hasAnyAdminConsoleAccess(partial)).toBe(true);
    expect(hasAdminConsoleAccess(partial)).toBe(false);
  });

  test('rejects an identity without any management permission', () => {
    expect(hasAnyAdminConsoleAccess(identity({ roles: ['member'], permissions: [] }))).toBe(false);
  });

  test('fails closed when no validated identity is available', () => {
    expect(hasAdminPermission(undefined, AdminPermission.UsersRead)).toBe(false);
  });

  test('does not replace the host Web Crypto object when randomUUID is unavailable', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    const cryptoWithoutRandomUUID = {getRandomValues: (value: Uint8Array) => value};
    try {
      Object.defineProperty(globalThis, 'crypto', {configurable: true, value: cryptoWithoutRandomUUID});
      new AdminConsoleClient();
      expect(globalThis.crypto).toBe(cryptoWithoutRandomUUID);
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
      else Reflect.deleteProperty(globalThis, 'crypto');
    }
  });
});
