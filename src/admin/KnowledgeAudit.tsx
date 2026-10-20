import { useQuery } from '@tanstack/react-query';
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

type Page = {
  readonly items: readonly KnowledgeAuditRecord[];
  readonly nextCursor: string | null;
};

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
  const [selected, setSelected] = useState<KnowledgeAuditRecord | null>(null);
  const [paged, setPaged] = useState<{
    readonly base: Page;
    readonly fetchedAt: number;
    readonly rows: readonly KnowledgeAuditRecord[];
    readonly cursor: string | null;
    readonly error: string | null;
    readonly loading: boolean;
  } | null>(null);
  const query = useQuery({
    queryKey: ['portal', 'knowledge-audit', knowledgeBaseId ?? null, filters],
    queryFn: ({ signal }) =>
      portal.knowledgeAudit({ ...filters, ...(knowledgeBaseId ? { knowledgeBaseId } : {}) }, signal),
  });
  // 翻页累积绑定当次首页数据：筛选、重置或重试换了首页，累积与翻页报错一并作废。
  // dataUpdatedAt 在每次成功读取后都变（即使响应与上一份深相等、被结构共享保持
  // 同一引用），刷新返回等价首页时累积同样作废。
  const base = query.isError ? null : (query.data ?? null);
  const fetchedAt = query.dataUpdatedAt;
  const more = paged && paged.base === base && paged.fetchedAt === fetchedAt ? paged : null;
  const rows: readonly KnowledgeAuditRecord[] = base ? [...base.items, ...(more?.rows ?? [])] : [];
  const cursor = more ? more.cursor : (base?.nextCursor ?? null);
  const version = useRef(0);
  useEffect(() => {
    ++version.current;
  }, [base, fetchedAt]);
  const loading = query.isFetching || (more?.loading ?? false);
  const listError =
    query.isError && !query.isFetching
      ? query.error instanceof Error
        ? knowledgeErrorText(query.error)
        : c.knowledgeFailed
      : null;
  const error = more?.error ?? listError;
  const loadMore = async () => {
    if (!base || !cursor || loading) return;
    const generation = version.current;
    setPaged((current) => ({
      base,
      fetchedAt,
      rows: current && current.base === base && current.fetchedAt === fetchedAt ? current.rows : [],
      cursor,
      error: null,
      loading: true,
    }));
    try {
      const page = await portal.knowledgeAudit({
        ...filters,
        ...(knowledgeBaseId ? { knowledgeBaseId } : {}),
        cursor,
      });
      if (generation !== version.current) return;
      setPaged((current) =>
        current
          ? { ...current, rows: [...current.rows, ...page.items], cursor: page.nextCursor, loading: false }
          : current,
      );
    } catch (cause) {
      if (generation !== version.current) return;
      setPaged((current) =>
        current
          ? {
              ...current,
              error: cause instanceof Error ? knowledgeErrorText(cause) : c.knowledgeFailed,
              loading: false,
            }
          : current,
      );
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
          const next: Filters = {
            ...(values.operationId ? { operationId: values.operationId } : {}),
            ...(actor ? { actorUserId: actor.userId } : {}),
          };
          setFilters(next);
          // 条件没变时查询键不变，显式刷新保持「查询必发一次」。
          if (next.operationId === filters.operationId && next.actorUserId === filters.actorUserId)
            void query.refetch();
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
            if (!filters.operationId && !filters.actorUserId) void query.refetch();
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
          action={
            <Button
              onClick={() => {
                setPaged(null);
                void query.refetch();
              }}
            >
              {c.retry}
            </Button>
          }
        />
      )}
      <Table<KnowledgeAuditRecord>
        rowKey="cursor"
        dataSource={[...rows]}
        loading={loading}
        pagination={false}
        scroll={{ x: 1080 }}
        columns={[
          {
            title: c.user,
            dataIndex: 'actorUserId',
            render: (value: string) => <UserCell userId={value} users={directory.users} />,
          },
          { title: c.time, dataIndex: 'createdAt', render: (value: string) => timeCell(value) },
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
        <Button loading={loading} onClick={() => void loadMore()}>
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
