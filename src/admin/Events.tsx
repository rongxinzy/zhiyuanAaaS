import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
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
} from "antd";
import type { AdminControlEvent } from "@aep/sdk-node";
import {
  AdminPermission,
  hasAdminPermission,
  type AdminConsoleClient,
  type AdminIdentity,
  type AdminEventRecord,
  type AdminDeliveryRecord,
} from "./client.js";
import { auditCopy as c } from "./audit-copy.js";
/** 2026-09-30 LiXiang2019 列表查询按钮组（查询/重置/导出） */
import { ListQueryActions } from "./components/ListQueryActions.js";
import { shellCopy } from "./shell-copy.js";

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
  const [tab, setTab] = useState("operations");
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
              key: "operations",
              label: c.operations,
              children: <AuditRecords client={client} />,
            },
            {
              key: "execution",
              label: c.execution,
              children: <ExecutionRecords client={client} />,
            },
            {
              key: "login",
              label: c.login,
              children: (
                <Result
                  status="info"
                  title={c.loginGap}
                  subTitle={c.loginHint}
                />
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
      <Form
        form={form}
        layout="inline"
        style={{ gap: 12, marginBottom: 20 }}
      >
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
              { value: "success", label: c.success },
              { value: "failure", label: c.failure },
              { value: "info", label: c.info },
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
      {error && (
        <Alert
          type="error"
          showIcon
          title={c.failed}
          style={{ marginBottom: 16 }}
        />
      )}
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
          { title: c.type, dataIndex: "type", render: shown },
          { title: c.actor, dataIndex: "userId", render: shown },
          {
            title: c.object,
            render: (_, row) =>
              shown(
                row.resourceType
                  ? `${row.resourceType} / ${row.resourceId ?? c.unknown}`
                  : row.resourceId,
              ),
          },
          {
            title: c.result,
            dataIndex: "result",
            render: (value: string) => (
              <Tag
                color={
                  value === "success"
                    ? "success"
                    : value === "failure"
                      ? "error"
                      : "default"
                }
              >
                {value === "success"
                  ? c.success
                  : value === "failure"
                    ? c.failure
                    : shown(value)}
              </Tag>
            ),
          },
          { title: c.time, dataIndex: "receivedAt", render: shown },
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
        <Button
          loading={loading}
          onClick={() => void more()}
          style={{ marginTop: 16 }}
        >
          {c.more}
        </Button>
      )}
      <Drawer
        title={c.detailTitle}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        size={560}
      >
        <Alert type="info" title={c.scopeNote} style={{ marginBottom: 20 }} />
        {selected && (
          <Descriptions
            column={1}
            bordered
            items={[
              {
                key: "id",
                label: c.eventId,
                children: shown(selected.eventId),
              },
              { key: "type", label: c.type, children: shown(selected.type) },
              { key: "user", label: c.actor, children: shown(selected.userId) },
              {
                key: "resource",
                label: c.resourceId,
                children: shown(selected.resourceId),
              },
              {
                key: "scope",
                label: c.scope,
                children: shown(selected.scopeType),
              },
              {
                key: "scopeId",
                label: c.scopeId,
                children: shown(selected.scopeId),
              },
              {
                key: "result",
                label: c.result,
                children: shown(selected.result),
              },
              {
                key: "time",
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
  const [deliveries, setDeliveries] = useState<readonly AdminDeliveryRecord[]>(
    [],
  );
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
          { title: c.type, dataIndex: "type" },
          { title: c.state, dataIndex: "state" },
          { title: c.time, dataIndex: "createdAt" },
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
      <Drawer
        title={c.deliveryTitle}
        size={720}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
      >
        {deliveryError && (
          <Alert
            type="error"
            title={c.deliveryError}
            action={
              <Button onClick={() => retry((n) => n + 1)}>{c.refresh}</Button>
            }
          />
        )}
        <Table
          loading={deliveryLoading}
          dataSource={[...deliveries]}
          rowKey="deliveryId"
          pagination={false}
          columns={[
            { title: c.eventId, dataIndex: "deliveryId" },
            { title: c.state, dataIndex: "state" },
            { title: c.attempts, dataIndex: "attemptCount" },
            { title: c.completed, dataIndex: "completedAt", render: shown },
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
