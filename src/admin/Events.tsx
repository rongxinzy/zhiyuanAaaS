import type { AdminControlEvent, PlatformUser } from '@aep/sdk-node';
import {
  Alert,
  Button,
  DatePicker,
  Descriptions,
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
import { useCallback, useEffect, useRef, useState } from 'react';
import { auditCopy as c } from './audit-copy.js';
import {
  type AdminAuditFilters,
  type AdminAuditRecord,
  type AdminAuditTimeRange,
  type AdminAuthenticationAuditRecord,
  type AdminConsoleClient,
  type AdminDeliveryRecord,
  type AdminEventRecord,
  type AdminIdentity,
  AdminPermission,
  AdminRequestError,
  hasAdminPermission,
} from './client.js';
/** 2026-09-30 LiXiang2019 列表查询按钮组（查询/重置/导出） */
import { ListQueryActions } from './components/ListQueryActions.js';
import { formatTimestampSeconds } from './format.js';
import { ADMIN_LANGUAGE, translate } from './i18n.js';
import { KnowledgeAudit } from './KnowledgeAudit.js';
import { shellCopy } from './shell-copy.js';

type Filters = { type?: string; userId?: string; result?: string };
const shown = (value?: string | null) => value || c.unknown;
export function Events({
  client,
  identity,
}: {
  readonly client: AdminConsoleClient;
  readonly identity?: AdminIdentity | undefined;
}) {
  const allowed = hasAdminPermission(identity, AdminPermission.EventsRead);
  const [tab, setTab] = useState('operations');
  return (
    <section>
      <Typography.Title level={2}>{c.title}</Typography.Title>
      <Typography.Paragraph type="secondary">{c.hint}</Typography.Paragraph>
      {allowed ? (
        <Tabs
          activeKey={tab}
          onChange={setTab}
          destroyOnHidden
          items={[
            {
              key: 'operations',
              label: c.operations,
              children: <AuditRecords client={client} />,
            },
            {
              key: 'execution',
              label: c.execution,
              children: <ExecutionRecords client={client} />,
            },
            {
              key: 'knowledge',
              label: translate(ADMIN_LANGUAGE, 'knowledgeAuditTitle'),
              children: hasAdminPermission(identity, AdminPermission.AuditRead) ? (
                <KnowledgeAudit client={client} />
              ) : (
                <Result status="403" title={shellCopy.forbidden} />
              ),
            },
            {
              key: 'login',
              label: c.login,
              children: hasAdminPermission(identity, AdminPermission.AuditRead) ? (
                <LoginRecords client={client} />
              ) : (
                <Result status="403" title={shellCopy.forbidden} />
              ),
            },
            {
              key: 'operations-log',
              label: c.opsLog,
              children: hasAdminPermission(identity, AdminPermission.AuditRead) ? (
                <OperationLog client={client} />
              ) : (
                <Result status="403" title={shellCopy.forbidden} />
              ),
            },
          ]}
        />
      ) : (
        <Result status="403" title={shellCopy.forbidden} />
      )}
    </section>
  );
}

function AuditRecords({ client }: { client: AdminConsoleClient }) {
  const [form] = Form.useForm<Filters>();
  const [filters, setFilters] = useState<Filters>({});
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
        <Form.Item name="type" label={c.type}>
          <Input allowClear />
        </Form.Item>
        <Form.Item name="userId" label={c.actor}>
          <Input allowClear />
        </Form.Item>
        <Form.Item name="result" label={c.result}>
          <Select
            allowClear
            style={{ width: 130 }}
            placeholder={c.all}
            options={[
              { value: 'success', label: c.success },
              { value: 'failure', label: c.failure },
              { value: 'info', label: c.info },
            ]}
          />
        </Form.Item>
        {/* 2026-09-30 LiXiang2019 审计筛选区接入查询/重置按钮组 */}
        <ListQueryActions
          form={form}
          searching={loading}
          search={{
            run: (values) => {
              const next: Filters = {};
              if (values.type?.trim()) next.type = values.type.trim();
              if (values.userId?.trim()) next.userId = values.userId.trim();
              if (values.result) next.result = values.result;
              setFilters(next);
            },
          }}
          onReset={() => {
            setFilters({});
          }}
        />
        <Button onClick={() => refresh((n) => n + 1)}>{c.refresh}</Button>
      </Form>
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
        locale={{ emptyText: error ? c.failed : c.empty }}
        columns={[
          { title: c.type, dataIndex: 'type', render: shown },
          { title: c.actor, dataIndex: 'userId', render: shown },
          {
            title: c.object,
            render: (_, row) =>
              shown(row.resourceType ? `${row.resourceType} / ${row.resourceId ?? c.unknown}` : row.resourceId),
          },
          {
            title: c.result,
            dataIndex: 'result',
            render: (value: string) => (
              <Tag color={value === 'success' ? 'success' : value === 'failure' ? 'error' : 'default'}>
                {value === 'success' ? c.success : value === 'failure' ? c.failure : shown(value)}
              </Tag>
            ),
          },
          { title: c.time, dataIndex: 'receivedAt', render: shown },
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
          <Descriptions
            column={1}
            bordered
            items={[
              {
                key: 'id',
                label: c.eventId,
                children: shown(selected.eventId),
              },
              { key: 'type', label: c.type, children: shown(selected.type) },
              { key: 'user', label: c.actor, children: shown(selected.userId) },
              {
                key: 'resource',
                label: c.resourceId,
                children: shown(selected.resourceId),
              },
              {
                key: 'result',
                label: c.result,
                children: shown(selected.result),
              },
              {
                key: 'time',
                label: c.time,
                children: shown(selected.receivedAt),
              },
            ]}
          />
        )}
      </Drawer>
    </>
  );
}

