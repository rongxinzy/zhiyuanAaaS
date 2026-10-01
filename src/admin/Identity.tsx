import type { PlatformUser } from '@aep/sdk-node';
import { InfoCircleOutlined, LinkOutlined, PlusOutlined, ReloadOutlined, SafetyOutlined } from '@ant-design/icons';
import {
  Alert,
  AutoComplete,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Radio,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  type AdminConsoleClient,
  type AdminIdentity,
  type AdminIdentityMapping,
  AdminIdentityMappingStatus,
  type AdminIdentitySource,
  AdminIdentitySourceKind,
  AdminIdentitySubjectType,
  AdminPermission,
  hasAdminPermission,
} from './client.js';
/** 2026-09-30 LiXiang2019 列表查询按钮组（查询/重置/导出） */
import { ListQueryActions } from './components/ListQueryActions.js';
import { type AdminLanguage, translate } from './i18n.js';
import { identityCopy as copy } from './identity-copy.js';
import { AdminNotificationKind, notify } from './notifications.js';

const language: AdminLanguage = 'zh';

/** 2026-09-30 LiXiang2019 账号关联列表筛选表单字段 */
interface IdentityListFilters {
  readonly query?: string;
  readonly sourceId?: string;
  readonly status?: string;
}

const IdentitySourceKindOrder = [
  AdminIdentitySourceKind.Directory,
  AdminIdentitySourceKind.Ldap,
  AdminIdentitySourceKind.Oidc,
] as const;

const IDENTITY_SOURCE_ID_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

const NO_SOURCES: readonly AdminIdentitySource[] = [];
const NO_ROWS: readonly MappingRow[] = [];
const NO_USERS: readonly PlatformUser[] = [];

/** A mapping joined with the source it belongs to, for the flat list. */
interface MappingRow extends AdminIdentityMapping {
  readonly sourceName: string;
  readonly sourceKind: string;
}

/**
 * Account mappings (账号关联): links external accounts from source platforms
 * such as WeCom directories to platform users. Rebinding an external account
 * requires an explicit confirmation so an existing binding is never silently
 * overwritten. This is not SSO or directory sync.
 */
