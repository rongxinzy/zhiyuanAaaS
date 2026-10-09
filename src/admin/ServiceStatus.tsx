import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { type ReactNode, useCallback, useEffect, useState } from 'react';

import type { AdminConsoleClient } from './client.js';
import { type AdminLanguage, translate } from './i18n.js';
import { KnowledgeManagement } from './KnowledgeManagement.js';
import {
  PortalClient,
  type PortalKnowledgeStatus,
  type PortalMemorySearchResult,
  type PortalMemoryStatus,
} from './portal.js';
import { servicesT } from './services-copy.js';

const language: AdminLanguage = 'zh';
const t = (key: Parameters<typeof servicesT>[0]): string => servicesT(key, language);

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatClock(date: Date | null): string {
  if (!date) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// Only plain http(s) URLs reported by the portal become external links;
// anything else (empty, javascript:, relative cluster path, …) yields no
// link at all rather than a guessed or unsafe handoff.
function safeExternalURL(raw: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function useResolvedPortal(client: AdminConsoleClient, portal?: PortalClient): PortalClient {
  const [resolved] = useState(() => portal ?? new PortalClient(() => client.getAccessToken()));
  return resolved;
}

// ---------------------------------------------------------------------------
// ServicesView — system service status. The two real probes (memory and
// knowledge reachability) live here; runtime/gateway have no probe API and
// say so instead of inventing a green check.
// ---------------------------------------------------------------------------

interface ProbeState<T> {
  readonly loading: boolean;
  readonly error: string | null;
  readonly result: T | null;
  readonly checkedAt: Date | null;
}

const initialProbe = { loading: true, error: null, result: null, checkedAt: null } as const;

export function ServicesView({
  client,
  portal,
}: {
  readonly client: AdminConsoleClient;
  /** Test seam: injected portal helpers (defaults to a bearer client). */
  readonly portal?: PortalClient | undefined;
}) {
  const resolvedPortal = useResolvedPortal(client, portal);
  const [memory, setMemory] = useState<ProbeState<PortalMemoryStatus>>(initialProbe);
  const [knowledge, setKnowledge] = useState<ProbeState<PortalKnowledgeStatus>>(initialProbe);
  const [detailKey, setDetailKey] = useState<'memory' | 'knowledge' | null>(null);

  const checkMemory = useCallback(async () => {
    setMemory({ ...initialProbe, loading: true });
    try {
      const result = await resolvedPortal.memoryStatus();
      setMemory({ loading: false, error: null, result, checkedAt: new Date() });
    } catch (cause) {
      setMemory({
        loading: false,
        error: cause instanceof Error ? cause.message : String(cause),
        result: null,
        checkedAt: new Date(),
      });
    }
  }, [resolvedPortal]);

  const checkKnowledge = useCallback(async () => {
    setKnowledge({ ...initialProbe, loading: true });
    try {
      const result = await resolvedPortal.knowledgeStatus();
      setKnowledge({ loading: false, error: null, result, checkedAt: new Date() });
    } catch (cause) {
      setKnowledge({
        loading: false,
        error: cause instanceof Error ? cause.message : String(cause),
        result: null,
        checkedAt: new Date(),
      });
    }
  }, [resolvedPortal]);

  useEffect(() => {
    void checkMemory();
    void checkKnowledge();
  }, [checkMemory, checkKnowledge]);

  interface ServiceRow {
    readonly key: 'memory' | 'knowledge' | 'runtime' | 'gateway';
    readonly name: string;
    readonly result: ReactNode;
    readonly impact: ReactNode;
    readonly lastCheck: string;
    readonly actions: ReactNode;
  }

  const probeResultTag = (healthy: boolean) =>
    healthy ? <Tag color="success">{t('servicesResultOk')}</Tag> : <Tag color="error">{t('servicesResultBad')}</Tag>;

  const rows: readonly ServiceRow[] = [
    {
      key: 'memory',
      name: t('svcMemory'),
      result: memory.loading ? (
        <Tag>{translate(language, 'statusLoading')}</Tag>
      ) : memory.error ? (
        <Tooltip title={memory.error}>
          <Tag color="error">{t('servicesResultFailed')}</Tag>
        </Tooltip>
      ) : memory.result ? (
        probeResultTag(memory.result.healthy)
      ) : (
        <Tag>{t('notProvided')}</Tag>
      ),
      impact: memory.error ? (
        <Typography.Text type="secondary">{memory.error}</Typography.Text>
      ) : memory.result ? (
        memory.result.healthy ? (
          t('impactMemoryOk')
        ) : (
          t('impactMemoryBad')
        )
      ) : (
        '—'
      ),
      lastCheck: formatClock(memory.checkedAt),
      actions: (
        <Space size={0}>
          <Button type="link" size="small" loading={memory.loading} onClick={() => void checkMemory()}>
            {t('servicesRecheck')}
          </Button>
          <Button
            type="link"
            size="small"
            disabled={!memory.result && !memory.error}
            onClick={() => setDetailKey('memory')}
          >
            {t('servicesDetail')}
          </Button>
        </Space>
      ),
    },
    {
      key: 'knowledge',
      name: t('svcKnowledge'),
      result: knowledge.loading ? (
        <Tag>{translate(language, 'statusLoading')}</Tag>
      ) : knowledge.error ? (
        <Tooltip title={knowledge.error}>
          <Tag color="error">{t('servicesResultFailed')}</Tag>
        </Tooltip>
      ) : knowledge.result ? (
        probeResultTag(knowledge.result.healthy)
      ) : (
        <Tag>{t('notProvided')}</Tag>
      ),
      impact: knowledge.error ? (
        <Typography.Text type="secondary">{knowledge.error}</Typography.Text>
      ) : knowledge.result ? (
        knowledge.result.healthy ? (
          t('impactKnowledgeOk')
        ) : (
          t('impactKnowledgeBad')
        )
      ) : (
        '—'
      ),
      lastCheck: formatClock(knowledge.checkedAt),
      actions: (
        <Space size={0}>
          <Button type="link" size="small" loading={knowledge.loading} onClick={() => void checkKnowledge()}>
            {t('servicesRecheck')}
          </Button>
          <Button
            type="link"
            size="small"
            disabled={!knowledge.result && !knowledge.error}
            onClick={() => setDetailKey('knowledge')}
          >
            {t('servicesDetail')}
          </Button>
        </Space>
      ),
    },
    {
      key: 'runtime',
      name: t('svcRuntime'),
      result: <Tag>{t('servicesNoProbe')}</Tag>,
      impact: <Typography.Text type="secondary">{t('impactNoProbe')}</Typography.Text>,
      lastCheck: '—',
      actions: <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      key: 'gateway',
      name: t('svcGateway'),
      result: <Tag>{t('servicesNoProbe')}</Tag>,
      impact: <Typography.Text type="secondary">{t('impactNoProbe')}</Typography.Text>,
      lastCheck: '—',
      actions: <Typography.Text type="secondary">—</Typography.Text>,
    },
  ];

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Typography.Title level={4} style={{ marginBottom: 4 }}>
            {t('servicesTitle')}
          </Typography.Title>
          <Typography.Text type="secondary">{t('servicesDescription')}</Typography.Text>
        </div>
        <Button
          icon={<ReloadOutlined />}
          loading={memory.loading || knowledge.loading}
          onClick={() => {
            void checkMemory();
            void checkKnowledge();
          }}
        >
          {translate(language, 'statusRefresh')}
        </Button>
      </div>

      <Table
        rowKey="key"
        size="middle"
        dataSource={rows}
        pagination={false}
        columns={[
          { title: t('servicesColService'), dataIndex: 'name', key: 'name' },
          {
            title: t('servicesColResult'),
            key: 'result',
            width: 130,
            render: (_: unknown, row: ServiceRow) => row.result,
          },
          { title: t('servicesColImpact'), key: 'impact', render: (_: unknown, row: ServiceRow) => row.impact },
          {
            title: t('servicesColLastCheck'),
            key: 'lastCheck',
            width: 110,
            render: (_: unknown, row: ServiceRow) => row.lastCheck,
          },
          {
            title: t('servicesColActions'),
            key: 'actions',
            align: 'right' as const,
            render: (_: unknown, row: ServiceRow) => row.actions,
          },
        ]}
      />

      <Drawer open={detailKey !== null} onClose={() => setDetailKey(null)} size={520} title={t('memoryTechnicalTitle')}>
        {detailKey === 'memory' ? (
          <Descriptions
            column={1}
            bordered
            size="small"
            items={[
              ...(memory.result
                ? [
                    // Internal cluster URLs are not browser-reachable — show only health + account.
                    { key: 'account', label: t('labelAccount'), children: memory.result.account || t('notProvided') },
                    { key: 'accounts', label: t('labelAccountCount'), children: memory.result.accounts.length },
                    { key: 'employees', label: t('labelEmployeeCount'), children: memory.result.employees.length },
                    {
                      key: 'healthy',
                      label: t('servicesColResult'),
                      children: memory.result.healthy ? t('servicesResultOk') : t('servicesResultBad'),
                    },
                  ]
                : []),
              ...(memory.error
                ? [{ key: 'error', label: translate(language, 'statusUnhealthy'), children: memory.error }]
                : []),
              {
                key: 'checkedAt',
                label: t('labelCheckedAt'),
                children: formatDateTime(memory.checkedAt?.toISOString() ?? null),
              },
            ]}
          />
        ) : detailKey === 'knowledge' ? (
          <Descriptions
            column={1}
            bordered
            size="small"
            items={[
              ...(knowledge.result
                ? [
                    {
                      // Browser-facing console proxy URL (cluster-internal
                      // addresses never reach the console).
                      key: 'url',
                      label: t('labelServiceUrl'),
                      children:
                        safeExternalURL(knowledge.result.uiURL ?? '') ?? translate(language, 'knowledgeNotConfigured'),
                    },
                    { key: 'count', label: t('labelKnowledgeCount'), children: knowledge.result.knowledgeBases.length },
                    {
                      key: 'healthy',
                      label: t('servicesColResult'),
                      children: knowledge.result.healthy ? t('servicesResultOk') : t('servicesResultBad'),
                    },
                  ]
                : []),
              ...(knowledge.error
                ? [{ key: 'error', label: translate(language, 'statusUnhealthy'), children: knowledge.error }]
                : []),
              {
                key: 'checkedAt',
                label: t('labelCheckedAt'),
                children: formatDateTime(knowledge.checkedAt?.toISOString() ?? null),
              },
            ]}
          />
        ) : null}
      </Drawer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MemoryView — business statistics for long-term memory. Used standalone and
// embedded (scoped to one employee) by the digital-employee detail tabs.
// `lastActive` is activity, never presented as "last memory write".
// ---------------------------------------------------------------------------

export function MemoryView({
  client,
  portal,
  employee,
}: {
  readonly client: AdminConsoleClient;
  /** Test seam: injected portal helpers (defaults to a bearer client). */
  readonly portal?: PortalClient | undefined;
  /** Scope the view to a single digital employee (detail-tab embedding). */
  readonly employee?: { readonly name: string; readonly memoryUser: string } | undefined;
}) {
  const resolvedPortal = useResolvedPortal(client, portal);
  const [status, setStatus] = useState<PortalMemoryStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await resolvedPortal.memoryStatus());
    } catch (cause) {
      setStatus(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [resolvedPortal]);

  useEffect(() => {
    void load();
  }, [load]);

  const scoped = employee
    ? (status?.employees ?? []).find(
        (item) => (employee.memoryUser && item.memoryUser === employee.memoryUser) || item.name === employee.name,
      )
    : null;

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        {!employee ? (
          <Typography.Title level={5} style={{ margin: 0 }}>
            {t('memoryTitle')}
          </Typography.Title>
        ) : null}
        <Alert
          type="error"
          showIcon
          title={`${translate(language, 'statusUnhealthy')}：${error}`}
          // Retry stays available in every mode, including the embedded
          // employee-detail tab — a failed probe must be directly retriable.
          action={
            <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
              {translate(language, 'statusRefresh')}
            </Button>
          }
        />
        <Typography.Text type="secondary">{t('memoryServiceStatusHint')}</Typography.Text>
      </div>
    );
  }

  if (!status) {
    return <Typography.Text type="secondary">{translate(language, 'statusLoading')}</Typography.Text>;
  }

  if (employee) {
    return (
      <div className="flex flex-col gap-4">
        <Descriptions
          bordered
          size="small"
          column={1}
          items={[
            { key: 'scope', label: t('memoryFactScope'), children: employee.memoryUser || employee.name },
            {
              key: 'sessions',
              label: t('memoryFactSessions'),
              children: scoped?.sessions ?? t('notProvided'),
            },
            {
              key: 'lastActive',
              label: t('memoryFactLastActive'),
              children: scoped?.lastActive ? formatDateTime(scoped.lastActive) : t('notProvided'),
            },
            { key: 'lastWrite', label: t('memoryFactLastWrite'), children: t('memoryLastWriteUnknown') },
          ]}
        />
        {!scoped ? <Alert type="info" showIcon title={t('memoryNotProvisioned')} /> : null}
        <Alert type="info" showIcon title={t('memorySessionsNote')} />
        <MemorySearchBox portal={resolvedPortal} employees={[employee.name]} fixed />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {translate(language, 'memoryHint')}
        </Typography.Text>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Typography.Title level={4} style={{ marginBottom: 4 }}>
          {t('memoryTitle')}
        </Typography.Title>
        <Typography.Text type="secondary">{translate(language, 'memoryDescription')}</Typography.Text>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {status.healthy ? (
          <Tag color="success">{translate(language, 'statusHealthy')}</Tag>
        ) : (
          <Tag color="error">{translate(language, 'statusUnhealthy')}</Tag>
        )}
        <Typography.Text type="secondary">{'(internal)'}</Typography.Text>
        <Typography.Text>
          {t('labelAccount')}：<Typography.Text strong>{status.account}</Typography.Text>
        </Typography.Text>
        <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
          {translate(language, 'statusRefresh')}
        </Button>
      </div>

      <div>
        <Typography.Text strong>{t('memoryAccountsTitle')}</Typography.Text>
        <Table
          rowKey="accountID"
          size="small"
          style={{ marginTop: 8 }}
          dataSource={status.accounts}
          pagination={false}
          columns={[
            { title: t('memoryColAccount'), dataIndex: 'accountID', key: 'accountID' },
            {
              title: t('memoryColUserCount'),
              dataIndex: 'userCount',
              key: 'userCount',
              render: (value: number) => `${value} ${translate(language, 'memoryUsers')}`,
            },
            {
              title: translate(language, 'memoryCreatedAt'),
              dataIndex: 'createdAt',
              key: 'createdAt',
              render: (value: string) => formatDateTime(value),
            },
          ]}
          locale={{
            emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('memoryNoAccounts')} />,
          }}
        />
      </div>

      <div>
        <Typography.Text strong>{t('memoryEmployeesTitle')}</Typography.Text>
        <Table
          rowKey="name"
          size="small"
          style={{ marginTop: 8 }}
          dataSource={status.employees}
          pagination={{ hideOnSinglePage: true }}
          columns={[
            { title: t('memoryColEmployee'), dataIndex: 'name', key: 'name' },
            { title: t('memoryColMemoryUser'), dataIndex: 'memoryUser', key: 'memoryUser' },
            {
              title: t('memoryColSessions'),
              dataIndex: 'sessions',
              key: 'sessions',
              // Absent metrics stay "not provided" — they are not zero.
              render: (value: number | undefined) => value ?? t('notProvided'),
            },
            {
              title: t('memoryColLastActive'),
              dataIndex: 'lastActive',
              key: 'lastActive',
              render: (value: string | undefined) => (value ? formatDateTime(value) : t('notProvided')),
            },
          ]}
          locale={{
            emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('memoryNoAccounts')} />,
          }}
        />
      </div>

      <MemorySearchBox portal={resolvedPortal} employees={status.employees.map((item) => item.name)} />
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {translate(language, 'memoryHint')}
      </Typography.Text>
    </div>
  );
}

