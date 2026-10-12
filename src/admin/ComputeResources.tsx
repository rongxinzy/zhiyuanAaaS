import { ReloadOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  InputNumber,
  Modal,
  Result,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';
import {
  type AdminComputeAssignment,
  type AdminComputeTier,
  type AdminConsoleClient,
  type AdminDeploymentSettings,
  type AdminDeploymentSettingValue,
  type AdminIdentity,
  AdminPermission,
  AdminRequestError,
  hasAdminPermission,
} from './client.js';
import { formatTimestamp } from './format.js';
import { ADMIN_LANGUAGE, translate } from './i18n.js';
import { AdminNotificationKind, notify } from './notifications.js';

const t = (key: Parameters<typeof translate>[1]) => translate(ADMIN_LANGUAGE, key);

type LoadState = {
  readonly settings: AdminDeploymentSettings;
  readonly tiers: AdminComputeTier[];
  readonly assignments: AdminComputeAssignment[];
};

export function ComputeResources({
  client,
  identity,
}: {
  readonly client: AdminConsoleClient;
  readonly identity?: AdminIdentity | undefined;
}) {
  const canRead = hasAdminPermission(identity, AdminPermission.DeploymentRead);
  const canWrite = hasAdminPermission(identity, AdminPermission.AgentsComputeWrite);
  const [state, setState] = useState<LoadState | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [policyEditing, setPolicyEditing] = useState(false);
  const [adjusting, setAdjusting] = useState<AdminComputeAssignment | null>(null);
  const [revision, refresh] = useState(0);
  useEffect(() => {
    if (!canRead) return;
    let live = true;
    setLoading(true);
    setFailed(false);
    setForbidden(false);
    void Promise.all([client.deploymentSettings(), client.computeTierCatalog(), client.computeAssignments()])
      .then(([settings, tiers, assignments]) => {
        if (live) setState({ settings, tiers, assignments });
      })
      .catch((error: unknown) => {
        if (!live) return;
        // A 403 here means the role check passed locally but the server denied
        // the read; surface the same no-permission state instead of a generic
        // load failure.
        if (error instanceof AdminRequestError && error.status === 403) setForbidden(true);
        else setFailed(true);
        setState(null);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [client, canRead, revision]);

  if (!canRead || forbidden) {
    return <Result status="403" title={t('computeNoPermission')} />;
  }

  const settings = state?.settings;
  const tiers = state?.tiers ?? null;
  const assignments = state?.assignments ?? null;
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Typography.Title level={4} style={{ marginBottom: 4 }}>
            {t('computeResourcesTitle')}
          </Typography.Title>
          <Typography.Text type="secondary">{t('computeResourcesDescription')}</Typography.Text>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => refresh((current) => current + 1)}>
            {t('refresh')}
          </Button>
        </Space>
      </div>

      <Alert type="info" showIcon title={t('computeEffectHint')} />

      {failed ? (
        <Alert
          type="error"
          showIcon
          title={t('computeLoadFailed')}
          action={
            <Button size="small" onClick={() => refresh((current) => current + 1)}>
              {t('retry')}
            </Button>
          }
        />
      ) : null}

      <Card title={t('computeTiersCard')}>
        <Table
          rowKey="name"
          columns={tierColumns()}
          dataSource={tiers ? [...tiers] : []}
          loading={loading && tiers === null}
          scroll={{ x: 760 }}
          locale={{
            emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('computeTiersEmpty')} />,
          }}
          pagination={{ hideOnSinglePage: true, showSizeChanger: false }}
        />
      </Card>

      <Card
        title={t('computePolicyCard')}
        extra={
          canWrite && settings ? (
            <Button onClick={() => setPolicyEditing(true)}>{t('edit')}</Button>
          ) : (
            <Tooltip title={t('computeReadonlyHint')}>
              <Button disabled>{t('edit')}</Button>
            </Tooltip>
          )
        }
      >
        {loading && settings === null ? (
          <Skeleton active paragraph={{ rows: 2 }} />
        ) : settings ? (
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label={t('computeDefaultTierLabel')}>
              <Space size="small">
                <SettingText value={settings.computeDefaultTier.effectiveValue} />
                {settingSourceTag(settings.computeDefaultTier.source)}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label={t('computeHibernateLabel')}>
              <Space size="small">
                {settings.computeIdleHibernateSeconds.effectiveValue !== null ? (
                  <Typography.Text>
                    {formatHibernateSeconds(settings.computeIdleHibernateSeconds.effectiveValue)}
                  </Typography.Text>
                ) : (
                  <Typography.Text type="secondary">{t('computeNotConfigured')}</Typography.Text>
                )}
                {settingSourceTag(settings.computeIdleHibernateSeconds.source)}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label={t('computeConcurrencyLabel')}>
              <Space size="small">
                {settings.computeConcurrencyCap.effectiveValue !== null ? (
                  <Typography.Text>{settings.computeConcurrencyCap.effectiveValue}</Typography.Text>
                ) : (
                  <Typography.Text type="secondary">{t('computeNotConfigured')}</Typography.Text>
                )}
                {settingSourceTag(settings.computeConcurrencyCap.source)}
              </Space>
            </Descriptions.Item>
          </Descriptions>
        ) : null}
      </Card>

      <Card title={t('computeAssignmentsCard')}>
        <Table
          rowKey="agentId"
          columns={assignmentColumns(canWrite, (assignment) => setAdjusting(assignment))}
          dataSource={assignments ? [...assignments] : []}
          loading={loading && assignments === null}
          scroll={{ x: 900 }}
          locale={{
            emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('computeAssignmentEmpty')} />,
          }}
          pagination={{ hideOnSinglePage: true, showSizeChanger: false }}
        />
      </Card>

      {settings ? (
        <PolicyEditModal
          client={client}
          open={policyEditing}
          settings={settings}
          tiers={tiers ?? []}
          onClose={() => setPolicyEditing(false)}
          onSaved={() => {
            setPolicyEditing(false);
            refresh((current) => current + 1);
          }}
        />
      ) : null}
      <AssignmentAdjustModal
        client={client}
        assignment={adjusting}
        tiers={tiers ?? []}
        onClose={() => setAdjusting(null)}
        onSaved={() => {
          setAdjusting(null);
          refresh((current) => current + 1);
        }}
      />
    </div>
  );
}