export function Identity({
  client,
  identity,
}: {
  readonly client: AdminConsoleClient;
  readonly identity?: AdminIdentity | undefined;
}) {
  const canWrite = hasAdminPermission(identity, AdminPermission.IdentityWrite);
  const canReadUsers = hasAdminPermission(identity, AdminPermission.UsersRead);

  const [sources, setSources] = useState<readonly AdminIdentitySource[] | null>(null);
  const [rows, setRows] = useState<readonly MappingRow[] | null>(null);
  const [users, setUsers] = useState<readonly PlatformUser[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [partialFailures, setPartialFailures] = useState<readonly string[]>([]);
  const [creatingSource, setCreatingSource] = useState(false);
  const [editing, setEditing] = useState<MappingRow | 'new' | null>(null);
  const [unlinking, setUnlinking] = useState<MappingRow | null>(null);
  // 2026-09-30 LiXiang2019 账号关联筛选：点查询后才应用条件
  const [filterForm] = Form.useForm<IdentityListFilters>();
  const [filters, setFilters] = useState<IdentityListFilters>({});
  const [revision, refresh] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setFailed(false);
    setPartialFailures([]);
    const loadUsers = canReadUsers ? client.users().catch(() => null) : Promise.resolve(null);
    void Promise.all([client.identitySources(), loadUsers])
      .then(([page, knownUsers]) => {
        const items = page.items;
        return Promise.allSettled(items.map((source) => client.identityMappings(source.id))).then((results) => {
          if (!live) return;
          setSources(items);
          setUsers(knownUsers);
          const next: MappingRow[] = [];
          const failedSources: string[] = [];
          results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
              for (const mapping of result.value.items) {
                next.push({ ...mapping, sourceName: items[index]!.displayName, sourceKind: items[index]!.kind });
              }
            } else {
              failedSources.push(items[index]!.displayName);
            }
          });
          setRows(next);
          setPartialFailures(failedSources);
        });
      })
      .catch(() => {
        if (live) {
          setFailed(true);
          setSources(null);
          setRows(null);
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [client, canReadUsers, revision]);

  const usersById = useMemo(() => new Map((users ?? []).map((user) => [user.id, user])), [users]);

  const userLabel = useCallback(
    (userId: string): { readonly primary: string; readonly secondary: string } => {
      const user = usersById.get(userId);
      if (user)
        return { primary: user.displayName, secondary: `${userId}${user.username ? ` · ${user.username}` : ''}` };
      return { primary: userId, secondary: userId };
    },
    [usersById],
  );

  const filtered = useMemo(() => {
    if (!rows) return [];
    const keyword = (filters.query ?? '').trim().toLowerCase();
    return rows.filter((row) => {
      if (filters.sourceId && row.sourceId !== filters.sourceId) return false;
      if (filters.status && row.status !== filters.status) return false;
      if (!keyword) return true;
      const label = userLabel(row.localSubjectId);
      return (
        row.externalId.toLowerCase().includes(keyword) ||
        label.primary.toLowerCase().includes(keyword) ||
        label.secondary.toLowerCase().includes(keyword)
      );
    });
  }, [rows, filters, userLabel]);

  const columns = useMemo(
    () => [
      {
        title: copy.sourceListTitle,
        key: 'source',
        render: (_: unknown, row: MappingRow) => (
          <Space orientation="vertical" size={0}>
            <span>{row.sourceName}</span>
            <Tag>{identityKindLabel(row.sourceKind)}</Tag>
          </Space>
        ),
      },
      {
        title: copy.externalAccount,
        key: 'externalId',
        render: (_: unknown, row: MappingRow) => (
          <Typography.Text code copyable={{ text: row.externalId }}>
            {row.externalId}
          </Typography.Text>
        ),
      },
      {
        title: copy.platformUser,
        key: 'user',
        render: (_: unknown, row: MappingRow) => {
          const label = userLabel(row.localSubjectId);
          return (
            <Space orientation="vertical" size={0}>
              <span>{label.primary}</span>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {label.secondary}
              </Typography.Text>
            </Space>
          );
        },
      },
      {
        title: translate(language, 'status'),
        key: 'status',
        render: (_: unknown, row: MappingRow) =>
          row.status === AdminIdentityMappingStatus.Active ? (
            <Tag color="success">{copy.linkActive}</Tag>
          ) : (
            <Tag>{copy.linkDisabled}</Tag>
          ),
      },
      {
        title: copy.linkTime,
        key: 'linkTime',
        render: () => <Typography.Text type="secondary">{copy.linkTimeUnknown}</Typography.Text>,
      },
      ...(canWrite
        ? [
            {
              title: translate(language, 'actions'),
              key: 'actions',
              render: (_: unknown, row: MappingRow) => (
                <Space size={0}>
                  <Button type="link" size="small" onClick={() => setEditing(row)}>
                    {translate(language, 'edit')}
                  </Button>
                  <Button type="link" size="small" danger onClick={() => setUnlinking(row)}>
                    {copy.unlink}
                  </Button>
                </Space>
              ),
            },
          ]
        : []),
    ],
    [canWrite, userLabel],
  );

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Typography.Text type="secondary">
            <InfoCircleOutlined style={{ marginInlineEnd: 6 }} />
            {copy.pageDescription}
          </Typography.Text>
        </div>
        <Space wrap>
          {canWrite ? (
            <>
              <Button icon={<PlusOutlined />} onClick={() => setCreatingSource(true)}>
                {copy.addSource}
              </Button>
              <Button type="primary" icon={<LinkOutlined />} onClick={() => setEditing('new')}>
                {copy.addLink}
              </Button>
            </>
          ) : null}
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => refresh((value) => value + 1)}>
            {translate(language, 'refresh')}
          </Button>
        </Space>
      </div>

      {!canReadUsers ? <Alert type="info" showIcon title={copy.userNamesUnavailable} /> : null}
      {failed ? (
        <Alert
          type="error"
          showIcon
          title={copy.sourcesLoadFailed}
          action={
            <Button size="small" onClick={() => refresh((value) => value + 1)}>
              {copy.retry}
            </Button>
          }
        />
      ) : null}
      {partialFailures.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          title={copy.partialSourcesFailed}
          description={
            <Space wrap>
              {partialFailures.map((name) => (
                <Tag key={name}>{name}</Tag>
              ))}
            </Space>
          }
        />
      ) : null}

      {/* 2026-09-30 LiXiang2019 账号关联筛选条件 + 查询/重置按钮组 */}
      <Form form={filterForm} layout="inline" style={{ gap: 12 }}>
        <Form.Item name="query" style={{ marginInlineEnd: 0 }}>
          <Input allowClear placeholder={copy.searchPlaceholder} style={{ width: 240 }} />
        </Form.Item>
        <Form.Item name="sourceId" style={{ marginInlineEnd: 0 }}>
          <Select
            allowClear
            placeholder={copy.sourceListTitle}
            style={{ minWidth: 180 }}
            options={(sources ?? NO_SOURCES).map((source) => ({ value: source.id, label: source.displayName }))}
          />
        </Form.Item>
        <Form.Item name="status" style={{ marginInlineEnd: 0 }}>
          <Select
            allowClear
            placeholder={translate(language, 'status')}
            style={{ minWidth: 140 }}
            options={[
              { value: AdminIdentityMappingStatus.Active, label: copy.linkActive },
              { value: AdminIdentityMappingStatus.Disabled, label: copy.linkDisabled },
            ]}
          />
        </Form.Item>
        <Form.Item style={{ marginInlineEnd: 0 }}>
          <ListQueryActions
            form={filterForm}
            searching={loading}
            search={{ run: (values) => setFilters(values) }}
            onReset={() => setFilters({})}
          />
        </Form.Item>
      </Form>

      {failed && rows === null ? null : (
        <Table
          rowKey={(row) => `${row.sourceId}/${row.externalSubjectType}/${row.externalId}`}
          columns={columns}
          dataSource={[...filtered]}
          loading={loading && rows === null}
          scroll={{ x: 720 }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={sources && sources.length === 0 ? copy.sourcesEmpty : copy.linksEmpty}
              />
            ),
          }}
          pagination={{ hideOnSinglePage: true, showSizeChanger: false }}
        />
      )}

      {canWrite && creatingSource ? (
        <SourceCreateModal
          client={client}
          open
          onClose={() => setCreatingSource(false)}
          onChanged={() => refresh((value) => value + 1)}
        />
      ) : null}
      {canWrite && editing ? (
        <MappingModal
          client={client}
          open
          sources={sources ?? NO_SOURCES}
          rows={rows ?? NO_ROWS}
          editing={editing === 'new' ? undefined : editing}
          userOptions={(users ?? NO_USERS).map((user) => ({
            value: user.id,
            label: `${user.displayName}${user.username ? `（${user.username}）` : `（${user.id}）`}`,
          }))}
          onClose={() => setEditing(null)}
          onChanged={() => refresh((value) => value + 1)}
        />
      ) : null}
      {canWrite && unlinking ? (
        <UnlinkModal
          client={client}
          row={unlinking}
          onClose={() => setUnlinking(null)}
          onChanged={() => refresh((value) => value + 1)}
        />
      ) : null}
    </div>
  );
}