function MemorySearchBox({
  portal,
  employees,
  fixed = false,
}: {
  readonly portal: PortalClient;
  readonly employees: readonly string[];
  /** Scoped mode: the employee is fixed by the embedding detail view. */
  readonly fixed?: boolean;
}) {
  const [employee, setEmployee] = useState(employees[0] ?? '');
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PortalMemorySearchResult['memories'] | null>(null);

  const run = useCallback(async () => {
    if (!employee || !query.trim()) return;
    setPending(true);
    setError(null);
    try {
      const out = await portal.memorySearch(employee, query.trim());
      setResults(out.memories);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setResults(null);
    } finally {
      setPending(false);
    }
  }, [portal, employee, query]);

  return (
    <Card size="small" title={translate(language, 'memorySearchTitle')}>
      <Space orientation="vertical" size={12} style={{ width: '100%' }}>
        <Space wrap>
          {fixed ? (
            <Typography.Text strong>{employee}</Typography.Text>
          ) : (
            <Select<string>
              style={{ minWidth: 200 }}
              value={employee || null}
              onChange={(value) => setEmployee(value ?? '')}
              placeholder={translate(language, 'memorySearchSelectEmployee')}
              options={employees.map((name) => ({ value: name, label: name }))}
              disabled={employees.length === 0}
            />
          )}
          <Input.Search
            style={{ width: 280 }}
            placeholder={translate(language, 'memorySearchPlaceholder')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onSearch={() => void run()}
            loading={pending}
            enterButton={
              <span>
                <SearchOutlined /> {translate(language, 'memorySearchButton')}
              </span>
            }
            disabled={!employee}
          />
        </Space>
        {error ? <Alert type="error" showIcon title={error} /> : null}
        {results ? (
          results.length === 0 ? (
            <Typography.Text type="secondary">{translate(language, 'memorySearchNoResults')}</Typography.Text>
          ) : (
            // List is deprecated in antd v6; a plain stacked layout keeps
            // the same result cards without the deprecated component.
            <div className="flex w-full flex-col gap-2">
              {results.map((memory) => (
                <div
                  key={memory.uri}
                  style={{ border: '1px solid var(--ant-color-border-secondary, #eee)', borderRadius: 6, padding: 12 }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <Typography.Text code>{memory.uri}</Typography.Text>
                    <Typography.Text type="secondary">{memory.score.toFixed(2)}</Typography.Text>
                  </div>
                  <Typography.Paragraph
                    style={{ marginTop: 4, marginBottom: 0 }}
                    ellipsis={{ rows: 3, expandable: true }}
                  >
                    {memory.abstract}
                  </Typography.Paragraph>
                </div>
              ))}
            </div>
          )
        ) : null}
      </Space>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// KnowledgeView keeps the existing shell route and delegates management to
// the portal's fixed, tenant-managed knowledge API.
// ---------------------------------------------------------------------------

export function KnowledgeView({
  client,
  portal,
}: {
  readonly client: AdminConsoleClient;
  /** Test seam: injected portal helpers (defaults to a bearer client). */
  readonly portal?: PortalClient | undefined;
}) {
  const resolvedPortal = useResolvedPortal(client, portal);
  return <KnowledgeManagement portal={resolvedPortal} />;
}
