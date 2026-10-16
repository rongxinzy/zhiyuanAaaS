import { Alert, Button, Form, Input, Space, Table, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';
import type { AdminConsoleClient } from './client.js';
import { ADMIN_LANGUAGE, translate } from './i18n.js';
import { knowledgeErrorText } from './knowledge-error.js';
import { type KnowledgeAuditRecord, PortalClient } from './portal.js';

const t = (key: Parameters<typeof translate>[1]) => translate(ADMIN_LANGUAGE, key);
type Filters = { operationId?: string; actorUserId?: string };

export function KnowledgeAudit({
  client,
  portal: supplied,
}: {
  readonly client: AdminConsoleClient;
  readonly portal?: PortalClient;
}) {
  const [portal] = useState(
    () => supplied ?? new PortalClient((rejectedToken) => client.getAccessToken(rejectedToken)),
  );
  const [form] = Form.useForm<Filters>();
  const [filters, setFilters] = useState<Filters>({});
  const [rows, setRows] = useState<readonly KnowledgeAuditRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      .knowledgeAudit(filters, controller.signal)
      .then((page) => {
        if (controller.signal.aborted || generation !== version.current) return;
        setRows(page.items);
        setCursor(page.nextCursor);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted && generation === version.current)
          setError(cause instanceof Error ? knowledgeErrorText(cause) : t('knowledgeAuditError'));
      })
      .finally(() => {
        if (!controller.signal.aborted && generation === version.current) setLoading(false);
      });
    return () => {
      controller.abort();
      ++version.current;
    };
  }, [portal, filters, revision]);
  const more = async () => {
    if (!cursor || loading) return;
    const generation = version.current;
    setLoading(true);
    setError(null);
    try {
      const page = await portal.knowledgeAudit({ ...filters, cursor });
      if (generation !== version.current) return;
      setRows((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch (cause) {
      if (generation === version.current)
        setError(cause instanceof Error ? knowledgeErrorText(cause) : t('knowledgeAuditError'));
    } finally {
      if (generation === version.current) setLoading(false);
    }
  };
  return (
    <Space orientation="vertical" style={{ width: '100%' }}>
      <Typography.Paragraph type="secondary">{t('knowledgeAuditHint')}</Typography.Paragraph>
      <Form form={form} layout="inline" onFinish={(values) => setFilters(values)}>
        <Form.Item name="operationId" label={t('knowledgeOperation')}>
          <Input maxLength={256} />
        </Form.Item>
        <Form.Item name="actorUserId" label={t('knowledgeAuditActor')}>
          <Input maxLength={256} />
        </Form.Item>
        <Button htmlType="submit" aria-label={t('knowledgeAuditQuery')} loading={loading}>
          {t('knowledgeAuditQuery')}
        </Button>
        <Button
          onClick={() => {
            form.resetFields();
            setFilters({});
          }}
        >
          {t('knowledgeAuditReset')}
        </Button>
      </Form>
      {error && (
        <Alert
          type="error"
          showIcon
          title={error}
          action={<Button onClick={() => refresh((value) => value + 1)}>{t('retry')}</Button>}
        />
      )}
      <Table<KnowledgeAuditRecord>
        rowKey="cursor"
        dataSource={[...rows]}
        loading={loading}
        pagination={false}
        scroll={{ x: 1000 }}
        columns={[
          { title: t('knowledgeOperation'), dataIndex: 'operationId' },
          { title: t('knowledgeAuditActor'), dataIndex: 'actorUserId' },
          { title: t('knowledgeAuditAction'), dataIndex: 'action' },
          { title: t('knowledgeResourceId'), dataIndex: 'resourceId' },
          { title: t('knowledgeAuditOutcome'), dataIndex: 'outcome' },
          { title: t('knowledgeAuditTime'), dataIndex: 'createdAt' },
        ]}
      />
      {cursor && (
        <Button loading={loading} onClick={() => void more()}>
          {t('knowledgeAuditMore')}
        </Button>
      )}
    </Space>
  );
}