function SourceCreateModal({
  client,
  open,
  onClose,
  onChanged,
}: {
  readonly client: AdminConsoleClient;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onChanged: () => void;
}) {
  const [form] = Form.useForm<{ id: string; displayName: string; kind: AdminIdentitySourceKind }>();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({ kind: AdminIdentitySourceKind.Directory });
      setFailed(false);
    }
  }, [open, form]);
  const submit = async (values: { id: string; displayName: string; kind: AdminIdentitySourceKind }) => {
    setPending(true);
    setFailed(false);
    try {
      await client.createIdentitySource({
        id: values.id.trim(),
        kind: values.kind,
        displayName: values.displayName.trim(),
      });
      notify(AdminNotificationKind.Success, copy.sourceCreated);
      onClose();
      onChanged();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open={open}
      title={copy.addSourceTitle}
      okText={translate(language, 'save')}
      cancelText={translate(language, 'cancel')}
      confirmLoading={pending}
      destroyOnHidden
      onCancel={() => {
        if (!pending) onClose();
      }}
      onOk={() => void form.submit()}
    >
      <Form form={form} layout="vertical" onFinish={(values) => void submit(values)} disabled={pending}>
        {failed ? <Alert type="error" showIcon style={{ marginBottom: 16 }} title={copy.sourceCreateFailed} /> : null}
        <Form.Item
          name="id"
          label={copy.sourceIdLabel}
          rules={[
            { required: true, message: copy.sourceIdInvalid },
            { pattern: IDENTITY_SOURCE_ID_PATTERN, message: copy.sourceIdInvalid },
          ]}
        >
          <Input placeholder={copy.sourceIdPlaceholder} />
        </Form.Item>
        <Form.Item
          name="displayName"
          label={copy.sourceNameLabel}
          rules={[{ required: true, message: copy.sourceNameRequired }]}
        >
          <Input />
        </Form.Item>
        <Form.Item name="kind" label={copy.sourceKindLabel} rules={[{ required: true }]}>
          <Radio.Group>
            {IdentitySourceKindOrder.map((kind) => (
              <Radio.Button key={kind} value={kind}>
                {identityKindLabel(kind)}
              </Radio.Button>
            ))}
          </Radio.Group>
        </Form.Item>
      </Form>
    </Modal>
  );
}

