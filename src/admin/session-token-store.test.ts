// @vitest-environment jsdom
import type { AepTokens } from '@aep/sdk-node';
import { afterEach, describe, expect, test } from 'vitest';

import { SessionTokenStore } from './client.js';

// `SessionTokenStore` is localStorage-backed so a page refresh restores the
// session. The tests must therefore run against a real `window.localStorage`
// (jsdom) and assert across *separate instances*, which is the only way the
// persistence contract can actually fail: a same-instance read would be
// served by the in-memory fast path regardless of whether anything was
// stored.
describe('Admin Console session token storage', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  test('persists tokens so a fresh instance restores the session', async () => {
    const store = new SessionTokenStore();

    await store.set(tokens());

    // A new instance has an empty memory store; it can only return tokens by
    // reading them back from localStorage.
    await expect(new SessionTokenStore().get()).resolves.toEqual(tokens());
  });

  test('clear removes the persisted session for future instances', async () => {
    const store = new SessionTokenStore();

    await store.set(tokens());
    await expect(new SessionTokenStore().get()).resolves.toEqual(tokens());

    await store.clear();
    await expect(new SessionTokenStore().get()).resolves.toBeNull();
  });
});

function tokens(): AepTokens {
  return {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    modelAccessToken: 'model-access-token',
    tokenType: 'Bearer',
    expiresIn: 900,
    modelAccessExpiresIn: 300,
    passwordChangeRequired: false,
  };
}
