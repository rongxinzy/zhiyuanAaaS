import { describe, expect, test } from 'vitest';

import { runBatch } from './batch.js';

describe('admin batch mutations', () => {
  test('preserves successful and failed item outcomes', async () => {
    const results = await runBatch(['user:u1', 'user:u2'], async item => {
      if (item.endsWith('u2')) throw new Error('already assigned');
    });

    expect(results).toEqual([
      { item: 'user:u1', ok: true },
      { item: 'user:u2', ok: false, error: expect.any(Error) },
    ]);
  });
});
