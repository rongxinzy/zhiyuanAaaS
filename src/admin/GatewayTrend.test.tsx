import { expect, test } from 'vitest';
import { gatewayTrendSeries } from './GatewayTrend.js';
import type { GatewayMetricResult } from './gateway-api.js';

test('charts preserve native decimals, zero and missing samples without aggregating label groups', () => {
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
    [100000, 1.75],
    [160000, null],
    [220000, 0],
  ]);
  expect(series[1]?.data).toEqual([
    [100000, 9],
    [160000, null],
    [220000, 12],
  ]);
  expect(series.every((item) => item.connectNulls === false && item.smooth === false)).toBe(true);
});

test('unavailable native results never become a fabricated zero series', () => {
  expect(gatewayTrendSeries([{ name: 'Calls', result: undefined, color: 'currentColor' }])).toEqual([]);
});