function SettingText({ value }: { readonly value: string | null }) {
  if (value) return <Typography.Text>{value}</Typography.Text>;
  return <Typography.Text type="secondary">{t('computeNotConfigured')}</Typography.Text>;
}

function settingSourceTag(source: AdminDeploymentSettingValue['source']) {
  if (source === 'override') return <Tag color="processing">{t('computeSourceOverride')}</Tag>;
  if (source === 'env') return <Tag>{t('computeSourceEnv')}</Tag>;
  return <Tag color="warning">{t('computeSourceUnset')}</Tag>;
}

function assignmentSourceTag(source: AdminComputeAssignment['tier']['source']) {
  if (source === 'override') return <Tag color="processing">{t('computeSourceTagOverride')}</Tag>;
  return <Tag>{t('computeSourceTagDefault')}</Tag>;
}

function formatHibernateSeconds(value: number): string {
  if (value % 60 === 0)
    return t('computeHibernateMinutes')
      .replace('{minutes}', String(value / 60))
      .replace('{seconds}', String(value));
  return t('computeHibernateSecondsOnly').replace('{seconds}', String(value));
}

function tierColumns() {
  return [
    { title: t('computeTierName'), dataIndex: 'name', key: 'name' },
    {
      title: t('computeTierCpu'),
      key: 'cpu',
      render: (_: unknown, tier: AdminComputeTier) => `${tier.cpuRequest} / ${tier.cpuLimit}`,
    },
    {
      title: t('computeTierMemory'),
      key: 'memory',
      render: (_: unknown, tier: AdminComputeTier) => `${tier.memoryRequest} / ${tier.memoryLimit}`,
    },
    {
      title: t('computeTierDescription'),
      dataIndex: 'description',
      key: 'description',
      render: (value: string | undefined) =>
        value ? value : <Typography.Text type="secondary">{t('computeNotConfigured')}</Typography.Text>,
    },
    {
      title: t('computeTierSource'),
      key: 'source',
      render: () => <Tag>{t('computeTierSourceDeployment')}</Tag>,
    },
  ];
}

