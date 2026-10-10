import { Card, Empty, Space, Typography, theme } from 'antd';
import { useId } from 'react';
import type { GatewayMetricResult } from './gateway-api.js';
import { nativeSeries } from './gateway-api.js';
import { formatGatewayNumber, gatewayT as t } from './gateway-ui.js';

export function GatewayMetricNote({ result }: { result: GatewayMetricResult | undefined }) {
  return result ? (
    <Typography.Text type="secondary">
      {result.source} · {result.definition.id} · {t('gatewayWindowSeconds')}: {result.definition.windowSeconds} s ·{' '}
      {result.definition.unit}
      {result.definition.modelDimension === 'upstream_model' ? ` · ${t('gatewayUpstreamModelDimension')}` : ''}
    </Typography.Text>
  ) : null;
}

// Coordinate scaling is only drawing geometry. Each plotted value is an
// unchanged native sample; gaps stay gaps, with no totals or interpolation.
export function GatewayTrend({
  calls,
  failures,
}: {
  calls?: GatewayMetricResult | undefined;
  failures?: GatewayMetricResult | undefined;
}) {
  const { token } = theme.useToken();
  const id = useId();
  const series = [
    ...nativeSeries(calls).map((item) => ({ ...item, failed: false })),
    ...nativeSeries(failures).map((item) => ({ ...item, failed: true })),
  ];
  const points = series.flatMap((item) => item.points.filter((point) => point.value !== null));
  const times = points.map((point) => point.time);
  const first = times.length ? Math.min(...times) : 0;
  const last = times.length ? Math.max(...times) : 0;
  const ceiling = Math.max(1, ...points.map((point) => point.value ?? 0));
  const x = (value: number) => 64 + ((value - first) / Math.max(1, last - first)) * 656;
  const y = (value: number) => 202 - (value / ceiling) * 168;
  const clock = (value: number) =>
    new Date(value * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <Card title={t('gatewayCallTrend')}>
      {points.length ? (
        <svg viewBox="0 0 760 250" role="img" aria-labelledby={id} style={{ width: '100%', display: 'block' }}>
          <title id={id}>{t('gatewayCallTrend')}</title>
          {[0, 0.5, 1].map((ratio) => (
            <g key={ratio}>
              <line
                x1="64"
                x2="720"
                y1={y(ceiling * ratio)}
                y2={y(ceiling * ratio)}
                stroke={token.colorBorderSecondary}
              />
              <text
                x="56"
                y={y(ceiling * ratio) + 4}
                textAnchor="end"
                fill={token.colorTextSecondary}
                fontSize={token.fontSizeSM}
              >
                {formatGatewayNumber(ceiling * ratio)}
              </text>
            </g>
          ))}
          {series.map((item) => (
            <g key={`${item.failed}:${item.key}`}>
              <path
                fill="none"
                stroke={item.failed ? token.colorError : token.colorPrimary}
                strokeWidth={2}
                strokeDasharray={item.failed ? '5 4' : undefined}
                d={item.points
                  .map((point, index) =>
                    point.value === null
                      ? ''
                      : `${index === 0 || item.points[index - 1]?.value === null ? 'M' : 'L'} ${x(point.time)} ${y(point.value)}`,
                  )
                  .join(' ')}
              />
              {item.points
                .filter((point) => point.value !== null)
                .map((point) => (
                  <circle
                    key={point.time}
                    cx={x(point.time)}
                    cy={y(point.value ?? 0)}
                    r={2}
                    fill={item.failed ? token.colorError : token.colorPrimary}
                  >
                    <title>{`${clock(point.time)} · ${t(item.failed ? 'gatewayFailures' : 'gatewayCalls')}: ${formatGatewayNumber(point.value)}`}</title>
                  </circle>
                ))}
            </g>
          ))}
          <text x="64" y="232" fill={token.colorTextSecondary} fontSize={token.fontSizeSM}>
            {clock(first)}
          </text>
          <text x="720" y="232" textAnchor="end" fill={token.colorTextSecondary} fontSize={token.fontSizeSM}>
            {clock(last)}
          </text>
        </svg>
      ) : (
        <Empty description={t('gatewayNoData')} />
      )}
      <Space orientation="vertical" size="small">
        <Space>
          <Typography.Text style={{ color: token.colorPrimary }}>{t('gatewayCalls')}</Typography.Text>
          <Typography.Text style={{ color: token.colorError }}>{t('gatewayFailures')}</Typography.Text>
        </Space>
        <GatewayMetricNote result={calls} />
        <GatewayMetricNote result={failures} />
      </Space>
    </Card>
  );
}