function ExecutionRecords({ client }: { client: AdminConsoleClient }) {
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
        scroll={{ x: 640 }}
        columns={[
          { title: c.type, dataIndex: 'type' },
          { title: c.state, dataIndex: 'state' },
          { title: c.time, dataIndex: 'createdAt' },
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
          />
        )}
        <Table
          loading={deliveryLoading}
          dataSource={[...deliveries]}
          rowKey="deliveryId"
          pagination={false}
          columns={[
            { title: c.eventId, dataIndex: 'deliveryId' },
            { title: c.state, dataIndex: 'state' },
            { title: c.attempts, dataIndex: 'attemptCount' },
            { title: c.completed, dataIndex: 'completedAt', render: shown },
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
function LoginRecords({ client }: { client: AdminConsoleClient }) {
  const [form] = Form.useForm<LoginFilters>();
  const [filters, setFilters] = useState<LoginFilters>({});
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
        <Form.Item name="eventType" label={c.eventType}>
          <Select
            allowClear
            style={{ width: 150 }}
            placeholder={c.all}
            options={[
              { value: 'login.succeeded', label: c.loginSucceeded },
              { value: 'login.failed', label: c.loginFailed },
              { value: 'login.throttled', label: c.loginThrottled },
              { value: 'password.changed', label: c.passwordChanged },
            ]}
          />
        </Form.Item>
        <Form.Item name="outcome" label={c.result}>
          <Select
            allowClear
            style={{ width: 130 }}
            placeholder={c.all}
            options={[
              { value: 'success', label: c.success },
              { value: 'failure', label: c.failure },
              { value: 'denied', label: c.denied },
            ]}
          />
        </Form.Item>
        <Form.Item name="userId" label={c.loginActor}>
          <Input allowClear />
        </Form.Item>
        <ListQueryActions
          form={form}
          searching={loading}
          search={{
            run: (values) => {
              const next: LoginFilters = {};
              if (values.eventType) next.eventType = values.eventType;
              if (values.outcome) next.outcome = values.outcome;
              if (values.userId?.trim()) next.userId = values.userId.trim();
              setFilters(next);
            },
          }}
          onReset={() => {
            setFilters({});
          }}
        />
        <Button onClick={() => refresh((n) => n + 1)}>{c.refresh}</Button>
      </Form>
      {error && <Alert type="error" showIcon title={c.failed} style={{ marginBottom: 16 }} />}
      <Table
        loading={loading}
        rowKey={(row) => row.cursor}
        dataSource={[...rows]}
        pagination={false}
        scroll={{ x: 720 }}
        locale={{ emptyText: error ? c.failed : c.empty }}
        columns={[
          { title: c.time, dataIndex: 'createdAt', render: shown },
          { title: c.loginActor, dataIndex: 'userId', render: shown },
          {
            title: c.eventType,
            dataIndex: 'eventType',
            render: (value: string) => {
              switch (value) {
                case 'login.succeeded':
                  return c.loginSucceeded;
                case 'login.failed':
                  return c.loginFailed;
                case 'login.throttled':
                  return c.loginThrottled;
                case 'password.changed':
                  return c.passwordChanged;
                default:
                  return value;
              }
            },
          },
          {
            title: c.result,
            dataIndex: 'outcome',
            render: (value: string) =>
              value === 'success' ? (
                <Tag color="success">{c.success}</Tag>
              ) : value === 'failure' ? (
                <Tag color="error">{c.failure}</Tag>
              ) : value === 'denied' ? (
                <Tag color="warning">{c.denied}</Tag>
              ) : (
                <Tag>{shown(value)}</Tag>
              ),
          },
          { title: c.reason, dataIndex: 'reason', render: shown },
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
  /** 操作人输入：姓名或用户 ID，提交前解析成用户 ID。 */
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

/** 平台用户 ID 是 UUID；该形态可直接查询，其余输入必须先解析成用户，不能当 ID 发出去。 */
const userIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type OperationActor =
  | { readonly userId: string }
  | { readonly problem: 'notFound' | 'ambiguous' | 'unverified'; readonly name: string };

/**
 * 操作人按姓名解析：用户 ID、账号或显示名唯一精确命中时换成用户 ID。
 * 后端按 actor_user_id 精确匹配，姓名原样发出去永远不会命中，所以解析不出来时
 * 返回问题而不是透传。
 */
function resolveOperationActor(input: string, users: readonly PlatformUser[]): OperationActor {
  const name = input.trim();
  if (userIdPattern.test(name)) return { userId: name };
  const byId = users.filter((user) => user.id === name);
  const byAccount = byId.length > 0 ? byId : users.filter((user) => user.username === name);
  const matches = byAccount.length > 0 ? byAccount : users.filter((user) => user.displayName === name);
  const [match] = matches;
  if (!match) return { problem: 'notFound', name };
  if (matches.length > 1) return { problem: 'ambiguous', name };
  return { userId: match.id };
}

const actorProblemCopy = {
  notFound: c.actorNotFound,
  ambiguous: c.actorAmbiguous,
  unverified: c.actorLookupFailed,
} as const;

/** 操作人显示：目录里查得到就显示姓名，查不到（已删除或改名）如实回落到稳定 ID。 */
function actorLabel(users: readonly PlatformUser[], userId?: string): string | null {
  if (!userId) return null;
  const user = users.find((item) => item.id === userId);
  return user ? user.displayName || user.username : userId;
}

/** 脱敏变更值的只读呈现；缺失值在调用处显式标注，不伪造内容。 */
function jsonBlock(value: unknown) {
  return (
    <pre style={{ margin: 0, font: 'inherit', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function resultTag(value: string) {
  return value === 'success' ? (
    <Tag color="success">{c.success}</Tag>
  ) : value === 'failure' ? (
    <Tag color="error">{c.failure}</Tag>
  ) : (
    <Tag>{shown(value)}</Tag>
  );
}

function objectLabel(record: { readonly resourceType?: string; readonly resourceId?: string }) {
  return record.resourceType ? `${record.resourceType} / ${record.resourceId ?? c.unknown}` : record.resourceId;
}

/** 操作详情：正文展示脱敏变更与失败原因，事件代码与稳定标识归入技术详情。 */
function OperationDetail({ record, actor }: { record: AdminAuditRecord; actor: string | null }) {
  const changes = record.changes ?? null;
  const requestId = changes && typeof changes.requestId === 'string' ? changes.requestId : null;
  const hasBefore = changes !== null && 'before' in changes;
  const hasAfter = changes !== null && 'after' in changes;
  const extraKeys = changes ? Object.keys(changes).filter((key) => key !== 'before' && key !== 'after') : [];
  return (
    <>
      <Descriptions
        column={1}
        bordered
        items={[
          { key: 'time', label: c.opsTime, children: formatTimestampSeconds(record.createdAt) || c.unknown },
          { key: 'actor', label: c.actor, children: shown(actor) },
          { key: 'object', label: c.object, children: shown(objectLabel(record)) },
          { key: 'result', label: c.result, children: resultTag(record.result) },
          { key: 'reason', label: c.reason, children: shown(record.reason) },
          ...(changes === null
            ? [{ key: 'changes', label: c.changes, children: c.noChanges }]
            : [
                ...(hasBefore ? [{ key: 'before', label: c.changedBefore, children: jsonBlock(changes.before) }] : []),
                ...(hasAfter ? [{ key: 'after', label: c.changedAfter, children: jsonBlock(changes.after) }] : []),
                ...(!hasBefore || !hasAfter || extraKeys.length > 0
                  ? [{ key: 'payload', label: c.changes, children: jsonBlock(changes) }]
                  : []),
              ]),
        ]}
      />
      <Typography.Title level={5} style={{ marginTop: 20 }}>
        {c.technical}
      </Typography.Title>
      <Descriptions
        column={1}
        bordered
        items={[
          { key: 'action', label: c.type, children: shown(record.action) },
          { key: 'actorId', label: c.actorId, children: shown(record.actorUserId) },
          { key: 'resourceType', label: c.resourceType, children: shown(record.resourceType) },
          { key: 'resourceId', label: c.resourceId, children: shown(record.resourceId) },
          { key: 'createdAt', label: c.opsTime, children: shown(record.createdAt) },
          { key: 'cursor', label: c.operationId, children: shown(record.cursor) },
          ...(requestId ? [{ key: 'requestId', label: c.requestId, children: requestId }] : []),
        ]}
      />
    </>
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
function OperationLog({ client }: { client: AdminConsoleClient }) {
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
  const [users, setUsers] = useState<readonly PlatformUser[]>([]);
  const [selected, setSelected] = useState<AdminAuditRecord | null>(null);
  const [revision, refresh] = useState(0);
  const requestVersion = useRef(0);
  // 能力判断是后端属性，确认后一直保留：重新查询不能把被忽略的筛选重新放开。
  const legacyRef = useRef(false);
  const directory = useRef<Promise<readonly PlatformUser[]> | null>(null);

  /** 用户目录只取一次，姓名解析与操作人显示共用；失败后下次查询再试。 */
  const loadUsers = useCallback(async () => {
    if (directory.current) return directory.current;
    const pending = client.users();
    directory.current = pending;
    try {
      return await pending;
    } catch (cause) {
      directory.current = null;
      throw cause;
    }
  }, [client]);
  useEffect(() => {
    let live = true;
    void loadUsers()
      .then((items) => {
        if (live) setUsers(items);
      })
      // 目录取不到（无权限或离线）不影响审计查询，操作人如实按 ID 显示。
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [loadUsers]);
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
    filters.actorUserId ? `${c.actor}: ${actorLabel(users, filters.actorUserId) ?? filters.actorUserId}` : '',
    filters.resourceId ? `${c.resourceId}: ${filters.resourceId}` : '',
    filters.action ? `${c.type}: ${filters.action}` : '',
    filters.result ? `${c.result}: ${filters.result === 'success' ? c.success : c.failure}` : '',
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
        <Form.Item name="actor" label={c.actorField}>
          <Input allowClear />
        </Form.Item>
        <Form.Item name="resourceId" label={c.resourceId} extra={c.objectIdHint}>
          <Input allowClear />
        </Form.Item>
        <Form.Item name="action" label={c.type}>
          <Input allowClear />
        </Form.Item>
        <Form.Item name="result" label={c.result}>
          <Select
            allowClear
            disabled={legacy}
            style={{ width: 130 }}
            placeholder={c.all}
            options={[
              { value: 'success', label: c.success },
              { value: 'failure', label: c.failure },
            ]}
          />
        </Form.Item>
        <Form.Item name="range" label={c.range}>
          <DatePicker.RangePicker showTime format="YYYY-MM-DD HH:mm" allowClear disabled={legacy} maxDate={dayjs()} />
        </Form.Item>
        <ListQueryActions
          form={form}
          searching={loading}
          search={{
            run: async (values) => {
              const next: OperationFilters = {};
              if (values.action?.trim()) next.action = values.action.trim();
              if (values.resourceId?.trim()) next.resourceId = values.resourceId.trim();
              if (values.result) next.result = values.result;
              const range = values.range;
              if (range?.[0] && range[1]) next.range = [range[0], range[1]];
              const actor = values.actor?.trim();
              if (actor) {
                let resolution: OperationActor;
                try {
                  resolution = resolveOperationActor(actor, await loadUsers());
                } catch {
                  resolution = { problem: 'unverified', name: actor };
                }
                if ('problem' in resolution) {
                  // 解析不出来就不发请求：后端按 actor_user_id 精确匹配，姓名发出去永不命中。
                  setActorProblem(actorProblemCopy[resolution.problem].replace('{name}', resolution.name));
                  return;
                }
                next.actorUserId = resolution.userId;
              }
              setActorProblem(null);
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
        rowKey={(row) => row.cursor}
        dataSource={[...rows]}
        pagination={false}
        scroll={{ x: 880 }}
        locale={{
          emptyText: error ? (
            c.failed
          ) : (
            <Space orientation="vertical" size={4}>
              <Typography.Text type="secondary">{c.empty}</Typography.Text>
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
            title: c.opsTime,
            dataIndex: 'createdAt',
            render: (value: string) => formatTimestampSeconds(value) || c.unknown,
          },
          { title: c.actor, dataIndex: 'actorUserId', render: (value?: string) => shown(actorLabel(users, value)) },
          { title: c.type, dataIndex: 'action', render: shown },
          {
            title: c.object,
            render: (_, row) => shown(objectLabel(row)),
          },
          { title: c.result, dataIndex: 'result', render: resultTag },
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
        {selected && <OperationDetail record={selected} actor={actorLabel(users, selected.actorUserId)} />}
      </Drawer>
    </>
  );
}
