import type { AepTokens } from '@aep/sdk-node';
import { describe, expect, test } from 'vitest';

import {SessionTokenStore} from './client.js';

describe('Admin Console session token storage', () => {
  test('keeps tokens only in the current in-memory store', async () => {
    const store = new SessionTokenStore();
    const sessionStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get: () => {
        throw new Error('persistent browser storage must not be accessed');
      },
    });

    try {
      await store.set(tokens());
      await expect(store.get()).resolves.toMatchObject({refreshToken: 'refresh-token'});
      await expect(new SessionTokenStore().get()).resolves.toBeNull();
      await store.clear();
      await expect(store.get()).resolves.toBeNull();
    } finally {
      if (sessionStorage) Object.defineProperty(globalThis, 'sessionStorage', sessionStorage);
      else delete (globalThis as {sessionStorage?: Storage}).sessionStorage;
    }
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
