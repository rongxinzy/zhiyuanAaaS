/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ConfigProvider, theme } from 'antd';
import { type ECharts, getInstanceByDom } from 'echarts/core';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { GatewayTokenTrend, GatewayTrend } from './GatewayTrend.js';
import type { GatewayMetricResult } from './gateway-api.js';

let width: number;
let observers: LayoutObserver[];
class LayoutObserver implements ResizeObserver {
  readonly observe = vi.fn();
  readonly unobserve = vi.fn();
  readonly disconnect = vi.fn();
  constructor(readonly callback: ResizeObserverCallback) {
    observers.push(this);
  }
}
beforeEach(() => {
  width = 600;
  observers = [];
  // jsdom has no layout or canvas. Only provide dimensions to chart containers;
  // ECharts still renders real SVG and uses its built-in text measurement fallback.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('gateway-native-chart') ? width : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('gateway-native-chart') ? 288 : 0;
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.stubGlobal('ResizeObserver', LayoutObserver);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const window = { start: new Date(100000).toISOString(), end: new Date(400000).toISOString() };
function metric(id: string, values = ['1.75', 'NaN', '0']): GatewayMetricResult {
  return {
    source: 'prometheus',
    queriedAt: '',
    definition: {
      id,
      unit: 'tokens',
      aggregation: 'counter_increase',
      windowSeconds: 60,
      groupBy: 'none',
      modelDimension: 'not_applicable',
    },
    data: { data: { result: [{ metric: {}, values: values.map((value, index) => [100 + index * 60, value]) }] } },
  };
}
function chartFor(title: string): ECharts {
  const element = screen.getByRole('img', { name: title });
  const chart = getInstanceByDom(element);
  if (!chart) throw new Error(`Chart was not initialized: ${title}`);
  expect(element.querySelector('svg')).not.toBeNull();
  return chart;
}
function series(chart: ECharts) {
  return chart.getOption().series as { name: string; data: [number, number | null][] }[];
}
function zoom(chart: ECharts) {
  return (chart.getOption().dataZoom as { start: number; end: number }[])[0];
}

test('real charts link zoom, retain it across filters and reset it for a new query window', () => {
  const calls = metric('calls');
  const failures = metric('failures', ['0', '1', '0']);
  const view = (range = window) => (
    <ConfigProvider>
      <GatewayTrend calls={calls} failures={failures} group="linked-test" window={range} />
      <GatewayTokenTrend input={calls} output={failures} group="linked-test" window={range} />
    </ConfigProvider>
  );
  const result = render(view());
  const original = chartFor('调用与失败趋势');
  const tokens = chartFor('Token 用量趋势');
  expect(series(original)[0]?.data).toEqual([
    [100000, 1.75],
    [160000, null],
    [220000, 0],
  ]);
  expect(screen.getByRole('radio', { name: '成功' })).toBeDisabled();
  act(() => original.dispatchAction({ type: 'dataZoom', start: 20, end: 70 }));
  expect(zoom(tokens)).toMatchObject({ start: 20, end: 70 });
  fireEvent.click(screen.getByRole('radio', { name: '失败次数' }));
  expect(original.isDisposed()).toBe(true);
  const filtered = chartFor('调用与失败趋势');
  expect(series(filtered).map((item) => item.name)).toEqual(['失败次数']);
  expect(zoom(filtered)).toMatchObject({ start: 20, end: 70 });
  expect(zoom(tokens)).toMatchObject({ start: 20, end: 70 });
  result.rerender(view({ ...window, end: new Date(460000).toISOString() }));
  expect(zoom(chartFor('调用与失败趋势'))).toMatchObject({ start: 0, end: 100 });
  const finalTokens = chartFor('Token 用量趋势');
  expect(zoom(finalTokens)).toMatchObject({ start: 0, end: 100 });
  const finalElement = finalTokens.getDom();
  result.unmount();
  expect(finalTokens.isDisposed()).toBe(true);
  expect(getInstanceByDom(finalElement)).toBeUndefined();
  expect(observers.every((observer) => observer.disconnect.mock.calls.length === 1)).toBe(true);
});

test('Token visibility changes native series and an empty selection does not forge zeros', () => {
  const result = render(
    <GatewayTokenTrend
      input={metric('input_tokens')}
      output={metric('output_tokens')}
      group="token-test"
      window={window}
    />,
  );
  const original = chartFor('Token 用量趋势');
  expect(series(original)).toHaveLength(2);
  fireEvent.click(screen.getByRole('checkbox', { name: '输入 Token' }));
  expect(series(chartFor('Token 用量趋势')).map((item) => item.name)).toEqual(['输出 Token']);
  fireEvent.click(screen.getByRole('checkbox', { name: '输出 Token' }));
  expect(screen.queryByRole('img', { name: 'Token 用量趋势' })).not.toBeInTheDocument();
  expect(screen.getByText('当前查询没有原生数据')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: '输入 Token' }));
  expect(series(chartFor('Token 用量趋势'))[0]?.data).toEqual([
    [100000, 1.75],
    [160000, null],
    [220000, 0],
  ]);
  result.unmount();
});

test('hidden charts initialize on resize, use native tooltips and follow theme changes without losing zoom', () => {
  width = 0;
  const calls = metric('calls');
  const view = (dark: boolean) => (
    <ConfigProvider theme={{ algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm }}>
      <GatewayTrend calls={calls} group="resize-test" window={window} />
    </ConfigProvider>
  );
  const result = render(view(false));
  const element = screen.getByRole('img', { name: '调用与失败趋势' });
  expect(getInstanceByDom(element)).toBeUndefined();
  act(() => {
    width = 600;
    for (const observer of observers) observer.callback([], observer);
  });
  const original = chartFor('调用与失败趋势');
  const options = original.getOption();
  const tooltip = (
    options.tooltip as { valueFormatter: (value: unknown) => string; axisPointer: { type: string } }[]
  )[0]!;
  expect(tooltip.axisPointer.type).toBe('line');
  expect(tooltip.valueFormatter(1.75)).toBe('1.75');
  expect(tooltip.valueFormatter(null)).toBe('未提供');
  act(() => {
    width = 360;
    for (const observer of observers) observer.callback([], observer);
    original.dispatchAction({ type: 'dataZoom', start: 10, end: 80 });
  });
  expect(original.getWidth()).toBe(360);
  const lightBackground = (options.tooltip as { backgroundColor: string }[])[0]?.backgroundColor;
  result.rerender(view(true));
  const dark = chartFor('调用与失败趋势');
  expect(original.isDisposed()).toBe(true);
  expect((dark.getOption().tooltip as { backgroundColor: string }[])[0]?.backgroundColor).not.toBe(lightBackground);
  expect(zoom(dark)).toMatchObject({ start: 10, end: 80 });
  result.unmount();
  expect(dark.isDisposed()).toBe(true);
});
