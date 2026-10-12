import { Card, Checkbox, Empty, Segmented, Space, Typography, theme } from 'antd';
import { LineChart } from 'echarts/charts';
import { AriaComponent, DataZoomComponent, GridComponent, TooltipComponent } from 'echarts/components';
import { connect, type ECharts, type EChartsCoreOption, init, use } from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GatewayMetricResult, GatewayWindow } from './gateway-api.js';
import { nativeSeries } from './gateway-api.js';
import { formatGatewayNumber, gatewayDisplayValue, gatewayT as t } from './gateway-ui.js';

use([LineChart, GridComponent, TooltipComponent, DataZoomComponent, AriaComponent, SVGRenderer]);

export function GatewayMetricNote({ result }: { result: GatewayMetricResult | undefined }) {
  return result ? (
    <Typography.Text type="secondary" style={{ overflowWrap: 'anywhere' }}>
      {result.source} · {result.definition.id} · {t('gatewayWindowSeconds')}: {result.definition.windowSeconds} s ·{' '}
      {result.definition.unit}
      {result.definition.modelDimension === 'upstream_model' ? ` · ${t('gatewayUpstreamModelDimension')}` : ''}
    </Typography.Text>
  ) : null;
}

interface TrendMeasure {
  name: string;
  result: GatewayMetricResult | undefined;
  color: string;
  dashed?: boolean;
}

// ECharts owns axes, panning, zoom and crosshair tooltips. Values remain native
// samples floored for presentation, with no interpolation, totals or
// success-from-failure calculations. Timestamp conversion only changes coordinates.
export function gatewayTrendSeries(measures: TrendMeasure[]) {
  return measures.flatMap(({ name, result, color, dashed }) =>
    nativeSeries(result).map((item) => ({
      type: 'line' as const,
      name: `${name}${Object.keys(item.labels).length ? ` · ${Object.values(item.labels).join(' / ')}` : ''}`,
      data: item.points.map((point) => [point.time * 1000, gatewayDisplayValue(point.value)]),
      connectNulls: false,
      smooth: false,
      showSymbol: false,
      lineStyle: { color, type: dashed ? ('dashed' as const) : ('solid' as const), width: 2 },
      itemStyle: { color },
      emphasis: { focus: 'series' as const },
    })),
  );
}

function NativeTrend({
  title,
  measures,
  group,
  window,
  unit,
  loading,
}: {
  title: string;
  measures: TrendMeasure[];
  group: string;
  window: GatewayWindow;
  unit: string;
  loading?: boolean | undefined;
}) {
  const { token } = theme.useToken();
  const container = useRef<HTMLDivElement>(null);
  const zoom = useRef({ range: '', start: 0, end: 100 });
  const series = useMemo(() => gatewayTrendSeries(measures), [measures]);
  const hasPoints = series.some((item) => item.data.some((point) => point[1] !== null));
  useEffect(() => {
    const element = container.current;
    if (!element || !hasPoints || loading) return;
    let chart: ECharts | undefined;
    const range = `${window.start}/${window.end}`;
    if (zoom.current.range !== range) zoom.current = { range, start: 0, end: 100 };
    const option: EChartsCoreOption = {
      animation: false,
      aria: { enabled: true, label: { description: title } },
      textStyle: { fontFamily: token.fontFamily, fontSize: token.fontSizeSM, color: token.colorText },
      grid: { left: token.paddingXS, right: token.padding, top: token.paddingXL, bottom: 72, containLabel: true },
      tooltip: {
        trigger: 'axis',
        renderMode: 'richText',
        confine: true,
        backgroundColor: token.colorBgElevated,
        borderColor: token.colorBorderSecondary,
        textStyle: { color: token.colorText, fontSize: token.fontSizeSM },
        axisPointer: { type: 'line', lineStyle: { color: token.colorTextSecondary, type: 'dashed' } },
        valueFormatter: (value: unknown) => formatGatewayNumber(typeof value === 'number' ? value : null),
      },
      xAxis: {
        type: 'time',
        min: new Date(window.start).getTime(),
        max: new Date(window.end).getTime(),
        axisLabel: { color: token.colorTextSecondary, hideOverlap: true },
        axisLine: { lineStyle: { color: token.colorBorderSecondary } },
        axisPointer: {
          label: { show: true, backgroundColor: token.colorTextSecondary, color: token.colorBgContainer },
        },
      },
      yAxis: {
        type: 'value',
        name: unit,
        min: 0,
        minInterval: 1,
        nameTextStyle: { color: token.colorTextSecondary },
        axisLabel: { color: token.colorTextSecondary },
        splitLine: { lineStyle: { color: token.colorBorderSecondary } },
      },
      dataZoom: [
        {
          type: 'inside',
          start: zoom.current.start,
          end: zoom.current.end,
          filterMode: 'none',
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
          preventDefaultMouseMove: true,
        },
        {
          type: 'slider',
          filterMode: 'none',
          height: token.controlHeightSM,
          bottom: token.paddingXS,
          borderColor: token.colorBorderSecondary,
          backgroundColor: token.colorFillAlter,
          fillerColor: token.colorPrimaryBg,
          handleStyle: { color: token.colorBgContainer, borderColor: token.colorPrimary },
          moveHandleStyle: { color: token.colorPrimary },
          textStyle: { color: token.colorTextSecondary },
          dataBackground: { lineStyle: { color: token.colorBorder }, areaStyle: { color: token.colorFillSecondary } },
          selectedDataBackground: {
            lineStyle: { color: token.colorPrimary },
            areaStyle: { color: token.colorPrimaryBg },
          },
        },
      ],
      series,
    };
    const resize = () => {
      if (!element.clientWidth) return;
      if (chart) {
        chart.resize();
        return;
      }
      chart = init(element, undefined, { renderer: 'svg' });
      chart.group = group;
      connect(group);
      chart.setOption(option);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (chart) {
        const current = (chart.getOption().dataZoom as { start: number; end: number }[])[0];
        if (current) zoom.current = { range, start: current.start, end: current.end };
        chart.dispose();
      }
    };
  }, [series, group, window.start, window.end, unit, title, token, hasPoints, loading]);
  return (
    <>
      {hasPoints && !loading ? (
        <div
          ref={container}
          role="img"
          aria-label={title}
          className="gateway-native-chart"
          style={{ height: token.controlHeight * 9 }}
        />
      ) : (
        <Empty description={loading ? t('gatewayLoadingMetrics') : t('gatewayNoData')} />
      )}
      <Typography.Text type="secondary">{t('gatewayChartInteraction')}</Typography.Text>
    </>
  );
}

