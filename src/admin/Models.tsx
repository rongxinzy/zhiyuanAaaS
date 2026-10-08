import {
  type AdminModel,
  AepProblem,
  type ModelAssignment,
  type PlatformUser,
  type Role,
  type Team,
} from '@aep/sdk-node';
import {
  ArrowLeftOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  RocketOutlined,
  SearchOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Checkbox,
  Descriptions,
  Drawer,
  Dropdown,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Timeline,
  Tooltip,
  Typography,
} from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { runBatch } from './batch.js';
import {
  type AdminConsoleClient,
  type AdminDataPlane,
  type AdminDataPlaneRouteMismatch,
  type AdminIdentity,
  AdminModelSubjectType,
  type AdminModels,
  AdminPermission,
  hasAdminPermission,
} from './client.js';
import { type AdminLanguage, translate } from './i18n.js';
import { ModelConnectionSelect } from './ModelConnectionSelect.js';
import { modelsT } from './models-copy.js';
import { AdminNotificationKind, notify } from './notifications.js';

const ModelSourceType = { Gateway: 'gateway' } as const;
const ModelProtocol = { OpenAiCompatible: 'openai-compatible', Anthropic: 'anthropic' } as const;
const MODEL_PROTOCOL_OPTIONS = [
  { value: ModelProtocol.OpenAiCompatible, label: 'OpenAI-compatible' },
  { value: ModelProtocol.Anthropic, label: 'Anthropic' },
];
const language: AdminLanguage = 'zh';
const t = (key: Parameters<typeof modelsT>[0]): string => modelsT(key, language);

type ModelGrantTarget = {
  readonly model: AdminModel;
  readonly assignments: readonly ModelAssignment[];
};

