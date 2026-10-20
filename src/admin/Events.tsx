import type { AdminControlEvent } from '@aep/sdk-node';
import {
  Alert,
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  Result,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useRef, useState } from 'react';
import { auditCopy as c } from './audit-copy.js';
import { auditCodeLabel, deliveryStateLabel, objectText, resultLabel } from './audit-labels.js';
import {
  type AuditDirectory,
  actorProblemText,
  resolveActorFilter,
  UserCell,
  userLabel,
  useUserDirectory,
} from './audit-user.js';
import { AuditDetail, type AuditDetailRow, codeCell, reasonCell, resultCell, shown, timeCell } from './audit-view.js';
import {
  type AdminAuditFilters,
  type AdminAuditRecord,
  type AdminAuditTimeRange,
  type AdminAuthenticationAuditRecord,
  type AdminConsoleClient,
  type AdminDeliveryRecord,
  type AdminEventRecord,
  AdminPermission,
  AdminRequestError,
  hasAdminPermission,
} from './client.js';
/** 2026-09-30 LiXiang2019 列表查询按钮组（查询/重置/导出） */
import { ListQueryActions } from './components/ListQueryActions.js';
import type { AuditTabItem, EventsProps } from './events-types.js';
import { KnowledgeAudit } from './KnowledgeAudit.js';
import { shellCopy } from './shell-copy.js';

type TabProps = { readonly client: AdminConsoleClient; readonly directory: AuditDirectory };

/** 各筛选下拉只接受服务端真正支持的取值，文案一律走共用映射。 */
const telemetryResults = ['success', 'failure', 'info'] as const;
const loginResults = ['success', 'failure', 'denied'] as const;
const operationResults = ['success', 'failure'] as const;
/** 登录事件码的下拉选项：值保持原始码，文案走共用映射。 */
const loginEventOptions = ['login.succeeded', 'login.failed', 'login.throttled', 'password.changed'].map((value) => ({
  value,
  label: auditCodeLabel(value) ?? value,
}));

/** 结果下拉选项：发给后端的值保持原样，界面文案走共用映射。 */
function resultOptions(values: readonly string[]) {
  return values.map((value) => ({ value, label: resultLabel(value) ?? value }));
}

/** 投递状态汇总：控管事件只带各状态条数，一条都没有时如实写「未记录」。 */
function deliveryRollup(summary?: AdminControlEvent['deliverySummary']) {
  const parts = summary
    ? Object.entries(summary)
        .filter(([, count]) => count > 0)
        .map(([state, count]) => `${deliveryStateLabel(state) ?? state} ${count}`)
    : [];
  return parts.length > 0 ? parts.join(' · ') : c.deliveryUnknown;
}

export function Events({ client, identity, initialTab = 'operations', knowledgeBaseId }: EventsProps) {
  // 遥测（events.read）和管理审计（audit.read）是两套模型、两套权限，逐 tab 门控：
  // 无权限的 tab 不出现，而不是摆一个 403 占位；默认落第一个可用 tab。
  const canReadTelemetry = hasAdminPermission(identity, AdminPermission.EventsRead);
  const canReadAudit = hasAdminPermission(identity, AdminPermission.AuditRead);
  // 用户目录在页面级只拉一次，三个审计页签共用；没有审计权限就不碰这个接口。
  const directory = useUserDirectory(client, canReadAudit);
  const [tab, setTab] = useState(initialTab);
  useEffect(() => setTab(initialTab), [initialTab, knowledgeBaseId]);
  const items: AuditTabItem[] = [
    ...(canReadTelemetry
      ? [
          {
            key: 'operations',
            label: c.operations,
            children: (
              <>
                <Typography.Paragraph type="secondary">{c.operationsHint}</Typography.Paragraph>
                <TelemetryRecords client={client} directory={directory} />
              </>
            ),
          },
          {
            key: 'execution',
            label: c.execution,
            children: <ExecutionRecords client={client} directory={directory} />,
          },
        ]
      : []),
    ...(canReadAudit
      ? [
          {
            key: 'knowledge',
            label: c.knowledge,
            children: <KnowledgeAudit client={client} directory={directory} knowledgeBaseId={knowledgeBaseId} />,
          },
          {
            key: 'login',
            label: c.login,
            children: <LoginRecords client={client} directory={directory} />,
          },
          {
            key: 'operations-log',
            label: c.opsLog,
            children: <OperationLog client={client} directory={directory} />,
          },
        ]
      : []),
  ];
  const active = items.some((item) => item.key === tab) ? tab : items[0]?.key;
  return (
    <section>
      <Typography.Title level={2}>{c.title}</Typography.Title>
      <Typography.Paragraph type="secondary">{c.hint}</Typography.Paragraph>
      {active ? (
        <Tabs activeKey={active} onChange={setTab} destroyOnHidden items={items} />
      ) : (
        <Result status="403" title={shellCopy.forbidden} />
      )}
    </section>
  );
}