export function GatewayTrend({
  calls,
  input,
  output,
  group,
  window,
  loading,
}: {
  calls?: GatewayMetricResult | undefined;
  input?: GatewayMetricResult | undefined;
  output?: GatewayMetricResult | undefined;
  group: string;
  window: GatewayWindow;
  loading?: boolean | undefined;
}) {
  const { token } = theme.useToken();
  const [mode, setMode] = useState('calls');
  const [visible, setVisible] = useState(['input', 'output']);
  const measures = useMemo(
    () =>
      mode === 'calls'
        ? [{ name: t('gatewayCalls'), result: calls, color: token.colorPrimary }]
        : [
            ...(visible.includes('input')
              ? [{ name: t('gatewayInputTokens'), result: input, color: token.colorPrimary }]
              : []),
            ...(visible.includes('output')
              ? [{ name: t('gatewayOutputTokens'), result: output, color: token.colorSuccess, dashed: true }]
              : []),
          ],
    [mode, calls, input, output, token, visible],
  );
  return (
    <Card
      className="gateway-trend-card"
      loading={Boolean(loading)}
      title={t('gatewayUsageTrend')}
      extra={
        <Segmented
          aria-label={t('gatewayTrendMetric')}
          value={mode}
          onChange={setMode}
          options={[
            { label: t('gatewayCalls'), value: 'calls' },
            { label: t('gatewayTokenUsage'), value: 'tokens' },
          ]}
        />
      }
    >
      <Space orientation="vertical" style={{ width: '100%' }}>
        {mode === 'tokens' ? (
          <Checkbox.Group
            aria-label={t('gatewayTokenVisibility')}
            value={visible}
            onChange={setVisible}
            options={[
              { label: t('gatewayInputTokens'), value: 'input' },
              { label: t('gatewayOutputTokens'), value: 'output' },
            ]}
          />
        ) : (
          <Typography.Text type="secondary">{t('gatewayCallsIncludeFailures')}</Typography.Text>
        )}
        <NativeTrend
          title={t(mode === 'calls' ? 'gatewayCallTrend' : 'gatewayTokenTrend')}
          measures={measures}
          group={group}
          window={window}
          unit={mode === 'calls' ? t('gatewayRequestUnit') : 'Token'}
          loading={loading}
        />
        <Space wrap>
          {measures.map((measure) => (
            <Typography.Text key={measure.name} style={{ color: measure.color }}>
              {measure.name}
            </Typography.Text>
          ))}
        </Space>
        {measures.map((measure) => (
          <GatewayMetricNote key={measure.name} result={measure.result} />
        ))}
      </Space>
    </Card>
  );
}
