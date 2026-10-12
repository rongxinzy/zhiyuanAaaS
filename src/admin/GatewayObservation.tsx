import { ExportOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Row,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  theme,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AdminPermission, hasAdminPermission } from './client.js';
import { GatewayMetricNote, GatewayTokenTrend, GatewayTrend } from './GatewayTrend.js';
import type {
  GatewayDimension,
  GatewayLogRow,
  GatewayMetric,
  GatewayMetricResult,
  GatewayRequestQuery,
  GatewayWindow,
} from './gateway-api.js';
import { memberships, nativeRequests, nativeSeries, seriesIdentity } from './gateway-api.js';
import {
  dimensionLabels,
  formatGatewayNumber,
  GatewayField,
  GatewayHeading,
  GatewayLoadError,
  GatewayPage,
  type GatewayProps,
  gatewayT as t,
  useGatewayRemote,
} from './gateway-ui.js';

const usageMetrics = [
  'calls',
  'failures',
  'input_tokens',
  'output_tokens',
  'first_token_duration',
  'service_duration',
] as const;
const infrastructureMetrics = [
  'downstream_qps',
  'upstream_qps',
  'downstream_success_rate',
  'upstream_success_rate',
  'auth_requests',
] as const;
const metricLabels = {
  calls: 'gatewayCalls',
  failures: 'gatewayFailures',
  input_tokens: 'gatewayInputTokens',
  output_tokens: 'gatewayOutputTokens',
  first_token_duration: 'gatewayFirstTokenMean',
  service_duration: 'gatewayServiceMean',
  downstream_qps: 'gatewayDownstreamQps',
  upstream_qps: 'gatewayUpstreamQps',
  downstream_success_rate: 'gatewayDownstreamRatio',
  upstream_success_rate: 'gatewayUpstreamRatio',
  auth_requests: 'gatewayAuthRequests',
} as const;
type MetricValue = { result?: GatewayMetricResult; failed: boolean };
type Subjects = Awaited<ReturnType<GatewayProps['client']['gatewaySubjects']>>;
function subjectOptions(subjects: Subjects | undefined, dimension: GatewayDimension) {
  const items =
    dimension === 'model'
      ? subjects?.models
      : dimension === 'user'
        ? subjects?.users
        : dimension === 'team'
          ? subjects?.teams
          : subjects?.roles;
  return (items ?? []).map((item) => ({ value: item.id, label: 'displayName' in item ? item.displayName : item.name }));
}
function logTime(row: GatewayLogRow): string {
  try {
    return new Date(Number(BigInt(row.timestamp) / 1_000_000n)).toLocaleString();
  } catch {
    return t('gatewayNotProvided');
  }
}