function MappingModal({
  client,
  open,
  sources,
  rows,
  editing,
  userOptions,
  onClose,
  onChanged,
}: {
  readonly client: AdminConsoleClient;
  readonly open: boolean;
  readonly sources: readonly AdminIdentitySource[];
  readonly rows: readonly MappingRow[];
  readonly editing: MappingRow | undefined;
  readonly userOptions: readonly { readonly value: string; readonly label: string }[];
  readonly onClose: () => void;
  readonly onChanged: () => void;
}) {
  const [form] = Form.useForm<{ sourceId: string; externalId: string; localSubjectId: string }>();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [conflict, setConflict] = useState<{ readonly current: string; readonly next: string } | null>(null);
  useEffect(() => {
    if (open) {
      form.resetFields();
      const initial: { sourceId?: string; externalId: string; localSubjectId: string } = {
        externalId: editing?.externalId ?? '',
        localSubjectId: editing?.localSubjectId ?? '',
      };
      const sourceId = editing?.sourceId ?? sources[0]?.id;
      if (sourceId) initial.sourceId = sourceId;
      form.setFieldsValue(initial);
      setFailed(false);
      setConflict(null);
    }
  }, [open, editing, sources, form]);
  const submit = async (values: { sourceId: string; externalId: string; localSubjectId: string }) => {
    const externalId = values.externalId.trim();
    const localSubjectId = values.localSubjectId.trim();
    // An external account must never silently move to another user: when the
    // new binding differs from the current one, show both and require an
    // explicit confirmation before the upsert overwrites it.
    const existing = rows.find((row) => row.sourceId === values.sourceId && row.externalId === externalId);
    if (existing && existing.localSubjectId !== localSubjectId && !conflict) {
      setConflict({ current: existing.localSubjectId, next: localSubjectId });
      return;
    }
    setPending(true);
    setFailed(false);
    try {
      await client.upsertIdentityMapping(values.sourceId, {
        externalSubjectType: AdminIdentitySubjectType.User,
        externalId,
        localSubjectId,
      });
      notify(AdminNotificationKind.Success, copy.mappingSaved);
      onClose();
      onChanged();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open={open}
      title={editing ? copy.editLinkTitle : copy.addLinkTitle}
      okText={conflict ? copy.bindingConflictConfirm : translate(language, 'save')}
      okButtonProps={conflict ? { danger: true } : {}}
      cancelText={translate(language, 'cancel')}
      confirmLoading={pending}
      destroyOnHidden
      onCancel={() => {
        if (!pending) onClose();
      }}
      onOk={() => void form.submit()}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => void submit(values)}
        onValuesChange={() => setConflict(null)}
        disabled={pending}
      >
        {failed ? <Alert type="error" showIcon style={{ marginBottom: 16 }} title={copy.mappingSaveFailed} /> : null}
        {conflict ? (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            title={copy.bindingConflictTitle}
            description={
              <div>
                <div>
                  {copy.bindingConflictCurrent}：<Typography.Text code>{conflict.current}</Typography.Text>
                </div>
                <div>
                  {copy.bindingConflictNext}：<Typography.Text code>{conflict.next}</Typography.Text>
                </div>
              </div>
            }
          />
        ) : null}
        <Form.Item name="sourceId" label={copy.sourceListTitle} rules={[{ required: true }]}>
          <Select
            options={sources.map((source) => ({ value: source.id, label: source.displayName }))}
            disabled={Boolean(editing)}
          />
        </Form.Item>
        <Form.Item
          name="externalId"
          label={copy.externalAccount}
          rules={[{ required: true, message: copy.mappingExternalIdRequired }]}
        >
          <Input disabled={Boolean(editing)} />
        </Form.Item>
        <Form.Item
          name="localSubjectId"
          label={copy.selectPlatformUser}
          rules={[{ required: true, message: copy.mappingUserRequired }]}
          extra={copy.selectPlatformUserPlaceholder}
        >
          <AutoComplete
            options={[...userOptions]}
            showSearch={{
              filterOption: (input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase()),
            }}
          />
        </Form.Item>
        <Alert type="info" showIcon title={copy.noOverwriteNote} />
      </Form>
    </Modal>
  );
}

