import { expect, test } from 'vitest';
import { gatewayTrendSeries } from './GatewayTrend.js';
import type { GatewayMetricResult } from './gateway-api.js';
import { formatGatewayNumber } from './gateway-ui.js';

test('charts floor display samples without changing source payloads, gaps or label groups', () => {
  const result: GatewayMetricResult = {
    source: 'prometheus',
    queriedAt: '',
    definition: {
      id: 'input_tokens',
      unit: 'tokens',
      aggregation: 'counter_increase',
      windowSeconds: 60,
      groupBy: 'user',
      modelDimension: 'not_applicable',
    },
    data: {
      data: {
        result: [
          {
            metric: { user_id: 'a' },
            values: [
              [100, '1.75'],
              [160, 'NaN'],
              [220, '0'],
            ],
          },
          {
            metric: { user_id: 'b' },
            values: [
              [100, '9'],
              [160, 'Infinity'],
              [220, '12'],
            ],
          },
        ],
      },
    },
  };
  const series = gatewayTrendSeries([{ name: 'Tokens', result, color: 'currentColor' }]);
  expect(series).toHaveLength(2);
  expect(series[0]?.data).toEqual([
    [100000, 1],
    [160000, null],
    [220000, 0],
  ]);
  expect(series[1]?.data).toEqual([
    [100000, 9],
    [160000, null],
    [220000, 12],
  ]);
  expect(series.every((item) => item.connectNulls === false && item.smooth === false)).toBe(true);
  expect((result.data.data as { result: { values: unknown[][] }[] }).result[0]?.values[0]?.[1]).toBe('1.75');
});

test.each([
  [1234.999, '1,234'],
  [1.75, '1'],
  [0.99, '0'],
  [-1.25, '-2'],
  [0, '0'],
  [null, '未提供'],
  [undefined, '未提供'],
  [Number.NaN, '未提供'],
  [Number.POSITIVE_INFINITY, '未提供'],
])('gateway display floors %s to %s', (value, expected) => {
  expect(formatGatewayNumber(value)).toBe(expected);
});

test('unavailable native results never become a fabricated zero series', () => {
  expect(gatewayTrendSeries([{ name: 'Calls', result: undefined, color: 'currentColor' }])).toEqual([]);
});