export function GatewayObservation({ client, identity, onPrices }: GatewayProps & { onPrices?: () => void }) {
  const { token } = theme.useToken();
  const canReadRequests = hasAdminPermission(identity, AdminPermission.EventsRead);
  const capabilities = useGatewayRemote(useCallback(() => client.getGatewayCapabilities(), [client]));
  const subjects = useGatewayRemote(useCallback(() => client.gatewaySubjects(identity), [client, identity]));
  const health = useGatewayRemote(useCallback(() => client.getGatewayMonitoringHealth(), [client]));
  const [filters, setFilters] = useState<Record<GatewayDimension, string>>({ model: '', user: '', team: '', role: '' });
  const [group, setGroup] = useState<GatewayDimension>('user');
  const [period, setPeriod] = useState('3600');
  const [step, setStep] = useState('60');
  const [end, setEnd] = useState(() => Date.now());
  const [customRange, setCustomRange] = useState<[number, number]>();
  const [rangeError, setRangeError] = useState(false);
  const chartGroup = useId();
  const [source, setSource] = useState<'all' | 'gateway' | 'authorizer'>('all');
  const [errorsOnly, setErrorsOnly] = useState(true);
  const [detail, setDetail] = useState<GatewayLogRow>();
  const [detailFailed, setDetailFailed] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [more, setMore] = useState<GatewayLogRow[]>([]);
  const [moreLoading, setMoreLoading] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const rangeStart = customRange?.[0] ?? end - Number(period) * 1000;
  const rangeEnd = customRange?.[1] ?? end;
  const window: GatewayWindow = useMemo(
    () => ({
      start: new Date(rangeStart).toISOString(),
      end: new Date(rangeEnd).toISOString(),
      ...(filters.model ? { modelId: filters.model } : {}),
      ...(filters.user ? { userId: filters.user } : {}),
      ...(filters.team ? { teamId: filters.team } : {}),
      ...(filters.role ? { roleId: filters.role } : {}),
    }),
    [rangeStart, rangeEnd, filters],
  );
  const pickerRange = useMemo<[Dayjs, Dayjs]>(
    () => [dayjs(window.start), dayjs(window.end)],
    [window.start, window.end],
  );
  const requestQuery = useMemo<GatewayRequestQuery>(() => ({ ...window, source, limit: 200 }), [window, source]);
  const activeQuery = useRef(requestQuery);
  activeQuery.current = requestQuery;
  const detailRevision = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      detailRevision.current++;
    };
  }, []);
  const data = useGatewayRemote(
    useCallback(async () => {
      const available = capabilities.value;
      if (!available)
        return {
          summary: {} as Record<GatewayMetric, MetricValue>,
          grouped: {} as Record<GatewayMetric, MetricValue>,
          infrastructure: {} as Record<GatewayMetric, MetricValue>,
          logs: undefined,
          logsFailed: false,
        };
      const query = async (
        metric: GatewayMetric,
        groupBy: GatewayDimension | 'none',
        scoped = true,
      ): Promise<MetricValue> => {
        if (!available.metrics.includes(metric)) return { failed: false };
        try {
          return {
            result: await client.queryGatewayMetrics({
              ...(scoped ? window : { start: window.start, end: window.end }),
              metric,
              groupBy,
              step: Number(step),
            }),
            failed: false,
          };
        } catch {
          return { failed: true };
        }
      };
      const entries = async (metrics: readonly GatewayMetric[], groupBy: GatewayDimension | 'none', scoped = true) =>
        Object.fromEntries(
          await Promise.all(metrics.map(async (metric) => [metric, await query(metric, groupBy, scoped)])),
        ) as Record<GatewayMetric, MetricValue>;
      const [summary, grouped, infrastructure, logs] = await Promise.all([
        entries(usageMetrics, 'none'),
        entries(usageMetrics, group),
        entries(infrastructureMetrics, 'none', false),
        available.sources.loki && canReadRequests
          ? client
              .searchGatewayRequests(requestQuery)
              .then((value) => ({ value, failed: false }))
              .catch(() => ({ value: undefined, failed: true }))
          : { value: undefined, failed: false },
      ]);
      return { summary, grouped, infrastructure, logs: logs.value, logsFailed: logs.failed };
    }, [client, capabilities.value, window, step, group, requestQuery, canReadRequests]),
  );
  useEffect(() => {
    setMore([]);
    setMoreFailed(false);
    setMoreLoading(false);
    setHasMore(nativeRequests(data.value?.logs).length === 200);
    setDetail(undefined);
    detailRevision.current++;
  }, [data.value]);
  const rows = useMemo(() => {
    const grouped = data.value?.grouped;
    const entries = new Map<
      string,
      { key: string; id: string; samples: Partial<Record<GatewayMetric, number | null>> }
    >();
    for (const metric of usageMetrics)
      for (const series of nativeSeries(grouped?.[metric]?.result)) {
        const id = seriesIdentity(series.labels, group);
        const row = entries.get(series.key) ?? { key: series.key, id, samples: {} };
        row.samples[metric] = series.points.at(-1)?.value ?? null;
        entries.set(series.key, row);
      }
    return [...entries.values()];
  }, [data.value?.grouped, group]);
  const records = [...nativeRequests(data.value?.logs), ...more];
  const visibleRecords = errorsOnly ? records.filter((row) => Number(row.fields.status) >= 400) : records;
  const label = (dimension: GatewayDimension, id: string) =>
    subjectOptions(subjects.value, dimension).find((option) => option.value === id)?.label ??
    (id || t('gatewayUnassigned'));
  async function nextPage() {
    const cursor = records.at(-1)?.timestamp;
    if (!cursor || moreLoading) return;
    const current = requestQuery;
    setMoreLoading(true);
    setMoreFailed(false);
    try {
      const page = nativeRequests(await client.searchGatewayRequests({ ...requestQuery, cursor }));
      if (mounted.current && activeQuery.current === current) {
        setMore((old) => [...old, ...page]);
        setHasMore(page.length === 200);
      }
    } catch {
      if (mounted.current && activeQuery.current === current) setMoreFailed(true);
    } finally {
      if (mounted.current && activeQuery.current === current) setMoreLoading(false);
    }
  }
  async function openDetail(row: GatewayLogRow) {
    const revision = ++detailRevision.current;
    const current = requestQuery;
    const valid = () => mounted.current && activeQuery.current === current && detailRevision.current === revision;
    setDetail(row);
    setDetailFailed(false);
    setDetailLoading(true);
    try {
      const entries = nativeRequests(await client.getGatewayRequest(row.fields.request_id ?? '', requestQuery));
      const match = entries.find(
        (item) =>
          item.fields.request_id === row.fields.request_id &&
          item.timestamp === row.timestamp &&
          item.source === row.source,
      );
      if (valid()) {
        if (!match) setDetailFailed(true);
        else setDetail(match);
      }
    } catch {
      if (valid()) setDetailFailed(true);
    } finally {
      if (valid()) setDetailLoading(false);
    }
  }
  function refresh() {
    if (!customRange) setEnd(Date.now());
    data.retry();
    health.retry();
    capabilities.retry();
    subjects.retry();
  }
  const dashboard = useMemo(() => {
    try {
      const value = new URL(import.meta.env.VITE_HIGRESS_GRAFANA_URL);
      return ['http:', 'https:'].includes(value.protocol) && !value.username && !value.password ? value.href : null;
    } catch {
      return null;
    }
  }, []);
  const queryFailed =
    data.value &&
    [
      ...Object.values(data.value.summary),
      ...Object.values(data.value.grouped),
      ...Object.values(data.value.infrastructure),
    ].some((item) => item.failed);
  return (
    <GatewayPage>
      <GatewayHeading title="gatewayObserve" description="gatewayObserveDescription">
        <Space wrap>
          {dashboard ? (
            <Button icon={<ExportOutlined aria-hidden />} href={dashboard} target="_blank" rel="noopener noreferrer">
              {t('gatewayOpenMonitoring')}
            </Button>
          ) : null}
          <Button icon={<ReloadOutlined aria-hidden />} onClick={refresh} loading={data.loading}>
            {t('gatewayQuery')}
          </Button>
        </Space>
      </GatewayHeading>
      {capabilities.error ? <GatewayLoadError retry={capabilities.retry} /> : null}
      {subjects.error ? <GatewayLoadError retry={subjects.retry} /> : null}
      {health.error ? (
        <GatewayLoadError retry={health.retry} />
      ) : (
        <Space wrap aria-label={t('gatewaySourceHealth')}>
          {health.value?.sources.map((item) => (
            <Tag
              key={item.source}
              color={item.state === 'healthy' ? 'success' : item.state === 'unavailable' ? 'error' : 'default'}
            >
              {item.source}:{' '}
              {t(
                item.state === 'healthy'
                  ? 'gatewayHealthy'
                  : item.state === 'unavailable'
                    ? 'gatewayUnavailable'
                    : 'gatewayDisabled',
              )}
            </Tag>
          ))}
        </Space>
      )}
      <Row gutter={[token.margin, token.margin]}>
        {(['team', 'role', 'user', 'model'] as const).map((dimension) => (
          <Col key={dimension} xs={24} sm={12} xl={6}>
            <GatewayField
              label={t(dimensionLabels[dimension])}
              value={filters[dimension]}
              onChange={(value) => setFilters((old) => ({ ...old, [dimension]: value }))}
              options={[{ value: '', label: t('gatewayAll') }, ...subjectOptions(subjects.value, dimension)]}
              disabled={!capabilities.value?.dimensions.includes(dimension)}
              loading={subjects.loading}
            />
          </Col>
        ))}
      </Row>
      <Row gutter={[token.margin, token.margin]}>
        <Col xs={24} sm={8}>
          <GatewayField
            label={t('gatewayPeriod')}
            value={period}
            onChange={(value) => {
              setPeriod(value);
              if (value === 'custom')
                setCustomRange([new Date(window.start).getTime(), new Date(window.end).getTime()]);
              else {
                setCustomRange(undefined);
                setEnd(Date.now());
                setRangeError(false);
              }
            }}
            options={[
              { value: '3600', label: t('gatewayLastHour') },
              { value: '21600', label: t('gatewayLastSixHours') },
              { value: '86400', label: t('gatewayLastDay') },
              { value: 'custom', label: t('gatewayCustomTime') },
            ]}
          />
        </Col>
        <Col xs={24} sm={8}>
          <GatewayField
            label={t('gatewaySampling')}
            value={step}
            onChange={setStep}
            options={[
              { value: '60', label: t('gatewayMinute') },
              { value: '300', label: t('gatewayFiveMinutes') },
              { value: '3600', label: t('gatewayHour') },
            ]}
          />
        </Col>
        <Col xs={24} sm={8}>
          <Form layout="vertical">
            <Form.Item
              label={t('gatewaySelectedTime')}
              validateStatus={rangeError ? 'error' : ''}
              help={rangeError ? t('gatewayTimeRangeInvalid') : undefined}
              style={{ marginBottom: 0 }}
            >
              <DatePicker.RangePicker
                className="gateway-time-range"
                aria-label={t('gatewaySelectedTime')}
                value={pickerRange}
                showTime
                needConfirm={false}
                format="MM-DD HH:mm"
                allowClear={false}
                maxDate={dayjs()}
                style={{ width: '100%' }}
                onChange={(values) => {
                  if (!values?.[0] || !values[1]) return;
                  const range: [number, number] = [values[0].valueOf(), values[1].valueOf()];
                  if (range[1] <= range[0] || range[1] > Date.now() || range[1] - range[0] > 31 * 86400 * 1000) {
                    setRangeError(true);
                    return;
                  }
                  setRangeError(false);
                  setCustomRange(range);
                  setPeriod('custom');
                }}
              />
            </Form.Item>
          </Form>
        </Col>
      </Row>
      <Typography.Text type="secondary">
        {t('gatewayDeployment')}: {identity?.deployment?.name ?? identity?.deploymentId ?? '—'} ·{' '}
        {new Date(window.start).toLocaleString()} — {new Date(window.end).toLocaleString()}
      </Typography.Text>
      <Alert type="info" showIcon title={t('gatewayWindowHint')} description={t('gatewayNativeOnly')} />
      {queryFailed ? <GatewayLoadError retry={data.retry} /> : null}
      <Row gutter={[token.margin, token.margin]}>
        {(['calls', 'failures', 'input_tokens', 'output_tokens'] as const).map((metric) => {
          const result = data.value?.summary[metric]?.result;
          const series = nativeSeries(result);
          return (
            <Col key={metric} xs={24} sm={12} xl={6}>
              <Card title={t(metricLabels[metric])} loading={data.loading}>
                <Typography.Title level={3}>
                  {formatGatewayNumber(series.length === 1 ? series[0]?.points.at(-1)?.value : null)}
                </Typography.Title>
                <GatewayMetricNote result={result} />
              </Card>
            </Col>
          );
        })}
      </Row>
      <Row gutter={[token.marginLG, token.marginLG]}>
        <Col xs={24} xl={12}>
          <GatewayTrend
            calls={data.value?.summary.calls?.result}
            failures={data.value?.summary.failures?.result}
            group={chartGroup}
            window={window}
            loading={data.loading}
          />
        </Col>
        <Col xs={24} xl={12}>
          <GatewayTokenTrend
            input={data.value?.summary.input_tokens?.result}
            output={data.value?.summary.output_tokens?.result}
            group={chartGroup}
            window={window}
            loading={data.loading}
          />
        </Col>
        <Col xs={24}>
          <Card title={t('gatewayCostStatistics')}>
            <Empty description={t('gatewayNotProvided')}>
              {onPrices && hasAdminPermission(identity, AdminPermission.ModelsRead) ? (
                <Button onClick={onPrices}>{t('modelPricingGoToModels')}</Button>
              ) : null}
            </Empty>
            <Typography.Text type="secondary">{t('gatewayCostSourcePending')}</Typography.Text>
          </Card>
        </Col>
      </Row>
      <Row
        className="gateway-group-header"
        justify="space-between"
        align="middle"
        gutter={[token.margin, token.marginSM]}
      >
        <Col xs={24} sm={8} lg={12}>
          <Typography.Title level={5} style={{ margin: 0 }}>
            {t('gatewayGroups')}
          </Typography.Title>
        </Col>
        <Col xs={24} sm={16} lg={12} xl={8}>
          <GatewayField
            layout="horizontal"
            label={t('gatewayGroupBy')}
            value={group}
            onChange={(value) => setGroup(value as GatewayDimension)}
            options={(['user', 'team', 'role', 'model'] as const)
              .filter((value) => capabilities.value?.dimensions.includes(value))
              .map((value) => ({ value, label: t(dimensionLabels[value]) }))}
            disabled={!capabilities.value}
          />
        </Col>
      </Row>
      <Table
        aria-label={t('gatewayGroups')}
        rowKey="key"
        loading={data.loading}
        dataSource={rows}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: t('gatewayNoData') }}
        columns={[
          { title: t(dimensionLabels[group]), dataIndex: 'id', render: (id: string) => label(group, id) },
          ...usageMetrics.map((metric) => ({
            title: t(metricLabels[metric]),
            key: metric,
            render: (_: unknown, row: (typeof rows)[number]) => formatGatewayNumber(row.samples[metric]),
          })),
          { title: t('gatewayEstimatedCost'), render: () => t('gatewayNotProvided') },
        ]}
      />
      <Space orientation="vertical">
        {usageMetrics.map((metric) => (
          <GatewayMetricNote key={metric} result={data.value?.grouped[metric]?.result} />
        ))}
        <Typography.Text type="secondary">{t('gatewayAttributionHint')}</Typography.Text>
      </Space>
      <Typography.Title level={5} style={{ margin: 0 }}>
        {t('gatewayInfrastructure')}
      </Typography.Title>
      <Typography.Text type="secondary">{t('gatewayInfrastructureScope')}</Typography.Text>
      <Row gutter={[token.margin, token.margin]}>
        {infrastructureMetrics.map((metric) => {
          const result = data.value?.infrastructure[metric]?.result;
          return (
            <Col key={metric} xs={24} md={12} xl={8}>
              <Card title={t(metricLabels[metric])} loading={data.loading}>
                {nativeSeries(result).length ? (
                  nativeSeries(result).map((series) => (
                    <div key={series.key}>
                      <Typography.Text>
                        {series.labels.status ? `HTTP ${series.labels.status}: ` : ''}
                        {formatGatewayNumber(series.points.at(-1)?.value)}
                      </Typography.Text>
                    </div>
                  ))
                ) : (
                  <Typography.Text>{t('gatewayNotProvided')}</Typography.Text>
                )}
                <GatewayMetricNote result={result} />
              </Card>
            </Col>
          );
        })}
      </Row>
      {canReadRequests ? (
        <>
          <Row
            className="gateway-error-header"
            justify="space-between"
            align="middle"
            gutter={[token.margin, token.marginSM]}
          >
            <Col xs={24} lg={8}>
              <Typography.Title level={5} style={{ margin: 0 }}>
                {t('gatewayErrors')}
              </Typography.Title>
            </Col>
            <Col xs={24} lg={16} xl={12}>
              <Row align="middle" gutter={[token.margin, token.marginSM]}>
                <Col xs={24} sm={12}>
                  <Space>
                    <Switch aria-label={t('gatewayErrorsOnly')} checked={errorsOnly} onChange={setErrorsOnly} />
                    <Typography.Text>{t('gatewayErrorsOnly')}</Typography.Text>
                  </Space>
                </Col>
                <Col xs={24} sm={12}>
                  <GatewayField
                    layout="horizontal"
                    label={t('gatewayErrorSource')}
                    value={source}
                    onChange={(value) => setSource(value as typeof source)}
                    options={[
                      { value: 'all', label: t('gatewayAllSources') },
                      { value: 'gateway', label: t('modelGateway') },
                      { value: 'authorizer', label: t('gatewayAuthSource') },
                    ]}
                  />
                </Col>
              </Row>
            </Col>
          </Row>
          {data.value?.logsFailed ? <GatewayLoadError retry={data.retry} /> : null}
          {!capabilities.value?.sources.loki && !capabilities.loading ? (
            <Alert showIcon type="warning" title={t('gatewayLogsUnavailable')} />
          ) : null}
          <Table
            aria-label={t('gatewayErrors')}
            rowKey="key"
            loading={data.loading}
            dataSource={visibleRecords}
            scroll={{ x: 'max-content' }}
            locale={{ emptyText: t('gatewayNoErrors') }}
            columns={[
              {
                title: t('gatewayTimeRequest'),
                render: (_: unknown, row: GatewayLogRow) => (
                  <>
                    {logTime(row)}
                    <br />
                    <Typography.Text>{row.fields.request_id || '—'}</Typography.Text>
                  </>
                ),
              },
              {
                title: t('gatewayCallerModel'),
                render: (_: unknown, row: GatewayLogRow) => (
                  <>
                    {label('user', row.fields.user_id ?? '')}
                    <br />
                    {label('model', row.fields.model_id ?? '')}
                  </>
                ),
              },
              {
                title: t('gatewayTeamRole'),
                render: (_: unknown, row: GatewayLogRow) => (
                  <>
                    {memberships(row.fields.team_ids ?? '')
                      .map((id) => label('team', id))
                      .join(', ') || '—'}
                    <br />
                    {memberships(row.fields.role_ids ?? '')
                      .map((id) => label('role', id))
                      .join(', ') || '—'}
                  </>
                ),
              },
              {
                title: t('gatewayErrorOrigin'),
                render: (_: unknown, row: GatewayLogRow) => (
                  <>
                    {`HTTP ${row.fields.status || '—'}`}
                    <br />
                    {row.source === 'authorizer'
                      ? t('gatewayAuthSource')
                      : row.source === 'gateway'
                        ? t('modelGateway')
                        : '—'}
                    <br />
                    {row.fields.response_flags || '—'}
                  </>
                ),
              },
              {
                title: t('gatewayAction'),
                render: (_: unknown, row: GatewayLogRow) => (
                  <Button type="link" disabled={!row.fields.request_id} onClick={() => void openDetail(row)}>
                    {t('gatewayDetails')}
                  </Button>
                ),
              },
            ]}
          />
          <Typography.Text type="secondary">{t('gatewayRequestPageHint')}</Typography.Text>
          {moreFailed ? <GatewayLoadError retry={() => void nextPage()} /> : null}
          {hasMore ? (
            <Button loading={moreLoading} disabled={data.loading} onClick={() => void nextPage()}>
              {t('gatewayMoreRequests')}
            </Button>
          ) : null}
          <Drawer
            title={t('gatewayRequestDetails')}
            open={Boolean(detail)}
            onClose={() => {
              detailRevision.current++;
              setDetail(undefined);
            }}
            loading={detailLoading}
          >
            {detailFailed ? (
              <Alert showIcon type="error" title={t('gatewayDetailFailed')} />
            ) : detail ? (
              <Descriptions
                column={1}
                items={[
                  { key: 'request', label: t('gatewayRequestId'), children: detail.fields.request_id },
                  { key: 'time', label: t('gatewayTime'), children: logTime(detail) },
                  { key: 'model', label: t('gatewayModel'), children: label('model', detail.fields.model_id ?? '') },
                  { key: 'user', label: t('gatewayUser'), children: label('user', detail.fields.user_id ?? '') },
                  {
                    key: 'teams',
                    label: t('gatewayAtCallTeam'),
                    children:
                      memberships(detail.fields.team_ids ?? '')
                        .map((id) => label('team', id))
                        .join(', ') || '—',
                  },
                  {
                    key: 'roles',
                    label: t('gatewayAtCallRole'),
                    children:
                      memberships(detail.fields.role_ids ?? '')
                        .map((id) => label('role', id))
                        .join(', ') || '—',
                  },
                  {
                    key: 'status',
                    label: t('gatewayError'),
                    children: `HTTP ${detail.fields.status || '—'} ${detail.fields.response_flags || ''}`,
                  },
                  ...(['input_token', 'output_token', 'llm_first_token_duration', 'llm_service_duration'] as const).map(
                    (field) => ({
                      key: field,
                      label: t(
                        field === 'input_token'
                          ? 'gatewayInputTokens'
                          : field === 'output_token'
                            ? 'gatewayOutputTokens'
                            : field === 'llm_first_token_duration'
                              ? 'gatewayFirstTokenMean'
                              : 'gatewayServiceMean',
                      ),
                      children: detail.fields[field] || t('gatewayNotProvided'),
                    }),
                  ),
                ]}
              />
            ) : null}
          </Drawer>
        </>
      ) : (
        <Alert showIcon type="info" title={t('gatewayLogsForbidden')} />
      )}
    </GatewayPage>
  );
}