function modelSaveMessage(error: unknown): string {
  if (error instanceof AepProblem && (error.code === 'MODEL_EXISTS' || error.status === 409))
    return translate(language, 'modelIdExists');
  return translate(language, 'operationUnavailable');
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// The gateway reports one global sync state (revision → observedRevision).
// "Applied" is only claimed when the gateway confirmed this exact desired
// revision; anything else degrades to pending/failed/unknown, never a
// blanket green.
function gatewayStateLabel(dataPlane: AdminDataPlane): { label: string; color: string; confirmed: boolean } {
  const { desired, status } = dataPlane;
  if (status.observedRevision === null || status.observedRevision === undefined) {
    return { label: t('configUnknown'), color: 'default', confirmed: false };
  }
  if (status.observedRevision === desired.revision && status.state === 'ready') {
    return { label: t('configApplied'), color: 'success', confirmed: true };
  }
  if (status.observedRevision !== desired.revision) {
    return { label: t('configPending'), color: 'processing', confirmed: false };
  }
  switch (status.state) {
    case 'pending':
      return { label: t('configPending'), color: 'default', confirmed: false };
    case 'applying':
      return { label: t('configApplying'), color: 'processing', confirmed: false };
    case 'degraded':
      return { label: t('configDegraded'), color: 'warning', confirmed: false };
    case 'error':
      return { label: t('configError'), color: 'error', confirmed: false };
    default:
      return { label: t('configUnknown'), color: 'default', confirmed: false };
  }
}

function routeIncluded(dataPlane: AdminDataPlane, modelId: string): boolean {
  return dataPlane.desired.routes.some((route) => route.modelId === modelId);
}

// A model is catalog-publishable when it is enabled and its gateway mapping
// is complete; the publish endpoint derives routes from exactly this set.
function catalogPublishable(model: AdminModel): boolean {
  return Boolean(
    model.enabled &&
      model.sourceType === ModelSourceType.Gateway &&
      model.protocol === ModelProtocol.OpenAiCompatible &&
      model.endpoint?.trim() &&
      model.upstreamModel?.trim(),
  );
}

function catalogMismatch(dataPlane: AdminDataPlane, modelId: string): AdminDataPlaneRouteMismatch | null {
  return dataPlane.status.catalogComparison?.mismatched.find((item) => item.modelId === modelId) ?? null;
}

function catalogMissing(dataPlane: AdminDataPlane, modelId: string): boolean {
  return dataPlane.status.catalogComparison?.missing.includes(modelId) ?? false;
}

function driftFieldLabel(field: string): string {
  switch (field) {
    case 'enabled':
      return t('fieldEnabled');
    case 'endpoint':
      return t('fieldEndpoint');
    case 'upstreamModel':
      return t('fieldUpstreamModel');
    case 'providerType':
      return t('fieldProviderType');
    case 'credentialRef':
      return t('fieldCredentialRef');
    default:
      return field;
  }
}

export function Models({
  client,
  identity,
}: {
  readonly client: AdminConsoleClient;
  readonly identity?: AdminIdentity | undefined;
}) {
  const canWrite = hasAdminPermission(identity, AdminPermission.ModelsWrite);
  const canAssign = hasAdminPermission(identity, AdminPermission.ModelsAssign);
  // Gateway sync state is ops data: without data_plane.write the console
  // neither requests it nor renders a technical verdict it cannot back.
  const canDataPlane = hasAdminPermission(identity, AdminPermission.DataPlaneWrite);
  const [state, setState] = useState<AdminModels | null>(null);
  const [users, setUsers] = useState<readonly PlatformUser[]>([]);
  const [roles, setRoles] = useState<readonly Role[]>([]);
  const [teams, setTeams] = useState<readonly Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [granting, setGranting] = useState<ModelGrantTarget | null>(null);
  const [detail, setDetail] = useState<AdminModel | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminModel | null>(null);
  const [deleting, setDeleting] = useState<AdminModel | null>(null);
  // Gateway sync state loads independently: a data-plane failure must not
  // block the catalog, and must not be shown as "applied".
  const [dataPlane, setDataPlane] = useState<AdminDataPlane | null>(null);
  const [dataPlaneError, setDataPlaneError] = useState<string | null>(null);
  const [dataPlaneLoading, setDataPlaneLoading] = useState(canDataPlane);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const reportMutationError = useCallback(() => {
    notify(AdminNotificationKind.Error, translate(language, 'modelFormFailed'));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [models, resources] = await Promise.all([client.models(identity), client.resources(identity)]);
      setState(models);
      setUsers(resources.users);
      setRoles(resources.roles);
      setTeams(resources.teams);
    } catch (err) {
      setState(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [client, identity]);

  const loadDataPlane = useCallback(async () => {
    setDataPlaneLoading(true);
    setDataPlaneError(null);
    try {
      setDataPlane(await client.dataPlane());
    } catch (err) {
      setDataPlane(null);
      setDataPlaneError(err instanceof Error ? err.message : String(err));
    } finally {
      setDataPlaneLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void load();
    if (canDataPlane) void loadDataPlane();
  }, [load, loadDataPlane, canDataPlane]);

  // Catalog-derived publish: the server replaces the desired routes with the
  // routes derived from the current catalog, then the gateway applies them.
  const publishRoutes = async () => {
    setPublishing(true);
    setPublishError(null);
    try {
      await client.publishDataPlaneRoutes();
      notify(AdminNotificationKind.Success, t('publishSucceeded'));
      await loadDataPlane();
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : String(err));
      notify(AdminNotificationKind.Error, t('publishFailed'));
    } finally {
      setPublishing(false);
    }
  };

  // Catalog mutations change what publish would derive, so the drift badges
  // reload alongside the catalog itself.
  const reloadAll = useCallback(async () => {
    await load();
    if (canDataPlane) await loadDataPlane();
  }, [load, loadDataPlane, canDataPlane]);

  // Models the publish would skip: disabled or incomplete gateway mapping.
  const publishExcluded = (state?.models ?? []).filter((model) => !catalogPublishable(model));

  if (granting) {
    return (
      <ModelGrantPage
        client={client}
        model={granting.model}
        existingAssignments={granting.assignments}
        users={users}
        roles={roles}
        teams={teams}
        onBack={() => setGranting(null)}
        onChanged={load}
        onError={reportMutationError}
      />
    );
  }

  const filtered = (state?.models ?? []).filter((model) => {
    if (!query.trim()) return true;
    const needle = query.trim().toLowerCase();
    return [model.id, model.displayName].some((value) => value.toLowerCase().includes(needle));
  });

  const columns = [
    {
      title: t('colModel'),
      key: 'model',
      render: (_: unknown, model: AdminModel) => (
        <Space orientation="vertical" size={0}>
          <Space size={6}>
            <Typography.Text strong>{model.displayName}</Typography.Text>
            {model.isDefault ? <Tag color="blue">{translate(language, 'defaultModel')}</Tag> : null}
          </Space>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {model.id}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: t('colUpstream'),
      key: 'upstream',
      render: (_: unknown, model: AdminModel) => model.upstreamModel || model.localModelRef || t('notProvided'),
    },
    {
      title: t('colManageState'),
      dataIndex: 'enabled',
      key: 'enabled',
      width: 100,
      render: (enabled: boolean) =>
        enabled ? <Tag color="success">{t('stateEnabled')}</Tag> : <Tag>{t('stateDisabled')}</Tag>,
    },
    {
      title: t('colConfigState'),
      key: 'config',
      width: 190,
      render: (_: unknown, model: AdminModel) => (
        <ConfigStateCell dataPlane={dataPlane} error={dataPlaneError} allowed={canDataPlane} modelId={model.id} />
      ),
    },
    {
      title: t('colTestState'),
      key: 'test',
      width: 170,
      render: (_: unknown, model: AdminModel) => <HealthStateCell model={model} />,
    },
    {
      title: translate(language, 'actions'),
      key: 'actions',
      align: 'right' as const,
      render: (_: unknown, model: AdminModel) => (
        // biome-ignore lint/a11y/noStaticElementInteractions: click shield so action buttons do not open the detail row
        // biome-ignore lint/a11y/useKeyWithClickEvents: see above — not an interactive control
        <span onClick={(event) => event.stopPropagation()}>
          <Space size={0}>
            <Button type="link" size="small" onClick={() => setDetail(model)}>
              {translate(language, 'viewDetails')}
            </Button>
            {canWrite ? (
              <Button type="link" size="small" onClick={() => setEditing(model)}>
                {translate(language, 'editModel')}
              </Button>
            ) : null}
            {canAssign ? (
              <Button
                type="link"
                size="small"
                icon={<UserOutlined />}
                onClick={() =>
                  setGranting({
                    model,
                    assignments: (state?.assignments ?? []).filter((item) => item.resourceId === model.id),
                  })
                }
              >
                {translate(language, 'grantModel')}
              </Button>
            ) : null}
            {canWrite ? (
              <ModelRowMenu
                client={client}
                model={model}
                assignmentCount={(state?.assignments ?? []).filter((item) => item.resourceId === model.id).length}
                onChanged={reloadAll}
                onError={reportMutationError}
                onDelete={() => setDeleting(model)}
              />
            ) : null}
          </Space>
        </span>
      ),
    },
  ];

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Typography.Title level={4} style={{ marginBottom: 4 }}>
            {t('modelsListTitle')}
          </Typography.Title>
          <Typography.Text type="secondary">{t('modelsListDescription')}</Typography.Text>
        </div>
        <Space>
          {canDataPlane ? (
            <Popconfirm
              title={t('publishConfirmTitle')}
              description={
                <div style={{ maxWidth: 360 }}>
                  <div>{t('publishConfirmDescription')}</div>
                  {publishExcluded.length > 0 ? (
                    <div style={{ marginTop: 8 }}>
                      {t('publishExcluded')}：
                      {publishExcluded
                        .map(
                          (model) =>
                            `${model.displayName}（${model.enabled ? t('publishExcludedIncomplete') : t('publishExcludedDisabled')}）`,
                        )
                        .join('、')}
                    </div>
                  ) : null}
                </div>
              }
              okText={t('publishAction')}
              cancelText={translate(language, 'cancel')}
              onConfirm={() => void publishRoutes()}
            >
              <Button icon={<RocketOutlined />} loading={publishing} disabled={Boolean(error)}>
                {t('publishAction')}
              </Button>
            </Popconfirm>
          ) : null}
          {canWrite ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
              {translate(language, 'addModel')}
            </Button>
          ) : null}
          <Button
            icon={<ReloadOutlined />}
            disabled={loading}
            onClick={() => {
              void load();
              if (canDataPlane) void loadDataPlane();
            }}
          >
            {translate(language, 'refresh')}
          </Button>
        </Space>
      </div>

      {error ? <Alert type="error" showIcon title={`${translate(language, 'modelsLoadFailed')}：${error}`} /> : null}
      {publishError ? (
        <Alert
          type="error"
          showIcon
          closable={{ onClose: () => setPublishError(null) }}
          title={`${t('publishFailed')}：${publishError}`}
        />
      ) : null}
      {state && canDataPlane && dataPlaneError && !error ? (
        <Alert type="warning" showIcon title={`${t('configLoadFailed')}：${dataPlaneError}`} />
      ) : null}

      <Input
        allowClear
        prefix={<SearchOutlined />}
        placeholder={t('searchPlaceholder')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        style={{ maxWidth: 320 }}
      />

      <Table
        rowKey="id"
        size="middle"
        loading={loading && state === null}
        dataSource={error ? [] : filtered}
        columns={columns}
        pagination={{ hideOnSinglePage: true }}
        onRow={(model) => ({ onClick: () => setDetail(model) })}
        locale={{
          emptyText: (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={translate(language, 'modelsEmpty')}>
              <Typography.Text type="secondary">{translate(language, 'modelsEmptyHint')}</Typography.Text>
            </Empty>
          ),
        }}
      />

      <ModelCreateModal
        client={client}
        identity={identity}
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={reloadAll}
      />
      <ModelEditorModal
        client={client}
        identity={identity}
        model={editing}
        onClose={() => setEditing(null)}
        onChanged={reloadAll}
      />
      <ModelDeleteModal
        client={client}
        model={deleting}
        assignmentCount={
          deleting ? (state?.assignments ?? []).filter((item) => item.resourceId === deleting.id).length : 0
        }
        onClose={() => setDeleting(null)}
        onChanged={reloadAll}
        onError={reportMutationError}
      />
      <ModelDetailDrawer
        client={client}
        model={detail}
        users={users}
        assignments={detail ? (state?.assignments ?? []).filter((item) => item.resourceId === detail.id) : []}
        canWrite={canWrite}
        canAssign={canAssign}
        dataPlane={dataPlane}
        dataPlaneError={dataPlaneError}
        dataPlaneLoading={dataPlaneLoading}
        dataPlaneAllowed={canDataPlane}
        onDataPlaneRefresh={loadDataPlane}
        onClose={() => setDetail(null)}
        onChanged={load}
        onError={reportMutationError}
        onEdit={(model) => setEditing(model)}
        onGrant={(model) =>
          setGranting({
            model,
            assignments: (state?.assignments ?? []).filter((item) => item.resourceId === model.id),
          })
        }
        onDelete={(model) => setDeleting(model)}
      />
    </div>
  );
}

/**
 * Probe-published health fields (control plane >= rev10). The pinned SDK
 * release predates them, so they are typed locally until the next bump.
 */
type ModelHealthFields = {
  readonly healthStatus?: string;
  readonly healthCheckedAt?: string | null;
  readonly healthSince?: string | null;
  readonly healthDetail?: string | null;
};

const HEALTH_PRESENTATION: Record<string, { color: string; copy: Parameters<typeof modelsT>[0] }> = {
  healthy: { color: 'success', copy: 'healthHealthy' },
  unknown: { color: 'default', copy: 'healthUnknown' },
  credential_invalid: { color: 'error', copy: 'healthCredentialInvalid' },
  denied: { color: 'error', copy: 'healthDenied' },
  model_missing: { color: 'error', copy: 'healthModelMissing' },
  unreachable: { color: 'warning', copy: 'healthUnreachable' },
  error: { color: 'warning', copy: 'healthError' },
};

// HealthStateCell renders the active-probe verdict: endpoint reachability,
// credential validity, and upstream model availability.
function HealthStateCell({ model }: { model: AdminModel & ModelHealthFields }) {
  const presentation = HEALTH_PRESENTATION[model.healthStatus ?? 'unknown'] ?? {
    color: 'default',
    copy: 'healthUnknown' as const,
  };
  const lines = [
    t('healthHint'),
    model.healthCheckedAt
      ? `${t('healthCheckedAt')}${formatDateTime(model.healthCheckedAt)}`
      : t('healthNever'),
    model.healthDetail ?? undefined,
  ].filter((line): line is string => Boolean(line));
  return (
    <Tooltip title={<span style={{ whiteSpace: 'pre-line' }}>{lines.join('\n')}</span>}>
      <Tag color={presentation.color}>{t(presentation.copy)}</Tag>
    </Tooltip>
  );
}

function ConfigStateCell({
  dataPlane,
  error,
  allowed,
  modelId,
}: {
  readonly dataPlane: AdminDataPlane | null;
  readonly error: string | null;
  readonly allowed: boolean;
  readonly modelId: string;
}) {
  if (!allowed) {
    return (
      <Tooltip title={t('configNoPermissionHint')}>
        <Tag>{t('configNoPermission')}</Tag>
      </Tooltip>
    );
  }
  if (error) {
    return (
      <Tooltip title={`${t('configLoadFailedHint')}（${error}）`}>
        <Tag>{t('configUnknown')}</Tag>
      </Tooltip>
    );
  }
  if (!dataPlane) {
    return <Tag>{t('configUnknown')}</Tag>;
  }
  const state = gatewayStateLabel(dataPlane);
  const included = routeIncluded(dataPlane, modelId);
  const missing = catalogMissing(dataPlane, modelId);
  const mismatch = catalogMismatch(dataPlane, modelId);
  const tooltip = [
    `${t('configTargetRevision')}：${dataPlane.desired.revision}`,
    `${t('configAppliedRevision')}：${dataPlane.status.observedRevision ?? '—'}`,
    included ? t('configRouteIncluded') : t('configRouteMissingHint'),
    ...(mismatch ? [`${t('driftMismatched')}：${mismatch.fields.map(driftFieldLabel).join('、')}`] : []),
    ...(missing ? [t('driftMissingHint')] : []),
  ].join('\n');
  return (
    <Tooltip title={<div style={{ whiteSpace: 'pre-line' }}>{tooltip}</div>}>
      <Space orientation="vertical" size={0}>
        <Tag color={state.color}>{state.label}</Tag>
        {mismatch ? <Tag color="warning">{t('driftMismatched')}</Tag> : null}
        {!mismatch && missing ? <Tag color="warning">{t('driftMissing')}</Tag> : null}
        {included || missing ? null : (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t('configRouteMissing')}
          </Typography.Text>
        )}
      </Space>
    </Tooltip>
  );
}

function ModelRowMenu({
  client,
  model,
  assignmentCount: _assignmentCount,
  onChanged,
  onError,
  onDelete,
}: {
  readonly client: AdminConsoleClient;
  readonly model: AdminModel;
  readonly assignmentCount: number;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
  readonly onDelete: () => void;
}) {
  const [pending, setPending] = useState(false);
  const run = async (operation: () => Promise<void>) => {
    setPending(true);
    try {
      await operation();
      await onChanged();
    } catch {
      onError();
    } finally {
      setPending(false);
    }
  };
  return (
    <Dropdown
      trigger={['click']}
      menu={{
        items: [
          ...(model.isDefault
            ? []
            : [
                {
                  key: 'default',
                  label: translate(language, 'makeDefault'),
                  onClick: () =>
                    void run(async () => {
                      await client.updateModel(model.id, { isDefault: true });
                    }),
                },
              ]),
          {
            key: 'toggle',
            label: translate(language, model.enabled ? 'disable' : 'enable'),
            onClick: () =>
              void run(async () => {
                await client.updateModel(model.id, { enabled: !model.enabled });
              }),
          },
          { type: 'divider' as const },
          { key: 'delete', label: translate(language, 'delete'), danger: true, onClick: onDelete },
        ],
      }}
    >
      <Button
        type="text"
        size="small"
        icon={<MoreOutlined />}
        aria-label={translate(language, 'actions')}
        disabled={pending}
        onClick={(event) => event.stopPropagation()}
      />
    </Dropdown>
  );
}

function ModelCreateModal({
  client,
  identity,
  open,
  onClose,
  onCreated,
}: {
  readonly client: AdminConsoleClient;
  readonly identity?: AdminIdentity | undefined;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onCreated: () => Promise<void>;
}) {
  const [form] = Form.useForm<{
    displayName: string;
    protocol: 'openai-compatible' | 'anthropic';
    endpoint: string;
    upstreamModel: string;
    credentialId?: string | null;
  }>();
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);
  const submit = async (values: {
    readonly displayName: string;
    readonly protocol: 'openai-compatible' | 'anthropic';
    readonly endpoint: string;
    readonly upstreamModel: string;
    readonly credentialId?: string | null;
  }) => {
    setPending(true);
    try {
      await client.createModel({
        displayName: values.displayName.trim(),
        sourceType: ModelSourceType.Gateway,
        protocol: values.protocol,
        endpoint: values.endpoint.trim(),
        upstreamModel: values.upstreamModel.trim(),
        capabilities: [],
        isDefault: false,
        enabled: true,
        // The identifier is server-generated from the display name; for
        // anthropic models it doubles as the gateway path prefix.
        credentialId: values.credentialId ?? null,
      });
      onClose();
      await onCreated();
      notify(AdminNotificationKind.Success, translate(language, 'changesSaved'));
    } catch (error) {
      notify(AdminNotificationKind.Error, modelSaveMessage(error));
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open={open}
      title={translate(language, 'addModel')}
      okText={translate(language, 'save')}
      cancelText={translate(language, 'cancel')}
      confirmLoading={pending}
      onCancel={onClose}
      onOk={() => void form.submit()}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">{translate(language, 'addModelDescription')}</Typography.Paragraph>
      <Form form={form} layout="vertical" onFinish={(values) => void submit(values)}>
        <Form.Item
          name="displayName"
          label={translate(language, 'modelName')}
          rules={[{ required: true, message: translate(language, 'fieldRequired') }]}
        >
          <Input disabled={pending} />
        </Form.Item>
        <Form.Item
          name="protocol"
          label={translate(language, 'modelProtocol')}
          initialValue={ModelProtocol.OpenAiCompatible}
          rules={[{ required: true, message: translate(language, 'fieldRequired') }]}
        >
          <Select disabled={pending} options={MODEL_PROTOCOL_OPTIONS} />
        </Form.Item>
        <Form.Item
          name="endpoint"
          label={translate(language, 'modelEndpoint')}
          rules={[{ required: true, message: translate(language, 'fieldRequired') }]}
        >
          <Input placeholder={translate(language, 'modelEndpointPlaceholder')} disabled={pending} />
        </Form.Item>
        <Form.Item
          name="upstreamModel"
          label={translate(language, 'upstreamModel')}
          rules={[{ required: true, message: translate(language, 'fieldRequired') }]}
        >
          <Input disabled={pending} />
        </Form.Item>
        <Form.Item name="credentialId" label={t('labelCredential')} initialValue={null}>
          <ModelConnectionSelect client={client} identity={identity} disabled={pending} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function ModelEditorModal({
  client,
  identity,
  model,
  onClose,
  onChanged,
}: {
  readonly client: AdminConsoleClient;
  readonly identity?: AdminIdentity | undefined;
  readonly model: AdminModel | null;
  readonly onClose: () => void;
  readonly onChanged: () => Promise<void>;
}) {
  // Without credentials.read the select renders the current reference as
  // read-only text and the patch below omits the key entirely, so the
  // server keeps the existing value instead of overwriting it with null.
  const canReadCredentials = hasAdminPermission(identity, AdminPermission.CredentialsRead);
  const [form] = Form.useForm<{
    displayName: string;
    endpoint: string;
    upstreamModel: string;
    enabled: boolean;
    isDefault: boolean;
    credentialId?: string | null;
  }>();
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (model) {
      form.resetFields();
      form.setFieldsValue({
        displayName: model.displayName,
        endpoint: model.endpoint ?? '',
        upstreamModel: model.upstreamModel ?? '',
        enabled: model.enabled,
        isDefault: model.isDefault,
        credentialId: model.credentialId ?? null,
      });
    }
  }, [model, form]);
  const submit = async (values: {
    readonly displayName: string;
    readonly endpoint: string;
    readonly upstreamModel: string;
    readonly enabled: boolean;
    readonly isDefault: boolean;
    readonly credentialId?: string | null;
  }) => {
    if (!model) return;
    setPending(true);
    try {
      await client.updateModel(model.id, {
        displayName: values.displayName.trim(),
        endpoint: values.endpoint.trim(),
        upstreamModel: values.upstreamModel.trim(),
        enabled: values.enabled,
        isDefault: values.isDefault,
        ...(canReadCredentials ? { credentialId: values.credentialId ?? null } : {}),
      });
      onClose();
      await onChanged();
      notify(AdminNotificationKind.Success, translate(language, 'changesSaved'));
    } catch (error) {
      notify(AdminNotificationKind.Error, modelSaveMessage(error));
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open={model !== null}
      title={translate(language, 'editModel')}
      okText={translate(language, 'save')}
      cancelText={translate(language, 'cancel')}
      confirmLoading={pending}
      onCancel={onClose}
      onOk={() => void form.submit()}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">{translate(language, 'addModelDescription')}</Typography.Paragraph>
      <Form form={form} layout="vertical" onFinish={(values) => void submit(values)}>
        <Form.Item
          name="displayName"
          label={translate(language, 'modelName')}
          rules={[{ required: true, message: translate(language, 'fieldRequired') }]}
        >
          <Input disabled={pending} />
        </Form.Item>
        <Form.Item
          name="endpoint"
          label={translate(language, 'modelEndpoint')}
          rules={[{ required: true, message: translate(language, 'fieldRequired') }]}
        >
          <Input placeholder={translate(language, 'modelEndpointPlaceholder')} disabled={pending} />
        </Form.Item>
        <Form.Item
          name="upstreamModel"
          label={translate(language, 'upstreamModel')}
          rules={[{ required: true, message: translate(language, 'fieldRequired') }]}
        >
          <Input disabled={pending} />
        </Form.Item>
        <Form.Item name="enabled" label={translate(language, 'status')} valuePropName="checked">
          <Switch checkedChildren={t('stateEnabled')} unCheckedChildren={t('stateDisabled')} disabled={pending} />
        </Form.Item>
        <Form.Item name="isDefault" label={translate(language, 'defaultModel')} valuePropName="checked">
          <Switch disabled={pending} />
        </Form.Item>
        <Form.Item name="credentialId" label={t('labelCredential')}>
          <ModelConnectionSelect client={client} identity={identity} disabled={pending} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function ModelDeleteModal({
  client,
  model,
  assignmentCount,
  onClose,
  onChanged,
  onError,
}: {
  readonly client: AdminConsoleClient;
  readonly model: AdminModel | null;
  readonly assignmentCount: number;
  readonly onClose: () => void;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
}) {
  const [pending, setPending] = useState(false);
  const remove = async () => {
    if (!model) return;
    setPending(true);
    try {
      await client.deleteModel(model.id);
      onClose();
      await onChanged();
    } catch {
      onError();
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open={model !== null}
      title={translate(language, 'deleteModelTitle')}
      okText={translate(language, 'delete')}
      okButtonProps={{ danger: true }}
      cancelText={translate(language, 'cancel')}
      confirmLoading={pending}
      onCancel={onClose}
      onOk={() => void remove()}
      destroyOnHidden
    >
      <Alert
        type="warning"
        showIcon
        title={translate(language, 'deleteModelDescription')}
        description={`${t('deleteImpactAssignments')}：${assignmentCount}`}
        style={{ marginBottom: 12 }}
      />
      <Typography.Text type="secondary">{t('disableImpact')}</Typography.Text>
    </Modal>
  );
}

function subjectTypeLabel(type: string): string {
  if (type === AdminModelSubjectType.User) return t('subjectTypeUser');
  if (type === AdminModelSubjectType.Role) return t('subjectTypeRole');
  if (type === AdminModelSubjectType.Team) return t('subjectTypeTeam');
  return type;
}

function ModelDetailDrawer({
  client,
  model,
  users,
  assignments,
  canWrite,
  canAssign,
  dataPlane,
  dataPlaneError,
  dataPlaneLoading,
  dataPlaneAllowed,
  onDataPlaneRefresh,
  onClose,
  onChanged,
  onError,
  onEdit,
  onGrant,
  onDelete,
}: {
  readonly client: AdminConsoleClient;
  readonly model: AdminModel | null;
  readonly users: readonly PlatformUser[];
  readonly assignments: readonly ModelAssignment[];
  readonly canWrite: boolean;
  readonly canAssign: boolean;
  readonly dataPlane: AdminDataPlane | null;
  readonly dataPlaneError: string | null;
  readonly dataPlaneLoading: boolean;
  readonly dataPlaneAllowed: boolean;
  readonly onDataPlaneRefresh: () => Promise<void>;
  readonly onClose: () => void;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
  readonly onEdit: (model: AdminModel) => void;
  readonly onGrant: (model: AdminModel) => void;
  readonly onDelete: (model: AdminModel) => void;
}) {
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const userNames = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const revoke = async (assignmentId: string) => {
    setRevokingId(assignmentId);
    try {
      await client.deleteModelAssignment(assignmentId);
      await onChanged();
    } catch {
      onError();
    } finally {
      setRevokingId(null);
    }
  };
  if (!model) return <Drawer open={false} onClose={onClose} />;

  const accessColumns = [
    {
      title: t('accessColSubject'),
      key: 'subject',
      render: (_: unknown, assignment: ModelAssignment) => {
        const user = userNames.get(assignment.subject.id);
        return user ? `${user.displayName}（${user.username}）` : assignment.subject.id;
      },
    },
    {
      title: t('accessColType'),
      key: 'type',
      width: 90,
      render: (_: unknown, assignment: ModelAssignment) => <Tag>{subjectTypeLabel(assignment.subject.type)}</Tag>,
    },
    {
      title: t('accessColTime'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (value: string) => formatDateTime(value),
    },
    ...(canAssign
      ? [
          {
            title: translate(language, 'actions'),
            key: 'actions',
            align: 'right' as const,
            render: (_: unknown, assignment: ModelAssignment) => (
              <Popconfirm
                title={translate(language, 'revokeConfirmTitle')}
                description={translate(language, 'revokeConfirmDescription')}
                okText={translate(language, 'confirmRevoke')}
                cancelText={translate(language, 'cancel')}
                okButtonProps={{ danger: true }}
                onConfirm={() => void revoke(assignment.id)}
              >
                <Button
                  type="link"
                  size="small"
                  danger
                  disabled={revokingId === assignment.id}
                  onClick={(event) => event.stopPropagation()}
                >
                  {translate(language, 'revoke')}
                </Button>
              </Popconfirm>
            ),
          },
        ]
      : []),
  ];

  return (
    <Drawer
      open
      size={720}
      onClose={onClose}
      title={
        <Space size={8}>
          <span>{model.displayName}</span>
          {model.enabled ? <Tag color="success">{t('stateEnabled')}</Tag> : <Tag>{t('stateDisabled')}</Tag>}
          {model.isDefault ? <Tag color="blue">{translate(language, 'defaultModel')}</Tag> : null}
        </Space>
      }
    >
      <Tabs
        defaultActiveKey="basic"
        items={[
          {
            key: 'basic',
            label: t('detailTabBasic'),
            children: (
              <div className="flex flex-col gap-4">
                <Space wrap>
                  {canWrite ? (
                    <>
                      <Button type="primary" onClick={() => onEdit(model)}>
                        {translate(language, 'editModel')}
                      </Button>
                      <Button danger onClick={() => onDelete(model)}>
                        {translate(language, 'delete')}
                      </Button>
                    </>
                  ) : null}
                  {canAssign ? (
                    <Button icon={<UserOutlined />} onClick={() => onGrant(model)}>
                      {translate(language, 'grantModel')}
                    </Button>
                  ) : null}
                </Space>
                <Descriptions
                  bordered
                  size="small"
                  column={1}
                  items={[
                    { key: 'id', label: t('labelModelId'), children: model.id },
                    {
                      key: 'displayName',
                      label: translate(language, 'modelName'),
                      children: model.displayName,
                    },
                    {
                      key: 'upstream',
                      label: t('labelUpstream'),
                      children: model.upstreamModel || model.localModelRef || t('notProvided'),
                    },
                    {
                      key: 'endpoint',
                      label: translate(language, 'modelEndpoint'),
                      children: (
                        <Typography.Text copyable style={{ fontFamily: 'monospace' }}>
                          {model.endpoint || t('notProvided')}
                        </Typography.Text>
                      ),
                    },
                    { key: 'protocol', label: t('labelProtocol'), children: model.protocol },
                    { key: 'source', label: t('labelSource'), children: model.sourceType },
                    {
                      key: 'credential',
                      label: t('labelCredential'),
                      children: model.credentialId ?? t('labelCredentialMissing'),
                    },
                    {
                      key: 'capabilities',
                      label: t('labelCapabilities'),
                      children:
                        model.capabilities && model.capabilities.length > 0
                          ? model.capabilities.join('、')
                          : t('notProvided'),
                    },
                  ]}
                />
                <Alert type="info" showIcon title={t('credentialNote')} />
              </div>
            ),
          },
          {
            key: 'access',
            label: t('detailTabAccess'),
            children: (
              <div className="flex flex-col gap-4">
                <Space wrap>
                  {canAssign ? (
                    <Button type="primary" onClick={() => onGrant(model)}>
                      {t('accessAction')}
                    </Button>
                  ) : null}
                </Space>
                <Alert type="info" showIcon title={t('accessHint')} />
                <Table
                  rowKey="id"
                  size="small"
                  dataSource={assignments}
                  columns={accessColumns}
                  pagination={{ hideOnSinglePage: true }}
                  locale={{
                    emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('accessEmpty')} />,
                  }}
                />
              </div>
            ),
          },
          {
            key: 'employees',
            label: t('detailTabEmployees'),
            children: (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('associatedGapTitle')}>
                <Typography.Paragraph type="secondary" style={{ maxWidth: 480, margin: '0 auto' }}>
                  {t('associatedGapDescription')}
                </Typography.Paragraph>
              </Empty>
            ),
          },
          {
            key: 'status',
            label: t('detailTabStatus'),
            children: (
              <ConfigStatusPanel
                model={model}
                dataPlane={dataPlane}
                error={dataPlaneError}
                loading={dataPlaneLoading}
                allowed={dataPlaneAllowed}
                onRefresh={onDataPlaneRefresh}
              />
            ),
          },
        ]}
      />
    </Drawer>
  );
}

function ConfigStatusPanel({
  model,
  dataPlane,
  error,
  loading,
  allowed,
  onRefresh,
}: {
  readonly model: AdminModel;
  readonly dataPlane: AdminDataPlane | null;
  readonly error: string | null;
  readonly loading: boolean;
  readonly allowed: boolean;
  readonly onRefresh: () => Promise<void>;
}) {
  if (!allowed) {
    return (
      <Alert type="info" showIcon title={t('configNoPermissionTitle')} description={t('configNoPermissionHint')} />
    );
  }
  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <Alert
          type="error"
          showIcon
          title={`${t('configLoadFailed')}：${error}`}
          description={t('configLoadFailedHint')}
        />
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void onRefresh()}>
          {t('configRefresh')}
        </Button>
      </div>
    );
  }
  if (!dataPlane) {
    return (
      <div className="flex flex-col gap-4">
        <Alert type="info" showIcon title={t('configUnknown')} description={t('configNotConfirmed')} />
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void onRefresh()}>
          {t('configRefresh')}
        </Button>
      </div>
    );
  }
  const state = gatewayStateLabel(dataPlane);
  const included = routeIncluded(dataPlane, model.id);
  const observed = dataPlane.status.observedRevision;
  const comparison = dataPlane.status.catalogComparison;
  const mismatch = catalogMismatch(dataPlane, model.id);
  const missing = catalogMissing(dataPlane, model.id);
  const publishState = !comparison ? null : mismatch ? (
    <Tag color="warning">{t('driftMismatched')}</Tag>
  ) : missing ? (
    <Tag color="warning">{t('driftMissing')}</Tag>
  ) : included ? (
    <Tag color="success">{t('catalogPublishIncluded')}</Tag>
  ) : (
    <Tag>{t('catalogPublishSkipped')}</Tag>
  );
  return (
    <div className="flex flex-col gap-4">
      <Alert type="info" showIcon title={t('statusAlertTitle')} description={t('statusAlertDescription')} />
      <Descriptions
        bordered
        size="small"
        column={1}
        items={[
          {
            key: 'manage',
            label: t('colManageState'),
            children: model.enabled ? t('stateEnabled') : t('stateDisabled'),
          },
          {
            key: 'state',
            label: t('configGatewayState'),
            children: <Tag color={state.color}>{state.label}</Tag>,
          },
          {
            key: 'target',
            label: t('configTargetRevision'),
            children: dataPlane.desired.revision,
          },
          {
            key: 'applied',
            label: t('configAppliedRevision'),
            children: observed ?? t('configUnknown'),
          },
          {
            key: 'sync',
            label: t('configLastSync'),
            children: formatDateTime(dataPlane.status.lastAppliedAt),
          },
          {
            key: 'route',
            label: t('colConfigState'),
            children: included ? (
              t('configRouteIncluded')
            ) : (
              <Tooltip title={t('configRouteMissingHint')}>
                <span>{t('configRouteMissing')}</span>
              </Tooltip>
            ),
          },
          ...(publishState ? [{ key: 'catalog', label: t('catalogPublishState'), children: publishState }] : []),
          ...(mismatch
            ? [
                {
                  key: 'drift',
                  label: t('driftFields'),
                  children: mismatch.fields.map(driftFieldLabel).join('、'),
                },
              ]
            : []),
          {
            key: 'executor',
            label: t('labelExecutionService'),
            children: t('executionServiceGateway'),
          },
        ]}
      />
      {observed === null || observed === undefined ? (
        <Typography.Text type="secondary">{t('configNotConfirmed')}</Typography.Text>
      ) : null}
      <Timeline
        items={[
          {
            children: `${t('statusTimelineSaved')} · ${formatDateTime(dataPlane.desired.publishedAt)}`,
          },
          state.confirmed
            ? {
                color: 'green',
                children: `${t('statusTimelineApplied')} · ${formatDateTime(dataPlane.status.lastAppliedAt)}`,
              }
            : {
                color: 'gray',
                children: t('statusTimelineNotApplied'),
              },
        ]}
      />
      <div>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void onRefresh()}>
          {t('configRefresh')}
        </Button>
      </div>
    </div>
  );
}