/** 业务遥测事件表：数据来自 `/admin/events`，不是管理审计。 */
function TelemetryRecords({ client, directory }: TabProps) {
  const [form] = Form.useForm<{ type?: string; actor?: string; result?: string }>();
  const [filters, setFilters] = useState<TelemetryFilters>({});
  const [actorProblem, setActorProblem] = useState<string | null>(null);
  const [rows, setRows] = useState<readonly AdminEventRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<AdminEventRecord | null>(null);
  const [revision, refresh] = useState(0);
  const requestVersion = useRef(0);
  useEffect(() => {
    requestVersion.current += 1;
    let live = true;
    setLoading(true);
    setError(false);
    setRows([]);
    setCursor(null);
    void client
      .searchAudit({ ...filters, limit: 50 })
      .then((page) => {
        if (live) {
          setRows(page.items);
          setCursor(page.nextCursor);
        }
      })
      .catch(() => {
        if (live) setError(true);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [client, filters, revision]);
  const more = async () => {
    if (!cursor || loading) return;
    const version = requestVersion.current;
    setLoading(true);
    setError(false);
    try {
      const page = await client.searchAudit({ ...filters, cursor, limit: 50 });
      if (version !== requestVersion.current) return;
      setRows((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch {
      if (version === requestVersion.current) setError(true);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  };
  return (
    <>
      <Form form={form} layout="inline" style={{ gap: 12, marginBottom: 20 }}>
        <Form.Item name="type" label={c.type} extra={c.typeHint}>
          <Input allowClear placeholder={c.typePlaceholder} />
        </Form.Item>
        <Form.Item name="actor" label={c.user}>
          <Input allowClear placeholder={c.userPlaceholder} />
        </Form.Item>
        <Form.Item name="result" label={c.result}>
          <Select
            allowClear
            style={{ width: 130 }}
            placeholder={c.allResults}
            options={resultOptions(telemetryResults)}
          />
        </Form.Item>
        {/* 2026-09-30 LiXiang2019 审计筛选区接入查询/重置按钮组 */}
        <ListQueryActions
          form={form}
          searching={loading}
          showReset
          search={{
            run: async (values) => {
              const actor = await resolveActorFilter(values.actor, directory);
              if (actor && 'problem' in actor) {
                // 解析不出来就不发请求：后端按 userId 精确匹配，姓名发出去永不命中。
                setActorProblem(actorProblemText(actor.problem, actor.name));
                return;
              }
              setActorProblem(null);
              const next: TelemetryFilters = {};
              if (values.type?.trim()) next.type = values.type.trim();
              if (actor) next.userId = actor.userId;
              if (values.result) next.result = values.result;
              setFilters(next);
            },
          }}
          onReset={() => {
            setActorProblem(null);
            setFilters({});
          }}
        />
        <Button onClick={() => refresh((n) => n + 1)}>{c.refresh}</Button>
      </Form>
      {actorProblem && <Alert type="warning" showIcon title={actorProblem} style={{ marginBottom: 20 }} />}
      {error && <Alert type="error" showIcon title={c.failed} style={{ marginBottom: 16 }} />}
      <Table
        loading={loading}
        dataSource={rows.map((row, index) => ({
          ...row,
          key: row.eventId ?? `record-${index}`,
        }))}
        rowKey="key"
        pagination={false}
        scroll={{ x: 800 }}
        locale={{
          emptyText: error ? c.failed : filters.type ? c.typeExactEmpty.replace('{type}', filters.type) : c.empty,
        }}
        columns={[
          { title: c.user, render: (_, row) => <UserCell userId={row.userId} users={directory.users} /> },
          { title: c.eventTime, render: (_, row) => timeCell(row.receivedAt ?? row.createdAt) },
          { title: c.type, dataIndex: 'type', render: (value: string) => codeCell(value) },
          { title: c.object, render: (_, row) => shown(objectText(row.resourceType, row.resourceId)) },
          { title: c.result, dataIndex: 'result', render: (value: string) => resultCell(value) },
          {
            title: c.details,
            render: (_, row) => (
              <Button type="link" onClick={() => setSelected(row)}>
                {c.details}
              </Button>
            ),
          },
        ]}
      />
      {cursor && (
        <Button loading={loading} onClick={() => void more()} style={{ marginTop: 16 }}>
          {c.more}
        </Button>
      )}
      <Drawer title={c.detailTitle} open={Boolean(selected)} onClose={() => setSelected(null)} size={560}>
        <Alert type="info" title={c.scopeNote} style={{ marginBottom: 20 }} />
        {selected && (
          <AuditDetail
            overview={[
              { key: 'time', label: c.eventTime, children: timeCell(selected.receivedAt ?? selected.createdAt) },
              { key: 'user', label: c.user, children: <UserCell userId={selected.userId} users={directory.users} /> },
              { key: 'type', label: c.type, children: codeCell(selected.type) },
              {
                key: 'object',
                label: c.object,
                children: shown(objectText(selected.resourceType, selected.resourceId)),
              },
              { key: 'result', label: c.result, children: resultCell(selected.result) },
            ]}
            changes={null}
            technical={[
              { key: 'eventId', label: c.eventId, children: shown(selected.eventId) },
              { key: 'type', label: c.type, children: shown(selected.type) },
              { key: 'userId', label: c.userId, children: shown(selected.userId) },
              { key: 'resourceType', label: c.resourceType, children: shown(selected.resourceType) },
              { key: 'resourceId', label: c.resourceId, children: shown(selected.resourceId) },
              { key: 'receivedAt', label: c.eventTime, children: shown(selected.receivedAt ?? selected.createdAt) },
            ]}
          />
        )}
      </Drawer>
    </>
  );
}

type TelemetryFilters = { type?: string; userId?: string; result?: string };

function ExecutionRecords({ client, directory }: TabProps) {
  const [rows, setRows] = useState<readonly AdminControlEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [revision, refresh] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<readonly AdminDeliveryRecord[]>([]);
  const [deliveryError, setDeliveryError] = useState(false);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [deliveryRevision, retry] = useState(0);
  const [deliveryCursor, setDeliveryCursor] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(false);
    void client
      .controlEvents({ limit: 50 })
      .then((page) => {
        if (live) {
          setRows(page.items);
          setCursor(page.nextCursor);
        }
      })
      .catch(() => {
        if (live) setError(true);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [client, revision]);
  useEffect(() => {
    if (!selected) return;
    let live = true;
    setDeliveries([]);
    setDeliveryCursor(null);
    setDeliveryLoading(true);
    setDeliveryError(false);
    void client
      .deliverySummary(selected, { limit: 50 })
      .then((page) => {
        if (live) {
          setDeliveries(page.items);
          setDeliveryCursor(page.nextCursor);
        }
      })
      .catch(() => {
        if (live) setDeliveryError(true);
      })
      .finally(() => {
        if (live) setDeliveryLoading(false);
      });
    return () => {
      live = false;
    };
  }, [client, selected, deliveryRevision]);
  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Typography.Text type="secondary">{c.executionHint}</Typography.Text>
        <Button onClick={() => refresh((n) => n + 1)}>{c.refresh}</Button>
      </Space>
      {error && <Alert type="error" title={c.failed} />}
      <Table
        loading={loading}
        rowKey="eventId"
        dataSource={[...rows]}
        pagination={false}
        scroll={{ x: 960 }}
        columns={[
          {
            title: c.user,
            dataIndex: 'createdBy',
            render: (value?: string) => <UserCell userId={value} users={directory.users} />,
          },
          { title: c.eventTime, dataIndex: 'createdAt', render: (value?: string) => timeCell(value) },
          { title: c.eventType, dataIndex: 'type', render: (value: string) => codeCell(value) },
          { title: c.object, render: (_, row) => shown(objectText(row.resource?.type, row.resource?.id)) },
          { title: c.deliveryState, render: (_, row) => deliveryRollup(row.deliverySummary) },
          // 控制面只在投递记录上给尝试次数，控制事件本身没有这个字段。
          { title: c.attempts, render: () => c.attemptsUnavailable },
          {
            title: c.details,
            render: (_, row) => (
              <Button type="link" onClick={() => setSelected(row.eventId)}>
                {c.delivery}
              </Button>
            ),
          },
        ]}
      />
      {cursor && (
        <Button
          loading={loading}
          onClick={async () => {
            setLoading(true);
            setError(false);
            try {
              const next = await client.controlEvents({ cursor, limit: 50 });
              setRows((current) => [...current, ...next.items]);
              setCursor(next.nextCursor);
            } catch {
              setError(true);
            } finally {
              setLoading(false);
            }
          }}
        >
          {c.more}
        </Button>
      )}
      <Drawer title={c.deliveryTitle} size={720} open={Boolean(selected)} onClose={() => setSelected(null)}>
        {deliveryError && (
          <Alert
            type="error"
            title={c.deliveryError}
            action={<Button onClick={() => retry((n) => n + 1)}>{c.refresh}</Button>}
            style={{ marginBottom: 16 }}
          />
        )}
        <Table
          loading={deliveryLoading}
          dataSource={[...deliveries]}
          rowKey="deliveryId"
          pagination={false}
          locale={{
            emptyText: deliveryError ? (
              c.deliveryError
            ) : (
              <Space orientation="vertical" size={4}>
                <Typography.Text type="secondary">{c.deliveryEmpty}</Typography.Text>
                <Typography.Text type="secondary">{c.deliveryEmptyHint}</Typography.Text>
              </Space>
            ),
          }}
          columns={[
            { title: c.eventId, dataIndex: 'deliveryId' },
            { title: c.state, dataIndex: 'state', render: (value: string) => <Tag>{deliveryStateLabel(value)}</Tag> },
            { title: c.attempts, dataIndex: 'attemptCount', render: (value?: number) => value ?? c.unknown },
            { title: c.completed, dataIndex: 'completedAt', render: (value?: string | null) => timeCell(value) },
          ]}
        />
        {deliveryCursor && (
          <Button
            loading={deliveryLoading}
            onClick={async () => {
              if (!selected) return;
              setDeliveryLoading(true);
              setDeliveryError(false);
              try {
                const page = await client.deliverySummary(selected, {
                  cursor: deliveryCursor,
                  limit: 50,
                });
                setDeliveries((rows) => [...rows, ...page.items]);
                setDeliveryCursor(page.nextCursor);
              } catch {
                setDeliveryError(true);
              } finally {
                setDeliveryLoading(false);
              }
            }}
          >
            {c.more}
          </Button>
        )}
      </Drawer>
    </>
  );
}

type LoginFilters = { eventType?: string; outcome?: string; userId?: string };

/** 登录审计：服务端持久化的登录成功/失败/受限与改密记录，只读。 */
function LoginRecords({ client, directory }: TabProps) {
  const [form] = Form.useForm<{ eventType?: string; outcome?: string; actor?: string }>();
  const [filters, setFilters] = useState<LoginFilters>({});
  const [actorProblem, setActorProblem] = useState<string | null>(null);
  const [rows, setRows] = useState<readonly AdminAuthenticationAuditRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [revision, refresh] = useState(0);
  const requestVersion = useRef(0);
  useEffect(() => {
    requestVersion.current += 1;
    const version = requestVersion.current;
    let live = true;
    setLoading(true);
    setError(false);
    setUnavailable(false);
    setRows([]);
    setCursor(null);
    void client
      .searchAuthenticationAudit({ ...filters, limit: 50 })
      .then((page) => {
        if (live && version === requestVersion.current) {
          setRows(page.items);
          setCursor(page.nextCursor);
        }
      })
      .catch((cause) => {
        if (!live) return;
        // An older control service has no audit endpoint yet; degrade to the
        // honest "not connected" state instead of an error.
        if (cause instanceof AdminRequestError && cause.status === 404) setUnavailable(true);
        else setError(true);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [client, filters, revision]);
  const more = async () => {
    if (!cursor || loading) return;
    const version = requestVersion.current;
    setLoading(true);
    setError(false);
    try {
      const page = await client.searchAuthenticationAudit({ ...filters, cursor, limit: 50 });
      if (version !== requestVersion.current) return;
      setRows((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch {
      if (version === requestVersion.current) setError(true);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  };
  if (unavailable) {
    return <Result status="info" title={c.loginUnavailable} />;
  }
  return (
    <>
      <Form form={form} layout="inline" style={{ gap: 12, marginBottom: 20 }}>
        <Form.Item name="eventType" label={c.loginEvent}>
          <Select allowClear style={{ width: 150 }} placeholder={c.allEvents} options={loginEventOptions} />
        </Form.Item>
        <Form.Item name="outcome" label={c.result}>
          <Select allowClear style={{ width: 130 }} placeholder={c.allResults} options={resultOptions(loginResults)} />
        </Form.Item>
        <Form.Item name="actor" label={c.user}>
          <Input allowClear placeholder={c.userPlaceholder} />
        </Form.Item>
        <ListQueryActions
          form={form}
          searching={loading}
          showReset
          search={{
            run: async (values) => {
              const actor = await resolveActorFilter(values.actor, directory);
              if (actor && 'problem' in actor) {
                setActorProblem(actorProblemText(actor.problem, actor.name));
                return;
              }
              setActorProblem(null);
              const next: LoginFilters = {};
              if (values.eventType) next.eventType = values.eventType;
              if (values.outcome) next.outcome = values.outcome;
              if (actor) next.userId = actor.userId;
              setFilters(next);
            },
          }}
          onReset={() => {
            setActorProblem(null);
            setFilters({});
          }}
        />
        <Button onClick={() => refresh((n) => n + 1)}>{c.refresh}</Button>
      </Form>
      {actorProblem && <Alert type="warning" showIcon title={actorProblem} style={{ marginBottom: 20 }} />}
      {error && <Alert type="error" showIcon title={c.failed} style={{ marginBottom: 16 }} />}
      <Table
        loading={loading}
        rowKey={(row) => row.cursor}
        dataSource={[...rows]}
        pagination={false}
        scroll={{ x: 720 }}
        locale={{ emptyText: error ? c.failed : c.empty }}
        columns={[
          {
            title: c.user,
            dataIndex: 'userId',
            render: (value?: string) => <UserCell userId={value} users={directory.users} />,
          },
          { title: c.time, dataIndex: 'createdAt', render: (value?: string) => timeCell(value) },
          // 事件码走共用映射：登记过的给中文，未登记的码原样显示。
          { title: c.loginEvent, dataIndex: 'eventType', render: (value: string) => codeCell(value) },
          { title: c.result, dataIndex: 'outcome', render: (value: string) => resultCell(value) },
          { title: c.reason, dataIndex: 'reason', render: (value?: string) => reasonCell(value) },
          {
            title: c.source,
            dataIndex: 'sourceHash',
            render: (value?: string) => (value ? value.slice(0, 12) : c.unknown),
          },
        ]}
      />
      {cursor && (
        <Button loading={loading} onClick={() => void more()} style={{ marginTop: 16 }}>
          {c.more}
        </Button>
      )}
    </>
  );
}

type OperationFilters = {
  action?: string;
  resourceId?: string;
  actorUserId?: string;
  result?: string;
  range?: [Dayjs, Dayjs];
};

type OperationFormValues = {
  action?: string;
  resourceId?: string;
  /** 用户输入：用户名或用户 ID，提交前解析成用户 ID。 */
  actor?: string;
  result?: string;
  range?: [Dayjs, Dayjs];
};

/** 这次查询固定的生效时间边界：首屏由服务端决定，后续分页显式携带。 */
type OperationWindow = { readonly createdAfter?: string; readonly createdBefore?: string };

/**
 * 把页面筛选转换为服务端查询：显式时间范围映射为 RFC3339 的 createdAfter/createdBefore。
 * 未选范围时是否携带时间参数由调用方决定：首屏不传（交给服务端套用默认窗口），
 * 后续分页传首屏返回的生效边界 —— 服务端每次缺省都会重算 now()-7d，会让临界记录漏掉。
 */
function operationQuery(filters: OperationFilters, window: OperationWindow | null): AdminAuditFilters {
  const [from, to] = filters.range ?? [];
  const bounds = from && to ? { createdAfter: from.toISOString(), createdBefore: to.toISOString() } : window;
  return {
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.resourceId ? { resourceId: filters.resourceId } : {}),
    ...(filters.actorUserId ? { actorUserId: filters.actorUserId } : {}),
    ...(filters.result ? { result: filters.result } : {}),
    ...(bounds ?? {}),
  };
}

/**
 * 旧控制面缺少 timeRange：无法确认生效窗口，也不支持 result。
 * 确认能力后就不再发送这两类参数，页面也不把结果与时间范围写成已生效的条件。
 */
function supportedFilters(filters: OperationFilters): OperationFilters {
  return {
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.resourceId ? { resourceId: filters.resourceId } : {}),
    ...(filters.actorUserId ? { actorUserId: filters.actorUserId } : {}),
  };
}

/** 操作详情：正文展示中文概览与脱敏变更，原始码与稳定标识归入技术详情。 */
function OperationDetail({
  record,
  directory,
}: {
  readonly record: AdminAuditRecord;
  readonly directory: AuditDirectory;
}) {
  const changes = record.changes ?? null;
  const requestId = changes && typeof changes.requestId === 'string' ? changes.requestId : null;
  // 只有 before/after 才算变更载荷；仅含 requestId / note 的对象不算，避免成功单里出现「变化字段 未记录」。
  const changePayload = changes && ('before' in changes || 'after' in changes) ? changes : null;
  // 成功且无原因时不渲染原因区块；成功但带 reason 时标题用「原因」，真正失败才写「失败」。
  const failureRows =
    record.result === 'failure' || record.reason
      ? [{ key: 'reason', label: c.reason, children: reasonCell(record.reason) }]
      : null;
  const failureTitle = record.result === 'failure' ? c.failure : c.reason;
  const technical: AuditDetailRow[] = [
    // 这里是审计序号（cursor），不是请求标识；只有失败行 payload 的 requestId 才叫操作标识。
    { key: 'cursor', label: c.recordIndex, children: shown(record.cursor) },
    { key: 'action', label: c.type, children: shown(record.action) },
    { key: 'actorId', label: c.userId, children: shown(record.actorUserId) },
    { key: 'resourceType', label: c.resourceType, children: shown(record.resourceType) },
    { key: 'resourceId', label: c.resourceId, children: shown(record.resourceId) },
    { key: 'createdAt', label: c.time, children: shown(record.createdAt) },
    ...(requestId ? [{ key: 'requestId', label: c.operationId, children: requestId }] : []),
  ];
  return (
    <AuditDetail
      overview={[
        { key: 'time', label: c.time, children: timeCell(record.createdAt) },
        { key: 'user', label: c.user, children: <UserCell userId={record.actorUserId} users={directory.users} /> },
        { key: 'type', label: c.type, children: codeCell(record.action) },
        { key: 'object', label: c.object, children: shown(objectText(record.resourceType, record.resourceId)) },
        { key: 'result', label: c.result, children: resultCell(record.result) },
      ]}
      changes={changePayload}
      failure={failureRows}
      failureTitle={failureTitle}
      technical={technical}
    />
  );
}

/**
 * 操作日志：服务端采集的管理员写操作审计，只读。
 *
 * 首屏不传时间参数，由服务端套用默认窗口；拿到生效边界后固定这次查询的后续分页，
 * 避免每次翻页重算窗口而漏掉临界记录。响应里没有结构正确的 timeRange 说明控制面
 * 过旧（不返回生效窗口、不支持 result），此时进入旧后端态：提示升级、禁用这些筛选，
 * 并不再发送它们。
 */
function OperationLog({ client, directory }: TabProps) {
  const [form] = Form.useForm<OperationFormValues>();
  const [filters, setFilters] = useState<OperationFilters>({});
  const [window, setWindow] = useState<OperationWindow | null>(null);
  const [rows, setRows] = useState<readonly AdminAuditRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<AdminAuditTimeRange | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [legacy, setLegacy] = useState(false);
  const [actorProblem, setActorProblem] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminAuditRecord | null>(null);
  const [revision, refresh] = useState(0);
  const requestVersion = useRef(0);
  // 能力判断是后端属性，确认后一直保留：重新查询不能把被忽略的筛选重新放开。
  const legacyRef = useRef(false);
  useEffect(() => {
    requestVersion.current += 1;
    const version = requestVersion.current;
    let live = true;
    setLoading(true);
    setError(false);
    setUnavailable(false);
    setRows([]);
    setCursor(null);
    setWindow(null);
    setTimeRange(null);
    // 旧控制面缺少 timeRange：确认能力后不再发送结果与时间参数。
    const requested = legacyRef.current ? supportedFilters(filters) : filters;
    void client
      .searchAdminAudit({ ...operationQuery(requested, null), limit: 50 })
      .then((page) => {
        if (!live || version !== requestVersion.current) return;
        const applied = page.timeRange;
        legacyRef.current = applied === null;
        setLegacy(applied === null);
        setRows(page.items);
        setCursor(page.nextCursor);
        if (applied === null) {
          // 已应用条件里若含被忽略的筛选，连同表单一起摘掉，不假装它生效。
          if (filters.result !== undefined || filters.range !== undefined) {
            form.resetFields(['result', 'range']);
            setFilters(supportedFilters(filters));
          }
          return;
        }
        setTimeRange(applied);
        setWindow({
          ...(applied.after ? { createdAfter: applied.after } : {}),
          ...(applied.before ? { createdBefore: applied.before } : {}),
        });
      })
      .catch((cause) => {
        if (!live) return;
        // An older control service has no operations endpoint yet; degrade to
        // the honest "not connected" state instead of an error.
        if (cause instanceof AdminRequestError && cause.status === 404) setUnavailable(true);
        else setError(true);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [client, filters, form, revision]);
  const more = async () => {
    if (!cursor || loading) return;
    const version = requestVersion.current;
    setLoading(true);
    setError(false);
    try {
      // 后续页携带首屏固定的生效边界（显式范围则用用户的范围），服务端不再重算默认窗口。
      const page = await client.searchAdminAudit({ ...operationQuery(filters, window), cursor, limit: 50 });
      if (version !== requestVersion.current) return;
      setRows((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch {
      if (version === requestVersion.current) setError(true);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  };
  const rangeLabel = filters.range
    ? `${filters.range[0].format('YYYY-MM-DD HH:mm')} ~ ${filters.range[1].format('YYYY-MM-DD HH:mm')}`
    : timeRange
      ? `${timeRange.after ? dayjs(timeRange.after).format('YYYY-MM-DD HH:mm') : c.rangeUnbounded} ~ ${
          timeRange.before ? dayjs(timeRange.before).format('YYYY-MM-DD HH:mm') : c.rangeNow
        }`
      : null;
  const appliedFilters = [
    filters.actorUserId ? `${c.user}: ${userLabel(directory.users, filters.actorUserId)}` : '',
    filters.resourceId ? `${c.resourceId}: ${filters.resourceId}` : '',
    filters.action ? `${c.type}: ${auditCodeLabel(filters.action) ?? filters.action}` : '',
    filters.result ? `${c.result}: ${resultLabel(filters.result)}` : '',
    filters.range ? `${c.range}: ${rangeLabel ?? ''}` : '',
  ].filter((item) => item);
  if (unavailable) {
    return <Result status="info" title={c.opsUnavailable} />;
  }
  return (
    <>
      {legacy && (
        <Alert
          type="warning"
          showIcon
          title={c.opsLegacyTitle}
          description={c.opsLegacyDetail}
          style={{ marginBottom: 20 }}
        />
      )}
      {actorProblem && <Alert type="warning" showIcon title={actorProblem} style={{ marginBottom: 20 }} />}
      <Form form={form} layout="inline" style={{ gap: 12, marginBottom: 20 }}>
        <Form.Item name="actor" label={c.user}>
          <Input allowClear placeholder={c.userPlaceholder} />
        </Form.Item>
        <Form.Item name="resourceId" label={c.resourceId} extra={c.objectIdHint}>
          <Input allowClear />
        </Form.Item>
        <Form.Item name="action" label={c.type} extra={c.typeHint}>
          <Input allowClear placeholder={c.typePlaceholder} />
        </Form.Item>
        <Form.Item name="result" label={c.result}>
          <Select
            allowClear
            disabled={legacy}
            style={{ width: 130 }}
            placeholder={c.allResults}
            options={resultOptions(operationResults)}
          />
        </Form.Item>
        <Form.Item name="range" label={c.range}>
          <DatePicker.RangePicker showTime format="YYYY-MM-DD HH:mm" allowClear disabled={legacy} maxDate={dayjs()} />
        </Form.Item>
        <ListQueryActions
          form={form}
          searching={loading}
          showReset
          search={{
            run: async (values) => {
              const actor = await resolveActorFilter(values.actor, directory);
              if (actor && 'problem' in actor) {
                setActorProblem(actorProblemText(actor.problem, actor.name));
                return;
              }
              setActorProblem(null);
              const next: OperationFilters = {};
              if (values.action?.trim()) next.action = values.action.trim();
              if (values.resourceId?.trim()) next.resourceId = values.resourceId.trim();
              if (values.result) next.result = values.result;
              const range = values.range;
              if (range?.[0] && range[1]) next.range = [range[0], range[1]];
              if (actor) next.actorUserId = actor.userId;
              setFilters(next);
            },
          }}
          onReset={() => {
            setActorProblem(null);
            setFilters({});
          }}
        />
        <Button onClick={() => refresh((n) => n + 1)}>{c.refresh}</Button>
      </Form>
      {rangeLabel && (
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          {`${c.range}: ${rangeLabel}`}
        </Typography.Text>
      )}
      {error && (
        <Alert
          type="error"
          showIcon
          title={c.failed}
          style={{ marginBottom: 16 }}
          action={<Button onClick={() => refresh((n) => n + 1)}>{c.retry}</Button>}
        />
      )}
      <Table
        loading={loading}
        rowKey="key"
        dataSource={
          // Pages only append within a query. Keep reported rows distinct even
          // when an older service repeats a cursor and timestamp.
          rows.map((row, index) => ({ ...row, key: `${row.cursor}:${index}` }))
        }
        pagination={false}
        scroll={{ x: 880 }}
        locale={{
          emptyText: error ? (
            c.failed
          ) : (
            <Space orientation="vertical" size={4}>
              <Typography.Text type="secondary">
                {filters.action ? c.typeExactEmpty.replace('{type}', filters.action) : c.empty}
              </Typography.Text>
              {appliedFilters.length > 0 && (
                <Typography.Text type="secondary">
                  {`${c.currentFilters}: ${appliedFilters.join(' · ')}`}
                </Typography.Text>
              )}
              {appliedFilters.length > 0 && (
                <Button
                  type="link"
                  onClick={() => {
                    form.resetFields();
                    setActorProblem(null);
                    setFilters({});
                  }}
                >
                  {c.clearFilters}
                </Button>
              )}
            </Space>
          ),
        }}
        columns={[
          {
            title: c.user,
            dataIndex: 'actorUserId',
            render: (value?: string) => <UserCell userId={value} users={directory.users} />,
          },
          { title: c.time, dataIndex: 'createdAt', render: (value: string) => timeCell(value) },
          { title: c.type, dataIndex: 'action', render: (value: string) => codeCell(value) },
          { title: c.object, render: (_, row) => shown(objectText(row.resourceType, row.resourceId)) },
          { title: c.result, dataIndex: 'result', render: (value: string) => resultCell(value) },
          {
            title: c.details,
            render: (_, row) => (
              <Button type="link" onClick={() => setSelected(row)}>
                {c.details}
              </Button>
            ),
          },
        ]}
      />
      {cursor && (
        <Button loading={loading} onClick={() => void more()} style={{ marginTop: 16 }}>
          {c.more}
        </Button>
      )}
      <Drawer title={c.detailTitle} open={Boolean(selected)} onClose={() => setSelected(null)} size={560}>
        <Alert type="info" title={c.scopeNote} style={{ marginBottom: 20 }} />
        {selected && <OperationDetail record={selected} directory={directory} />}
      </Drawer>
    </>
  );
}
