/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import type { LineConfig } from '@ant-design/plots';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ConfigProvider, theme } from 'antd';
import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { type GatewayChartZoom, GatewayTokenTrend, GatewayTrend } from './GatewayTrend.js';
import type { GatewayMetricResult } from './gateway-api.js';

// jsdom verifies the native-data/configuration boundary. Real rendering,
// slider gestures, crosshairs and resize are covered by the browser regression.
const { plots } = vi.hoisted(() => ({ plots: new Map<string, LineConfig>() }));
vi.mock('@ant-design/plots', async () => {
  const React = await import('react');
  return {
    Line: (config: LineConfig) => {
      const element = React.useRef<HTMLDivElement>(null);
      React.useEffect(() => {
        const title = element.current?.parentElement?.getAttribute('aria-label') ?? '';
        plots.set(title, config);
        return () => {
          plots.delete(title);
        };
      }, [config]);
      return <div ref={element} />;
    },
  };
});
afterEach(() => {
  cleanup();
  expect(plots.size).toBe(0);
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
function config(title: string) {
  const plot = plots.get(title);
  if (!plot) throw new Error(`Missing chart: ${title}`);
  return plot;
}
function Linked({ range = window, dark = false }: { range?: typeof window; dark?: boolean }) {
  const [zoom, setZoom] = useState<GatewayChartZoom>();
  return (
    <ConfigProvider theme={{ algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm }}>
      <GatewayTrend calls={metric('calls')} window={range} zoom={zoom} onZoom={setZoom} />
      <GatewayTokenTrend
        input={metric('input_tokens')}
        output={metric('output_tokens')}
        window={range}
        zoom={zoom}
        onZoom={setZoom}
      />
    </ConfigProvider>
  );
}
test('all calls have one series without status controls; native zoom links and resets for a new window', () => {
  const result = render(<Linked />);
  const original = config('调用趋势');
  expect(screen.queryByRole('radio', { name: '成功' })).not.toBeInTheDocument();
  expect(screen.queryByRole('radio', { name: '失败次数' })).not.toBeInTheDocument();
  expect(original.data).toEqual([
    { time: new Date(100000), value: 1.75, series: '调用次数', dashed: undefined },
    { time: new Date(160000), value: null, series: '调用次数', dashed: undefined },
    { time: new Date(220000), value: 0, series: '调用次数', dashed: undefined },
  ]);
  expect(original.style).toMatchObject({ connect: false });
  expect(original.style.lineDash({ dashed: false })).toEqual([]);
  expect(original.style.lineDash({ dashed: true })).toEqual([4, 4]);
  expect(original.axis.x.labelFormatter(100000)).toMatch(/\d{2}-\d{2} \d{2}:\d{2}/);
  expect(original.slider.x.labelFormatter(100000)).toBe(original.axis.x.labelFormatter(100000));
  const tooltipTitle = (original.tooltip as { title: (datum: { time: Date }) => string }).title;
  expect(tooltipTitle({ time: new Date(100000) })).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
  act(() =>
    original.onEvent?.({}, { type: 'valuechange', nativeEvent: true, data: { selection: [[160000, 310000]] } }),
  );
  expect(config('调用趋势').slider.x.values).toEqual([0.2, 0.7]);
  expect(config('Token 用量趋势').slider.x.values).toEqual([0.2, 0.7]);
  fireEvent.click(screen.getByRole('checkbox', { name: '输入 Token' }));
  expect(config('Token 用量趋势').slider.x.values).toEqual([0.2, 0.7]);
  result.rerender(<Linked range={{ ...window, end: new Date(460000).toISOString() }} />);
  expect(config('调用趋势').slider.x.values).toEqual([0, 1]);
  expect(config('Token 用量趋势').slider.x.values).toEqual([0, 1]);
});
test('Token visibility preserves gaps and empty selection does not fabricate zero series', () => {
  render(<Linked />);
  fireEvent.click(screen.getByRole('checkbox', { name: '输入 Token' }));
  expect(config('Token 用量趋势').data.map((point: { series: string }) => point.series)).toEqual([
    '输出 Token',
    '输出 Token',
    '输出 Token',
  ]);
  fireEvent.click(screen.getByRole('checkbox', { name: '输出 Token' }));
  expect(screen.queryByRole('img', { name: 'Token 用量趋势' })).not.toBeInTheDocument();
  expect(screen.getByText('当前查询没有原生数据')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: '输入 Token' }));
  expect(config('Token 用量趋势').data.map((point: { value: number | null }) => point.value)).toEqual([1.75, null, 0]);
});
test('theme changes retain zoom and apply root tokens to axes, thumbnail and crosshair tooltip', () => {
  const result = render(<Linked />);
  const light = config('调用趋势');
  const background = light.interaction.tooltip.css['.g2-tooltip'].background;
  expect(light.interaction.tooltip).toMatchObject({ shared: true, crosshairs: true, crosshairsY: false });
  act(() =>
    light.onEvent?.({}, { type: 'sliderX:filter', nativeEvent: true, data: { selection: [[130000, 340000]] } }),
  );
  result.rerender(<Linked dark />);
  const dark = config('调用趋势');
  expect(dark.slider.x.values).toEqual([0.1, 0.8]);
  expect(dark.interaction.tooltip.css['.g2-tooltip'].background).not.toBe(background);
  expect(screen.getByText('次数（次）')).toBeVisible();
  const formatter = (dark.tooltip as { items: { valueFormatter: (value: number | null) => string }[] }).items[0]!
    .valueFormatter;
  expect(formatter(1.75)).toBe('1.75');
  expect(formatter(null)).toBe('未提供');
});
test('programmatic and invalid selection events do not change the displayed range', () => {
  render(<Linked />);
  const chart = config('调用趋势');
  act(() => {
    chart.onEvent?.({}, { type: 'sliderX:filter', data: { selection: [[160000, 310000]] } });
    chart.onEvent?.({}, { type: 'sliderX:filter', nativeEvent: true, data: { selection: [[NaN, 310000]] } });
    chart.onEvent?.({}, { type: 'sliderX:filter', nativeEvent: true });
  });
  expect(config('调用趋势').slider.x.values).toEqual([0, 1]);
});