function assignmentColumns(canWrite: boolean, onAdjust: (assignment: AdminComputeAssignment) => void) {
  return [
    {
      title: t('computeAssignmentAgent'),
      key: 'agent',
      render: (_: unknown, assignment: AdminComputeAssignment) => assignment.agentName ?? assignment.agentId,
    },
    {
      title: t('computeAssignmentTier'),
      key: 'tier',
      render: (_: unknown, assignment: AdminComputeAssignment) =>
        assignment.tier.effective ? (
          assignment.tier.effective
        ) : (
          <Typography.Text type="secondary">{t('computeNotConfigured')}</Typography.Text>
        ),
    },
    {
      title: t('computeAssignmentSource'),
      key: 'source',
      render: (_: unknown, assignment: AdminComputeAssignment) => assignmentSourceTag(assignment.tier.source),
    },
    {
      title: t('computeAssignmentChanged'),
      key: 'changed',
      render: (_: unknown, assignment: AdminComputeAssignment) => {
        if (!assignment.updatedAt) return <Typography.Text type="secondary">—</Typography.Text>;
        return (
          <Typography.Text type="secondary">
            {formatTimestamp(assignment.updatedAt)}
            {assignment.updatedBy ? ` · ${assignment.updatedBy}` : ''}
          </Typography.Text>
        );
      },
    },
    {
      title: t('actions'),
      key: 'actions',
      render: (_: unknown, assignment: AdminComputeAssignment) =>
        canWrite ? (
          <Button size="small" onClick={() => onAdjust(assignment)}>
            {t('computeAssignmentAdjust')}
          </Button>
        ) : (
          <Tooltip title={t('computeReadonlyHint')}>
            <Button size="small" disabled>
              {t('computeAssignmentAdjust')}
            </Button>
          </Tooltip>
        ),
    },
  ];
}

