import { describe, expect, test } from 'vitest';
import { parsePublication } from './publication-contract.js';

const fixture = () => ({
  operationId: '11111111-1111-4111-8111-111111111111',
  deploymentId: 'demo',
  revision: 'r1',
  contentHash: 'a'.repeat(64),
  phase: 'projected',
  createdAt: '2026-10-15T00:00:00Z',
  updatedAt: '2026-10-15T00:00:01Z',
  idempotencyExpiresAt: '2026-10-16T00:00:00Z',
  errorCode: null,
  conditions: ['Accepted', 'Applied', 'Ready'].map((type) => ({
    type,
    status: 'Unknown',
    observedRevision: null,
    reason: 'DataPlaneNotObserved',
    lastTransitionTime: '2026-10-15T00:00:01Z',
  })),
});
describe('publication contract boundary', () => {
  test('keeps delivery and observations independent and drops uncontracted response fields', () => {
    const input = { ...fixture(), extra: 'not for the UI' };
    expect(parsePublication(input)).toEqual(fixture());
    expect(parsePublication(input).conditions.every((c) => c.status === 'Unknown')).toBe(true);
  });
  test.each([
    null,
    {},
    { ...fixture(), operationId: 'bad' },
    { ...fixture(), phase: 'ready' },
    { ...fixture(), contentHash: 'bad' },
    { ...fixture(), updatedAt: 'bad' },
    { ...fixture(), conditions: [] },
    { ...fixture(), errorCode: 2 },
    { ...fixture(), revision: '' },
    { ...fixture(), conditions: [fixture().conditions[0], fixture().conditions[0], fixture().conditions[2]] },
    { ...fixture(), conditions: fixture().conditions.map((c) => ({ ...c, status: 'True', observedRevision: 'old' })) },
    { ...fixture(), conditions: fixture().conditions.map((c) => ({ ...c, status: 'True', observedRevision: null })) },
    { ...fixture(), conditions: fixture().conditions.map((c) => ({ ...c, reason: 'raw unsafe output!' })) },
  ])('rejects invalid, stale or incomplete observations %#', (input) => {
    expect(() => parsePublication(input)).toThrow('Invalid AEP publication response.');
  });
  test('accepts confirmed observations only for the matching version', () => {
    const input = {
      ...fixture(),
      conditions: fixture().conditions.map((c) => ({ ...c, status: 'True', observedRevision: 'r1' })),
    };
    expect(parsePublication(input).conditions[0]?.status).toBe('True');
  });
});