function UnlinkModal({
  client,
  row,
  onClose,
  onChanged,
}: {
  readonly client: AdminConsoleClient;
  readonly row: MappingRow;
  readonly onClose: () => void;
  readonly onChanged: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const submit = async () => {
    setPending(true);
    setFailed(false);
    try {
      await client.deleteIdentityMapping(row.sourceId, row.externalId);
      notify(AdminNotificationKind.Success, copy.mappingRemoved);
      onClose();
      onChanged();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open
      title={copy.unlinkTitle}
      okText={copy.confirmUnlink}
      okButtonProps={{ danger: true }}
      cancelText={translate(language, 'cancel')}
      confirmLoading={pending}
      onCancel={() => {
        if (!pending) onClose();
      }}
      onOk={() => void submit()}
    >
      {failed ? <Alert type="error" showIcon style={{ marginBottom: 16 }} title={copy.mappingDeleteFailed} /> : null}
      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        <Space orientation="vertical" size={2}>
          <span>
            {copy.sourceListTitle}：<strong>{row.sourceName}</strong>
          </span>
          <span>
            {copy.externalAccount}：<Typography.Text code>{row.externalId}</Typography.Text>
          </span>
        </Space>
        <Alert type="warning" showIcon icon={<SafetyOutlined />} title={copy.unlinkImpact} />
      </Space>
    </Modal>
  );
}

function identityKindLabel(kind: string): string {
  if (kind === AdminIdentitySourceKind.Directory) return translate(language, 'identityKindDirectory');
  if (kind === AdminIdentitySourceKind.Ldap) return translate(language, 'identityKindLdap');
  if (kind === AdminIdentitySourceKind.Oidc) return translate(language, 'identityKindOidc');
  return kind;
}
