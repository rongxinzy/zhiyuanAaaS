// Browser adapter for the public AEP gateway contract. The pinned SDK release
// predates these methods; reuse AdminConsoleClient's authenticated transport.
// Metric values are supplied by native sources, never aggregated here.
export type GatewayDimension = 'model' | 'user' | 'team' | 'role';
export type GatewayMetric =
  | 'calls'
  | 'failures'
  | 'input_tokens'
  | 'output_tokens'
  | 'first_token_duration'
  | 'service_duration'
  | 'downstream_qps'
  | 'upstream_qps'
  | 'downstream_success_rate'
  | 'upstream_success_rate'
  | 'auth_requests';
export interface GatewayCapabilities {
  sources: { prometheus: boolean; loki: boolean; quota: boolean; testAccess: boolean };
  dimensions: string[];
  metrics: string[];
  unsupported: string[];
}
export interface GatewayWindow {
  start: string;
  end: string;
  modelId?: string;
  userId?: string;
  teamId?: string;
  roleId?: string;
}
export interface GatewayMetricQuery extends GatewayWindow {
  metric: GatewayMetric;
  groupBy?: GatewayDimension | 'none';
  step?: number;
  expectedDefinition?: string;
}
export interface GatewayRequestQuery extends GatewayWindow {
  source?: 'all' | 'gateway' | 'authorizer';
  limit?: number;
  cursor?: string;
}
export interface GatewayNativeResult {
  source: 'prometheus' | 'loki';
  queriedAt: string;
  data: Record<string, unknown>;
}
export interface GatewayMetricResult extends GatewayNativeResult {
  definition: {
    id: string;
    unit: string;
    aggregation: string;
    windowSeconds: number;
    groupBy: string;
    modelDimension: string;
  };
}
export interface GatewayHealth {
  sources: {
    source: 'prometheus' | 'loki' | 'quota';
    state: 'disabled' | 'healthy' | 'unavailable';
    checkedAt: string;
    targets: { health: string; lastScrape: string; lastScrapeDuration: number }[];
  }[];
}
export interface GatewayLimitWrite {
  kind: 'requests' | 'tokens';
  scopeType: GatewayDimension | 'global';
  scopeId?: string | null;
  modelId?: string | null;
  maximum: number;
  interval: 'second' | 'minute' | 'hour' | 'day';
  enabled: boolean;
  expectedVersion: number;
}
export interface GatewayLimit {
  id: string;
  version: number;
  configuration: GatewayLimitWrite;
  updatedAt: string;
}
export interface GatewayLimitPage {
  items: GatewayLimit[];
}
export interface GatewayLimitPublication {
  revision: string;
  publishedAt: string;
  items: GatewayLimit[];
}
export interface GatewayLimitStatus {
  state: 'unpublished' | 'pending' | 'applied' | 'error';
  revision: string | null;
  runtimeVerified: boolean;
}
export interface GatewayQuota {
  consumer: string;
  quota: number;
}
export interface GatewayTestAccess {
  modelId: string;
  protocol: 'openai-compatible' | 'anthropic';
  baseUrl: string;
  path: string;
  modelAccessToken: string;
  expiresAt: string;
}

export interface NativeSeries {
  key: string;
  labels: Record<string, string>;
  points: { time: number; value: number | null }[];
}
export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
export function nativeSeries(result: GatewayNativeResult | undefined): NativeSeries[] {
  const payload = record(result?.data.data);
  if (!Array.isArray(payload.result)) return [];
  return payload.result.map((item) => {
    const row = record(item);
    const labels = Object.fromEntries(
      Object.entries(record(row.metric)).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
    const samples = Array.isArray(row.values) ? row.values : Array.isArray(row.value) ? [row.value] : [];
    return {
      key: JSON.stringify(Object.entries(labels).sort(([a], [b]) => a.localeCompare(b))),
      labels,
      points: samples.flatMap((point) => {
        if (!Array.isArray(point) || typeof point[0] !== 'number') return [];
        const value = typeof point[1] === 'string' && point[1].trim() !== '' ? Number(point[1]) : Number.NaN;
        return [{ time: point[0], value: Number.isFinite(value) ? value : null }];
      }),
    };
  });
}
export function decodeIdentity(value: string): string {
  try {
    const bytes = Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), (char) => char.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return value;
  }
}
export function seriesIdentity(labels: Record<string, string>, dimension: GatewayDimension): string {
  const consumer = labels.ai_consumer;
  if (dimension === 'user' && consumer?.startsWith('aep.')) return decodeIdentity(consumer.split('.')[2] ?? '');
  // Vector unnest keeps call-time team/role membership IDs in base64url.
  if ((dimension === 'team' || dimension === 'role') && labels[`${dimension}_id`])
    return decodeIdentity(labels[`${dimension}_id`] ?? '');
  return labels[`${dimension}_id`] ?? labels[dimension === 'model' ? 'ai_model' : `ai_${dimension}`] ?? '';
}
export function memberships(value: string): string[] {
  return value.split('|').filter(Boolean).map(decodeIdentity);
}
export interface GatewayLogRow {
  key: string;
  timestamp: string;
  source: string;
  fields: Record<string, string>;
}
export function nativeRequests(result: GatewayNativeResult | undefined): GatewayLogRow[] {
  const payload = record(result?.data.data);
  if (!Array.isArray(payload.result)) return [];
  return payload.result
    .flatMap((item) => {
      const stream = record(item);
      const labels = record(stream.stream);
      if (!Array.isArray(stream.values)) return [];
      return stream.values.flatMap((point) => {
        if (!Array.isArray(point) || typeof point[0] !== 'string' || typeof point[1] !== 'string') return [];
        try {
          const fields = Object.fromEntries(
            Object.entries(record(JSON.parse(point[1]))).filter(
              (entry): entry is [string, string] => typeof entry[1] === 'string',
            ),
          );
          return [
            {
              key: `${point[0]}:${String(labels.aep_source ?? '')}:${fields.request_id ?? ''}`,
              timestamp: point[0],
              source: typeof labels.aep_source === 'string' ? labels.aep_source : '',
              fields,
            },
          ];
        } catch {
          return [];
        }
      });
    })
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
}