type ModelGrantFilter = 'all' | AdminModelSubjectType;

function ModelGrantPage({
  client,
  model,
  existingAssignments,
  users,
  roles,
  teams,
  onBack,
  onChanged,
  onError,
}: {
  readonly client: AdminConsoleClient;
  readonly model: AdminModel;
  readonly existingAssignments: readonly ModelAssignment[];
  readonly users: readonly PlatformUser[];
  readonly roles: readonly Role[];
  readonly teams: readonly Team[];
  readonly onBack: () => void;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [failedSubjects, setFailedSubjects] = useState<readonly string[]>([]);
  const [filter, setFilter] = useState<ModelGrantFilter>('all');
  const [query, setQuery] = useState('');
  const excluded = useMemo(
    () => new Set(existingAssignments.map((item) => `${item.subject.type}:${item.subject.id}`)),
    [existingAssignments],
  );

  const toggleSubject = useCallback((subjectKey: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(subjectKey)) next.delete(subjectKey);
      else next.add(subjectKey);
      return next;
    });
  }, []);

  const submit = async () => {
    if (selected.size === 0) return;
    setPending(true);
    setFailedSubjects([]);
    try {
      const results = await runBatch([...selected], (subjectKey) => {
        const separator = subjectKey.indexOf(':');
        const type = subjectKey.slice(0, separator) as AdminModelSubjectType;
        const id = subjectKey.slice(separator + 1);
        return client.createModelAssignment({ modelId: model.id, subject: { type, id } });
      });
      const failures = results.filter((result) => !result.ok).map((result) => result.item);
      if (failures.length > 0) {
        setFailedSubjects(failures);
        setSelected(new Set(failures));
        await onChanged();
        return;
      }
      await onChanged();
      onBack();
    } catch {
      onError();
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-start gap-3">
        <Button icon={<ArrowLeftOutlined />} onClick={onBack}>
          {translate(language, 'grantModelBack')}
        </Button>
        <div>
          <Typography.Title level={4} style={{ marginBottom: 4 }}>
            {translate(language, 'grantModelTitle')}
          </Typography.Title>
          <Typography.Text type="secondary">
            {translate(language, 'grantModelDescription')} <Typography.Text strong>{model.displayName}</Typography.Text>
          </Typography.Text>
        </div>
      </div>

      {failedSubjects.length > 0 ? (
        <Alert
          type="error"
          showIcon
          title={translate(language, 'grantFailed')}
          description={`${translate(language, 'grantFailedSubjects')}：${failedSubjects.join(', ')}`}
        />
      ) : null}

      <div className="flex flex-col gap-4">
        <Segmented
          value={filter}
          onChange={(value) => setFilter(value as ModelGrantFilter)}
          options={[
            { label: translate(language, 'grantModelAll'), value: 'all' },
            { label: translate(language, 'grantModelUsers'), value: AdminModelSubjectType.User },
            { label: translate(language, 'grantModelRoles'), value: AdminModelSubjectType.Role },
            { label: translate(language, 'grantModelTeams'), value: AdminModelSubjectType.Team },
          ]}
        />
        <Input
          allowClear
          prefix={<SearchOutlined />}
          aria-label={translate(language, 'grantModelSearch')}
          placeholder={translate(language, 'grantModelSearchPlaceholder')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={pending}
          style={{ maxWidth: 360 }}
        />
        <SubjectPicker
          users={users}
          roles={roles}
          teams={teams}
          filter={filter}
          query={query}
          excluded={excluded}
          selected={selected}
          onToggle={toggleSubject}
          disabled={pending}
        />
        <div className="flex items-center justify-between gap-3">
          <Typography.Text type="secondary">
            {translate(language, 'selectedSubjectsLabel')}：{selected.size}
          </Typography.Text>
          <Button
            type="primary"
            disabled={pending || selected.size === 0}
            loading={pending}
            onClick={() => void submit()}
          >
            {translate(language, pending ? 'granting' : 'grant')}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface SubjectOption {
  readonly key: string;
  readonly type: AdminModelSubjectType;
  readonly label: string;
}

function SubjectPicker({
  users,
  roles,
  teams,
  filter,
  query,
  excluded,
  selected,
  onToggle,
  disabled,
}: {
  readonly users: readonly PlatformUser[];
  readonly roles: readonly Role[];
  readonly teams: readonly Team[];
  readonly filter: ModelGrantFilter;
  readonly query: string;
  readonly excluded: ReadonlySet<string>;
  readonly selected: ReadonlySet<string>;
  readonly onToggle: (subjectKey: string) => void;
  readonly disabled: boolean;
}) {
  const options = useMemo<readonly SubjectOption[]>(() => {
    const items: SubjectOption[] = [];
    if (filter === 'all' || filter === AdminModelSubjectType.User) {
      for (const user of users) {
        items.push({
          key: `${AdminModelSubjectType.User}:${user.id}`,
          type: AdminModelSubjectType.User,
          label: `${user.displayName}（${user.username}）`,
        });
      }
    }
    if (filter === 'all' || filter === AdminModelSubjectType.Role) {
      for (const role of roles) {
        items.push({
          key: `${AdminModelSubjectType.Role}:${role.id}`,
          type: AdminModelSubjectType.Role,
          label: role.name,
        });
      }
    }
    if (filter === 'all' || filter === AdminModelSubjectType.Team) {
      for (const team of teams) {
        items.push({
          key: `${AdminModelSubjectType.Team}:${team.id}`,
          type: AdminModelSubjectType.Team,
          label: team.name,
        });
      }
    }
    const needle = query.trim().toLowerCase();
    return items.filter(
      (item) =>
        !excluded.has(item.key) &&
        (!needle || item.label.toLowerCase().includes(needle) || item.key.toLowerCase().includes(needle)),
    );
  }, [users, roles, teams, filter, query, excluded]);

  if (options.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={translate(language, 'noMatchingSubjects')} />;
  }
  return (
    <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">
      {options.map((option) => (
        <Checkbox
          key={option.key}
          checked={selected.has(option.key)}
          disabled={disabled}
          onChange={() => onToggle(option.key)}
        >
          <Space size={6}>
            <Tag style={{ marginRight: 0 }}>{subjectTypeLabel(option.type)}</Tag>
            <span>{option.label}</span>
          </Space>
        </Checkbox>
      ))}
    </div>
  );
}