function PolicyEditModal({
  client,
  open,
  settings,
  tiers,
  onClose,
  onSaved,
}: {
  readonly client: AdminConsoleClient;
  readonly open: boolean;
  readonly settings: AdminDeploymentSettings;
  readonly tiers: AdminComputeTier[];
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const [form] = Form.useForm<{ tier?: string; hibernate?: number | null; concurrency?: number | null }>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ readonly title: string; readonly detail: string | null } | null>(null);

  const close = () => {
    if (!pending) {
      setError(null);
      onClose();
    }
  };

  const save = async (values: { tier?: string; hibernate?: number | null; concurrency?: number | null }) => {
    setPending(true);
    setError(null);
    try {
      await client.updateDeploymentSettings({
        computeDefaultTier: values.tier ?? null,
        computeIdleHibernateSeconds: values.hibernate ?? null,
        computeConcurrencyCap: values.concurrency ?? null,
      });
      notify(AdminNotificationKind.Success, t('changesSaved'));
      onSaved();
    } catch (saveFailure) {
      // A 422 carries the server-side validation detail; keep the draft open
      // so the operator can fix the value instead of retyping it.
      setError({
        title:
          saveFailure instanceof AdminRequestError && saveFailure.status === 422
            ? t('computePolicyRejected')
            : t('computePolicySaveFailed'),
        detail: saveFailure instanceof AdminRequestError ? saveFailure.detail : null,
      });
    } finally {
      setPending(false);
    }
  };

  const tierOptions = tiers.map((tier) => ({ value: tier.name, label: tier.name }));
  return (
    <Modal
      title={t('computePolicyModalTitle')}
      open={open}
      okText={t('save')}
      cancelText={t('cancel')}
      confirmLoading={pending}
      onOk={() => form.submit()}
      onCancel={close}
      destroyOnHidden
    >
      {error ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          title={error.title}
          description={error.detail ?? undefined}
        />
      ) : null}
      <Alert type="info" showIcon style={{ marginBottom: 16 }} title={t('computeClearToEnvHint')} />
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          tier: settings.computeDefaultTier.override ?? settings.computeDefaultTier.effectiveValue ?? undefined,
          hibernate:
            settings.computeIdleHibernateSeconds.override ??
            settings.computeIdleHibernateSeconds.effectiveValue ??
            undefined,
          concurrency:
            settings.computeConcurrencyCap.override ?? settings.computeConcurrencyCap.effectiveValue ?? undefined,
        }}
        disabled={pending}
        onFinish={(values) => void save(values)}
      >
        <Form.Item name="tier" label={t('computeDefaultTierLabel')}>
          <Select
            allowClear
            placeholder={tiers.length > 0 ? t('computeTierPlaceholder') : t('computeTiersEmpty')}
            options={tierOptions}
          />
        </Form.Item>
        <Form.Item
          name="hibernate"
          label={t('computeHibernateLabel')}
          rules={[
            {
              validator: (_, value: unknown) => {
                if (value === undefined || value === null) return Promise.resolve();
                if (typeof value === 'number' && Number.isInteger(value) && value >= 60 && value <= 86400)
                  return Promise.resolve();
                return Promise.reject(new Error(t('computeHibernateRule')));
              },
            },
          ]}
        >
          <InputNumber min={60} max={86400} precision={0} style={{ width: '100%' }} placeholder="60 – 86400" />
        </Form.Item>
        <Form.Item
          name="concurrency"
          label={t('computeConcurrencyLabel')}
          rules={[
            {
              validator: (_, value: unknown) => {
                if (value === undefined || value === null) return Promise.resolve();
                if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 10000)
                  return Promise.resolve();
                return Promise.reject(new Error(t('computeConcurrencyRule')));
              },
            },
          ]}
        >
          <InputNumber min={1} max={10000} precision={0} style={{ width: '100%' }} placeholder="1 – 10000" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function AssignmentAdjustModal({
  client,
  assignment,
  tiers,
  onClose,
  onSaved,
}: {
  readonly client: AdminConsoleClient;
  readonly assignment: AdminComputeAssignment | null;
  readonly tiers: AdminComputeTier[];
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const [form] = Form.useForm<{ tier?: string }>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ readonly title: string; readonly detail: string | null } | null>(null);

  const close = () => {
    if (!pending) {
      setError(null);
      onClose();
    }
  };

  const save = async (values: { tier?: string }) => {
    if (!assignment) return;
    setPending(true);
    setError(null);
    try {
      await client.updateComputeAssignment(assignment.agentId, values.tier ?? null);
      notify(AdminNotificationKind.Success, t('changesSaved'));
      onSaved();
    } catch (saveFailure) {
      setError({
        title:
          saveFailure instanceof AdminRequestError && saveFailure.status === 422
            ? t('computeUnknownTier')
            : t('computePolicySaveFailed'),
        detail: saveFailure instanceof AdminRequestError ? saveFailure.detail : null,
      });
    } finally {
      setPending(false);
    }
  };

  const tierOptions = tiers.map((tier) => ({ value: tier.name, label: tier.name }));
  return (
    <Modal
      title={t('computeAdjustModalTitle')}
      open={assignment !== null}
      okText={t('save')}
      cancelText={t('cancel')}
      confirmLoading={pending}
      onOk={() => form.submit()}
      onCancel={close}
      destroyOnHidden
    >
      <Alert type="info" showIcon style={{ marginBottom: 16 }} title={t('computeAdjustHint')} />
      {error ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          title={error.title}
          description={error.detail ?? undefined}
        />
      ) : null}
      <Form
        form={form}
        layout="vertical"
        initialValues={{ tier: assignment?.tier.override ?? undefined }}
        disabled={pending}
        onFinish={(values) => void save(values)}
      >
        <Form.Item name="tier" label={t('computeDefaultTierLabel')} extra={t('computeAdjustClearHint')}>
          <Select
            allowClear
            placeholder={tiers.length > 0 ? t('computeTierPlaceholder') : t('computeTiersEmpty')}
            options={tierOptions}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
