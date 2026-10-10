import { describe, expect, test } from 'vitest';
import { decodeIdentity, memberships, nativeRequests, nativeSeries, record, seriesIdentity } from './gateway-api.js';

describe('native gateway data boundary', () => {
  test('keeps gateway and authorizer records distinct at the same request ID and timestamp', () => {
    const rows = nativeRequests({
      source: 'loki',
      queriedAt: '',
      data: {
        data: {
          result: ['gateway', 'authorizer'].map((source) => ({
            stream: { aep_source: source },
            values: [['1000000000000000000', '{"request_id":"same","status":"429"}']],
          })),
        },
      },
    });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.key)).size).toBe(2);
    expect(rows.map((row) => row.fields.status)).toEqual(['429', '429']);
  });
  test('preserves native samples and gaps without totals or zero substitution', () => {
    const result = nativeSeries({
      source: 'prometheus',
      queriedAt: '',
      data: {
        data: {
          result: [
            {
              metric: { user_id: 'u', ignored: 1 },
              values: [
                [10, '7.25'],
                [20, 'NaN'],
                [30, '+Inf'],
                [40, ''],
                [50, '0'],
                ['bad', '4'],
              ],
            },
            { metric: { user_id: 'v' }, value: [50, '13'] },
          ],
        },
      },
    });
    expect(result[0]?.points).toEqual([
      { time: 10, value: 7.25 },
      { time: 20, value: null },
      { time: 30, value: null },
      { time: 40, value: null },
      { time: 50, value: 0 },
    ]);
    expect(result[0]?.labels).toEqual({ user_id: 'u' });
    expect(result[1]?.points).toEqual([{ time: 50, value: 13 }]);
    expect(nativeSeries(undefined)).toEqual([]);
    expect(nativeSeries({ source: 'loki', queriedAt: '', data: { data: { result: [{}] } } })[0]?.points).toEqual([]);
    expect(record(null)).toEqual({});
    expect(record([])).toEqual({});
  });
  test('decodes UTF-8 subject identities and keeps unknown labels', () => {
    const encoded = Buffer.from('用户甲').toString('base64url');
    expect(decodeIdentity(encoded)).toBe('用户甲');
    expect(decodeIdentity('!invalid')).toBe('!invalid');
    expect(memberships(`|${encoded}|dGVhbS0x|`)).toEqual(['用户甲', 'team-1']);
    expect(seriesIdentity({ ai_consumer: `aep.ZGVtbw.${encoded}` }, 'user')).toBe('用户甲');
    expect(seriesIdentity({ model_id: 'catalog', ai_model: 'upstream' }, 'model')).toBe('catalog');
    expect(seriesIdentity({ ai_model: 'upstream' }, 'model')).toBe('upstream');
    expect(seriesIdentity({ ai_role: 'role' }, 'role')).toBe('role');
    expect(seriesIdentity({ team_id: Buffer.from('团队甲').toString('base64url') }, 'team')).toBe('团队甲');
    expect(seriesIdentity({ role_id: Buffer.from('角色甲').toString('base64url') }, 'role')).toBe('角色甲');
    expect(seriesIdentity({}, 'team')).toBe('');
  });
  test('reads safe native log lines, rejects malformed rows, and orders nanosecond cursors', () => {
    const result = nativeRequests({
      source: 'loki',
      queriedAt: '',
      data: {
        data: {
          result: [
            {
              stream: { aep_source: 'gateway' },
              values: [
                ['1000000000000000001', '{"request_id":"one","status":"503","input_token":"17","ignored":1}'],
                ['1000000000000000002', '{"request_id":"two","status":"200"}'],
                ['bad', '{'],
                [1, '{}'],
              ],
            },
            { values: [['1000000000000000003', '{}']] },
            {},
          ],
        },
      },
    });
    expect(result.map((row) => row.fields.request_id)).toEqual([undefined, 'two', 'one']);
    expect(result[2]?.fields).toEqual({ request_id: 'one', status: '503', input_token: '17' });
    expect(result[2]?.source).toBe('gateway');
    expect(nativeRequests(undefined)).toEqual([]);
  });
});
