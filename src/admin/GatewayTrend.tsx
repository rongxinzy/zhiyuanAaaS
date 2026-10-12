import { Line, type LineConfig } from '@ant-design/plots';
import { Card, Checkbox, Empty, Space, Typography, theme } from 'antd';
import dayjs from 'dayjs';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { GatewayMetricResult, GatewayWindow } from './gateway-api.js';
import { nativeSeries } from './gateway-api.js';
import { formatGatewayNumber, gatewayT as t } from './gateway-ui.js';

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

// Drawing coordinates only: retain native samples, label groups and gaps.
export function gatewayTrendSeries(measures: TrendMeasure[]) {
  return measures.flatMap(({ name, result, color, dashed }) =>
    nativeSeries(result).map((item) => ({
      name: `${name}${Object.keys(item.labels).length ? ` · ${Object.values(item.labels).join(' / ')}` : ''}`,
      color,
      dashed,
      data: item.points.map((point) => ({ time: new Date(point.time * 1000), value: point.value })),
    })),
  );
}

export interface GatewayChartZoom {
  range: string;
  values: [number, number];
}
interface TrendProps {
  window: GatewayWindow;
  loading?: boolean | undefined;
  zoom?: GatewayChartZoom | undefined;
  onZoom?: ((zoom: GatewayChartZoom) => void) | undefined;
}

function NativeTrend({
  title,
  measures,
  window,
  unit,
  loading,
  zoom,
  onZoom,
}: TrendProps & { title: string; measures: TrendMeasure[]; unit: string }) {
  const { token } = theme.useToken();
  const series = useMemo(() => gatewayTrendSeries(measures), [measures]);
  const hasPoints = series.some((item) => item.data.some((point) => point.value !== null));
  const range = `${window.start}/${window.end}`;
  const latest = useRef({ window, range, onZoom });
  latest.current = { window, range, onZoom };
  const onEvent = useCallback(
    (_plot: unknown, event: { type: string; nativeEvent?: boolean; data?: { selection?: (number | Date)[][] } }) => {
      // G2 forwards the native slider event with type "valuechange" even
      // though it is emitted on the sliderX:filter channel.
      if (!['sliderX:filter', 'valuechange'].includes(event.type) || !event.nativeEvent) return;
      const selection = event.data?.selection?.[0];
      if (selection?.length !== 2) return;
      const { window, range, onZoom } = latest.current;
      const start = Date.parse(window.start);
      const span = Date.parse(window.end) - start;
      if (span <= 0) return;
      const values = selection.map((value: number | Date) => Math.max(0, Math.min(1, (Number(value) - start) / span)));
      if (values.every(Number.isFinite)) onZoom?.({ range, values: [values[0]!, values[1]!] });
    },
    [],
  );
  const config: LineConfig = {
    autoFit: true,
    height: token.controlHeight * 9,
    paddingTop: token.paddingXS,
    paddingLeft: token.controlHeightLG,
    paddingRight: token.padding,
    data: series.flatMap((item) => item.data.map((point) => ({ ...point, series: item.name, dashed: item.dashed }))),
    xField: 'time',
    yField: 'value',
    colorField: 'series',
    animate: false,
    scale: {
      x: { type: 'time', domain: [new Date(window.start), new Date(window.end)] },
      y: { domainMin: 0, nice: true },
      color: { domain: series.map((item) => item.name), range: series.map((item) => item.color) },
    },
    style: {
      connect: false,
      lineWidth: token.lineWidthBold,
      lineDash: (datum: { dashed?: boolean }) => (datum.dashed ? [4, 4] : []),
    },
    legend: false,
    axis: {
      x: {
        title: false,
        size: token.controlHeight,
        labelFormatter: (value: number) => dayjs(value).format('MM-DD HH:mm'),
        labelFill: token.colorTextSecondary,
        labelOpacity: 1,
        lineStroke: token.colorBorderSecondary,
        labelAutoHide: true,
      },
      y: {
        title: false,
        size: token.controlHeightLG,
        labelFill: token.colorTextSecondary,
        labelOpacity: 1,
        gridStroke: token.colorBorderSecondary,
      },
    },
    // Same Line + slider.x implementation as the official slider example.
    slider: {
      x: {
        values: zoom?.range === range ? zoom.values : [0, 1],
        labelFormatter: (value: number) => dayjs(value).format('MM-DD HH:mm'),
        trackSize: token.controlHeightSM,
        trackFill: token.colorFillAlter,
        selectionFill: token.colorPrimary,
        handleIconFill: token.colorBgContainer,
        handleIconStroke: token.colorBorder,
        handleIconStrokeOpacity: 1,
        handleIconRadius: token.borderRadiusSM,
        handleLabelFill: token.colorTextSecondary,
        handleLabelFillOpacity: 1,
        sparklineAreaFill: token.colorPrimaryBg,
        sparklineLineStroke: token.colorPrimary,
      },
    },
    tooltip: {
      title: (datum: { time: Date }) => dayjs(datum.time).format('YYYY-MM-DD HH:mm:ss'),
      items: [{ channel: 'y', valueFormatter: (value: number | null) => formatGatewayNumber(value) }],
    },
    interaction: {
      tooltip: {
        shared: true,
        crosshairs: true,
        crosshairsY: false,
        crosshairsStroke: token.colorTextSecondary,
        crosshairsLineDash: [4, 4],
        css: {
          '.g2-tooltip': {
            background: token.colorBgElevated,
            color: token.colorText,
            border: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
            borderRadius: token.borderRadius,
            fontFamily: token.fontFamily,
          },
        },
      },
      sliderFilter: true,
    },
    theme: { defaultColor: token.colorPrimary, defaultFontFamily: token.fontFamily, defaultFontSize: token.fontSizeSM },
    onEvent,
  };
  return (
    <Space orientation="vertical" style={{ width: '100%' }}>
      <Typography.Text type="secondary">{unit}</Typography.Text>
      {hasPoints && !loading ? (
        <div role="img" aria-label={title} className="gateway-native-chart">
          <Line {...config} />
        </div>
      ) : (
        <Empty description={loading ? t('gatewayLoadingMetrics') : t('gatewayNoData')} />
      )}
      <Typography.Text type="secondary">{t('gatewayChartInteraction')}</Typography.Text>
    </Space>
  );
}

