import { Alert, Button, Drawer, Form, Input, Space, Table, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { auditCopy as c } from './audit-copy.js';
import { objectText } from './audit-labels.js';
import { type AuditDirectory, actorProblemText, resolveActorFilter, UserCell } from './audit-user.js';
import { AuditDetail, type AuditDetailRow, codeCell, resultCell, shown, timeCell } from './audit-view.js';
import type { AdminConsoleClient } from './client.js';
import { knowledgeErrorText } from './knowledge-error.js';
import { type KnowledgeAuditRecord, PortalClient } from './portal.js';

type Filters = { operationId?: string; actorUserId?: string };

/** 知识审计：服务端持久化的知识操作与读取记录，只读。 */
export function KnowledgeAudit({
  client,
  portal: supplied,
  directory,
  knowledgeBaseId,
}: {
  readonly client: AdminConsoleClient;
  readonly portal?: PortalClient;
  readonly directory: AuditDirectory;
  readonly knowledgeBaseId?: string | undefined;
}) {
  const [portal] = useState(
    () => supplied ?? new PortalClient((rejectedToken) => client.getAccessToken(rejectedToken)),
  );
  const [form] = Form.useForm<{ operationId?: string; actor?: string }>();
  const [filters, setFilters] = useState<Filters>({});
  const [actorProblem, setActorProblem] = useState<string | null>(null);
  const [rows, setRows] = useState<readonly KnowledgeAuditRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<KnowledgeAuditRecord | null>(null);
  const [revision, refresh] = useState(0);
  const version = useRef(0);
  useEffect(() => {
    const generation = ++version.current;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setRows([]);
    setCursor(null);
    void portal
      .knowledgeAudit({ ...filters, ...(knowledgeBaseId ? { knowledgeBaseId } : {}) }, controller.signal)
      .then((page) => {
        if (controller.signal.aborted || generation !== version.current) return;
        setRows(page.items);
        setCursor(page.nextCursor);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted && generation === version.current)
          setError(cause instanceof Error ? knowledgeErrorText(cause) : c.knowledgeFailed);
      })
      .finally(() => {
        if (!controller.signal.aborted && generation === version.current) setLoading(false);
      });
    return () => {
      controller.abort();
      ++version.current;
    };
  }, [portal, filters, revision, knowledgeBaseId]);
  const more = async () => {
    if (!cursor || loading) return;
    const generation = version.current;
    setLoading(true);
    setError(null);
    try {
      const page = await portal.knowledgeAudit({
        ...filters,
        ...(knowledgeBaseId ? { knowledgeBaseId } : {}),
        cursor,
      });
      if (generation !== version.current) return;
      setRows((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch (cause) {
      if (generation === version.current)
        setError(cause instanceof Error ? knowledgeErrorText(cause) : c.knowledgeFailed);
    } finally {
      if (generation === version.current) setLoading(false);
    }
  };
  const technical: AuditDetailRow[] = selected
    ? [
        { key: 'operationId', label: c.operationCode, children: shown(selected.operationId) },
        { key: 'action', label: c.action, children: shown(selected.action) },
        { key: 'cursor', label: c.recordIndex, children: shown(selected.cursor) },
        { key: 'actorId', label: c.userId, children: shown(selected.actorUserId) },
        { key: 'resourceType', label: c.resourceType, children: shown(selected.resourceType) },
        { key: 'resourceId', label: c.resourceId, children: shown(selected.resourceId) },
        ...(selected.parentResourceId
          ? [{ key: 'parentResourceId', label: c.parentResourceId, children: selected.parentResourceId }]
          : []),
        { key: 'createdAt', label: c.time, children: shown(selected.createdAt) },
        { key: 'statusCode', label: c.http, children: selected.statusCode },
      ]
    : [];
  return (
    <Space orientation="vertical" style={{ width: '100%' }}>
      <Typography.Paragraph type="secondary">{c.knowledgeHint}</Typography.Paragraph>
      {knowledgeBaseId && (
        <Typography.Text>
          {c.knowledgeBase}: {knowledgeBaseId}
        </Typography.Text>
      )}
      <Form
        form={form}
        layout="inline"
        onFinish={async (values) => {
          const actor = await resolveActorFilter(values.actor, directory);
          if (actor && 'problem' in actor) {
            // 解析不出来就不发请求：接口按用户 ID 精确匹配，姓名发出去永不命中。
            setActorProblem(actorProblemText(actor.problem, actor.name));
            return;
          }
          setActorProblem(null);
          setFilters({
            ...(values.operationId ? { operationId: values.operationId } : {}),
            ...(actor ? { actorUserId: actor.userId } : {}),
          });
        }}
      >
        <Form.Item name="operationId" label={c.operationCode}>
          <Input maxLength={256} />
        </Form.Item>
        <Form.Item name="actor" label={c.user}>
          <Input maxLength={256} placeholder={c.userPlaceholder} />
        </Form.Item>
        <Button htmlType="submit" aria-label={c.search} loading={loading}>
          {c.search}
        </Button>
        <Button
          onClick={() => {
            form.resetFields();
            setActorProblem(null);
            setFilters({});
          }}
        >
          {c.reset}
        </Button>
      </Form>
      {actorProblem && <Alert type="warning" showIcon title={actorProblem} />}
      {error && (
        <Alert
          type="error"
          showIcon
          title={error}
          action={<Button onClick={() => refresh((value) => value + 1)}>{c.retry}</Button>}
        />
      )}
      <Table<KnowledgeAuditRecord>
        rowKey="cursor"
        dataSource={[...rows]}
        loading={loading}
        pagination={false}
        scroll={{ x: 1080 }}
        columns={[
          { title: c.time, dataIndex: 'createdAt', render: (value: string) => timeCell(value) },
          {
            title: c.user,
            dataIndex: 'actorUserId',
            render: (value: string) => <UserCell userId={value} users={directory.users} />,
          },
          { title: c.action, dataIndex: 'action', render: (value: string) => codeCell(value) },
          { title: c.object, render: (_, row) => shown(objectText(row.resourceType, row.resourceId)) },
          { title: c.result, dataIndex: 'outcome', render: (value: string) => resultCell(value) },
          { title: c.http, dataIndex: 'statusCode' },
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
        <Button loading={loading} onClick={() => void more()}>
          {c.more}
        </Button>
      )}
      <Drawer title={c.detailTitle} open={Boolean(selected)} onClose={() => setSelected(null)} size={560}>
        <Alert type="info" title={c.scopeNote} style={{ marginBottom: 20 }} />
        {selected && (
          <AuditDetail
            overview={[
              { key: 'time', label: c.time, children: timeCell(selected.createdAt) },
              {
                key: 'user',
                label: c.user,
                children: <UserCell userId={selected.actorUserId} users={directory.users} />,
              },
              { key: 'action', label: c.action, children: codeCell(selected.action) },
              {
                key: 'object',
                label: c.object,
                children: shown(objectText(selected.resourceType, selected.resourceId)),
              },
              { key: 'result', label: c.result, children: resultCell(selected.outcome) },
              { key: 'http', label: c.http, children: selected.statusCode },
            ]}
            changes={null}
            technical={technical}
          />
        )}
      </Drawer>
    </Space>
  );
}