export function GatewayTrend({ calls, ...props }: TrendProps & { calls?: GatewayMetricResult | undefined }) {
  const { token } = theme.useToken();
  const measures = useMemo(
    () => [{ name: t('gatewayCalls'), result: calls, color: token.colorPrimary }],
    [calls, token],
  );
  return (
    <Card className="gateway-trend-card" loading={Boolean(props.loading)} title={t('gatewayCallTrend')}>
      <Space orientation="vertical" style={{ width: '100%' }}>
        <NativeTrend {...props} title={t('gatewayCallTrend')} measures={measures} unit={t('gatewayRequestUnit')} />
        <GatewayMetricNote result={calls} />
      </Space>
    </Card>
  );
}

export function GatewayTokenTrend({
  input,
  output,
  ...props
}: TrendProps & { input?: GatewayMetricResult | undefined; output?: GatewayMetricResult | undefined }) {
  const { token } = theme.useToken();
  const [visible, setVisible] = useState(['input', 'output']);
  const onVisible = useCallback((values: string[]) => setVisible(values), []);
  const measures = useMemo(
    () => [
      ...(visible.includes('input')
        ? [{ name: t('gatewayInputTokens'), result: input, color: token.colorPrimary }]
        : []),
      ...(visible.includes('output')
        ? [{ name: t('gatewayOutputTokens'), result: output, color: token.colorSuccess, dashed: true }]
        : []),
    ],
    [input, output, token, visible],
  );
  return (
    <Card
      title={t('gatewayTokenTrend')}
      loading={Boolean(props.loading)}
      className="gateway-trend-card"
      extra={
        <Checkbox.Group
          aria-label={t('gatewayTokenVisibility')}
          value={visible}
          onChange={onVisible}
          options={[
            { label: t('gatewayInputTokens'), value: 'input' },
            { label: t('gatewayOutputTokens'), value: 'output' },
          ]}
        />
      }
    >
      <Space orientation="vertical" style={{ width: '100%' }}>
        <NativeTrend {...props} title={t('gatewayTokenTrend')} measures={measures} unit="Token" />
        {visible.includes('input') ? <GatewayMetricNote result={input} /> : null}
        {visible.includes('output') ? <GatewayMetricNote result={output} /> : null}
      </Space>
    </Card>
  );
}
