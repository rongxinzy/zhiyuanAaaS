import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Segmented,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Select,
  Typography,
} from 'antd';
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  MessageOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';

import type { AdminConsoleClient, AdminIdentity } from './client.js';
import { translate, type AdminLanguage } from './i18n.js';
import { AdminNotificationKind, notify } from './notifications.js';
import {
  PortalClient,
  chatUIBaseURL,
  portalChatBaseURL,
  type PortalEmployee,
  type PortalRequest,
  type PortalDepartment,
} from './portal.js';
import { MemoryView } from './ServiceStatus.js';
import { employeesT } from './employees-copy.js';

const language: AdminLanguage = 'zh';
const t = (key: Parameters<typeof employeesT>[0]): string => employeesT(key, language);

const DigitalEmployeesTab = {
  Employees: 'employees',
  Requests: 'requests',
} as const;
type DigitalEmployeesTab = (typeof DigitalEmployeesTab)[keyof typeof DigitalEmployeesTab];

// Mirrors the portal's own apply-time validation (portal/api.go namePattern):
// keep both in step or the server rejects with a 400 the UI could have caught.
const EMPLOYEE_NAME_PATTERN = /^[a-z][a-z0-9-]{1,30}[a-z0-9]$/;

export function DigitalEmployees({
  client,
  portal,
  initialTab,
}: {
  readonly client: AdminConsoleClient;
  /** Test seam: injected portal helpers (defaults to a bearer client). */
  readonly portal?: PortalClient | undefined;
  /** Reserved: AEP identity. Creation/approval rights stay portal-side —
   * the apply result (201 created vs 202 pending) is the real signal, so
   * the identity is not used to fake an admin-only flow client-side. */
  readonly identity?: AdminIdentity | undefined;
  /** Lets the shell deep-link straight into the approvals tab. */
  readonly initialTab?: DigitalEmployeesTab | undefined;
}) {
  const [resolvedPortal] = useState(
    () => portal ?? new PortalClient(() => client.getAccessToken()),
  );
  const [tab, setTab] = useState<DigitalEmployeesTab>(initialTab ?? DigitalEmployeesTab.Employees);
  return (
    <div className="flex w-full flex-col gap-6">
      <div>
        <Typography.Title level={4} style={{ marginBottom: 4 }}>
          {translate(language, 'digitalEmployees')}
        </Typography.Title>
        <Typography.Text type="secondary">{t('employeesDesc')}</Typography.Text>
      </div>
      <Tabs
        activeKey={tab}
        onChange={(key) => setTab(key as DigitalEmployeesTab)}
        items={[
          {
            key: DigitalEmployeesTab.Employees,
            label: t('tabEmployees'),
            children: <EmployeePanel portal={resolvedPortal} client={client} />,
          },
          {
            key: DigitalEmployeesTab.Requests,
            label: t('tabRequests'),
            children: <RequestPanel portal={resolvedPortal} />,
          },
        ]}
      />
    </div>
  );
}

function formatDateTime(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// "Ready" only claims the runtime instance is deployed — it says nothing
// about model auth or publish completeness. Unknown values render raw.
function PhaseTag({ phase }: { readonly phase: string }) {
  if (phase === 'Ready') return <Tag color="success">{t('phaseReady')}</Tag>;
  if (phase === 'Pending') return <Tag color="processing">{t('phasePending')}</Tag>;
  if (phase === 'Error') return <Tag color="error">{t('phaseError')}</Tag>;
  if (!phase) return <Tag>{t('phaseUnknown')}</Tag>;
  return <Tag>{phase}</Tag>;
}

function wecomTag(employee: PortalEmployee) {
  return employee.channels?.wecom ? (
    <Tag variant="filled">{translate(language, 'wecomBadge')}</Tag>
  ) : null;
}

// Popup blockers routinely reject window.open calls made after an await,
// and a click that dispatched the call is not evidence the conversation
// opened. When the automatic open does not succeed, the console surfaces a
// state-specific handoff: with a minted session a plain token-free link the
// user can click, otherwise clear feedback plus retry. The access token is
// handed to the portal at most once and is never rendered or logged.
type ChatHandoff =
  | { readonly employee: PortalEmployee; readonly kind: 'blocked' }
  | { readonly employee: PortalEmployee; readonly kind: 'blocked-no-session' }
  | { readonly employee: PortalEmployee; readonly kind: 'no-session' };

// The portal authorizes every call (owner or admin); the console renders
// whatever the portal returns, surfacing failures as inline alerts.
function EmployeePanel({
  portal,
  client,
}: {
  readonly portal: PortalClient;
  readonly client: AdminConsoleClient;
}) {
  const [selected, setSelected] = useState<PortalEmployee | null>(null);
  const [handoff, setHandoff] = useState<ChatHandoff | null>(null);

  // Silent handoff: mint the portal session and select the employee in the
  // background (cookies land on the shared host), then open the chat UI in a
  // new tab — no portal entry page flashing in between. Falls back to the
  // fragment-token handoff when the background mint fails.
  const openChat = async (employee: PortalEmployee) => {
    setHandoff(null);
    if (await portal.mintChatSession(employee.name)) {
      const opened = window.open(`${chatUIBaseURL()}/workspace`, '_blank', 'noopener');
      if (opened) return;
      setHandoff({ employee, kind: 'blocked' });
      return;
    }
    const token = await client.getAccessToken();
    if (!token) {
      setHandoff({ employee, kind: 'no-session' });
      return;
    }
    const href = `${portalChatBaseURL()}/chat?employee=${encodeURIComponent(employee.name)}#token=${encodeURIComponent(token)}`;
    const opened = window.open(href, '_blank', 'noopener');
    if (opened) return;
    setHandoff({ employee, kind: 'blocked-no-session' });
  };

  return (
    <>
      {selected ? (
        <EmployeeDetail
          employee={selected}
          portal={portal}
          client={client}
          onBack={() => setSelected(null)}
          onChat={openChat}
        />
      ) : (
        <EmployeeList portal={portal} onSelected={setSelected} onChat={openChat} />
      )}
      <ChatHandoffModal
        handoff={handoff}
        onRetry={() => {
          if (handoff) void openChat(handoff.employee);
        }}
        onClose={() => setHandoff(null)}
      />
    </>
  );
}

function ChatHandoffModal({
  handoff,
  onRetry,
  onClose,
}: {
  readonly handoff: ChatHandoff | null;
  readonly onRetry: () => void;
  readonly onClose: () => void;
}) {
  return (
    <Modal
      open={handoff !== null}
      title={t('chatBlockedTitle')}
      footer={null}
      onCancel={onClose}
      destroyOnHidden
    >
      {handoff?.kind === 'blocked' ? (
        <>
          <Alert type="info" showIcon title={t('chatBlockedMinted')} style={{ marginBottom: 16 }} />
          <Button
            type="primary"
            icon={<MessageOutlined />}
            href={`${chatUIBaseURL()}/workspace`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('chatOpenLink')}
          </Button>
        </>
      ) : handoff ? (
        <>
          <Alert
            type={handoff.kind === 'no-session' ? 'error' : 'warning'}
            showIcon
            title={handoff.kind === 'no-session' ? t('chatNoSession') : t('chatBlockedFallback')}
            style={{ marginBottom: 16 }}
          />
          <Space>
            <Button type="primary" onClick={onRetry}>
              {t('chatRetry')}
            </Button>
            <Button onClick={onClose}>{translate(language, 'cancel')}</Button>
          </Space>
        </>
      ) : null}
    </Modal>
  );
}

function EmployeeList({
  portal,
  onSelected,
  onChat,
}: {
  readonly portal: PortalClient;
  readonly onSelected: (employee: PortalEmployee) => void;
  readonly onChat: (employee: PortalEmployee) => void;
}) {
  const [employees, setEmployees] = useState<readonly PortalEmployee[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<PortalEmployee | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setEmployees(await portal.listEmployees());
    } catch (err) {
      setEmployees(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portal]);

  const columns = useMemo(
    () => [
      {
        title: t('colName'),
        key: 'name',
        render: (_: unknown, employee: PortalEmployee) => (
          <Space orientation="vertical" size={0}>
            <Space size={6}>
              <Typography.Text strong>{employee.displayName || employee.name}</Typography.Text>
              {wecomTag(employee)}
            </Space>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {employee.name}
            </Typography.Text>
          </Space>
        ),
      },
      {
        title: t('colOwner'),
        key: 'owner',
        render: (_: unknown, employee: PortalEmployee) =>
          employee.owner || employee.ownerId || <Tag>{t('ownerMissing')}</Tag>,
      },
      {
        title: t('colStatus'),
        dataIndex: 'phase',
        key: 'phase',
        width: 110,
        render: (phase: string) => <PhaseTag phase={phase} />,
      },
      { title: t('colModel'), dataIndex: 'model', key: 'model' },
      {
        title: t('colLastUsed'),
        key: 'lastUsed',
        width: 110,
        render: () => (
          <Tooltip title={t('lastUsedHint')}>
            <Typography.Text type="secondary">{t('lastUsedUnknown')}</Typography.Text>
          </Tooltip>
        ),
      },
      {
        title: translate(language, 'actions'),
        key: 'actions',
        align: 'right' as const,
        render: (_: unknown, employee: PortalEmployee) => (
          <span onClick={(event) => event.stopPropagation()}>
            <Space size={0}>
              <Button type="link" size="small" onClick={() => onSelected(employee)}>
                {t('actionManage')}
              </Button>
              <Button type="link" size="small" onClick={() => void onChat(employee)}>
                {t('actionChat')}
              </Button>
              <Button
                type="link"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => setDeleting(employee)}
              >
                {translate(language, 'delete')}
              </Button>
            </Space>
          </span>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onChat, onSelected],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Typography.Text strong>{translate(language, 'digitalEmployeesList')}</Typography.Text>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            disabled={loading}
            onClick={() => void load()}
          >
            {translate(language, 'refresh')}
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreating(true)}
          >
            {t('createTitle')}
          </Button>
        </Space>
      </div>

      {error ? (
        <Alert
          type="error"
          showIcon
          title={`${translate(language, 'digitalEmployeesLoadFailed')}：${error}`}
        />
      ) : null}

      {error ? null : (
      <Table
        rowKey="name"
        size="middle"
        loading={loading && employees === null}
        // A failed load never falls through to the empty state — only a
        // successful load with zero rows shows "no digital employees".
        dataSource={employees ?? []}
        columns={columns}
        pagination={{ hideOnSinglePage: true }}
        onRow={(employee) => ({ onClick: () => onSelected(employee) })}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={translate(language, 'digitalEmployeesEmpty')}
            >
              <Typography.Text type="secondary">
                {translate(language, 'digitalEmployeesEmptyHint')}
              </Typography.Text>
            </Empty>
          ),
        }}
      />
      )}

      <CreateEmployeeModal
        portal={portal}
        open={creating}
        onClose={() => setCreating(false)}
        onApplied={() => {
          setCreating(false);
          void load();
        }}
      />
      <DeleteBlockedModal
        employee={deleting}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

// Creation dialog: name + displayName + optional team (department scoping).
// The portal apply API now accepts team; other inputs (owner, model,
// knowledge, skills) remain server-side.
function CreateEmployeeModal({
  portal,
  open,
  onClose,
  onApplied,
}: {
  readonly portal: PortalClient;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onApplied: () => void;
}) {
  const [form] = Form.useForm<{ name: string; displayName: string; team?: string }>();
  const [pending, setPending] = useState(false);
  const [departments, setDepartments] = useState<readonly PortalDepartment[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      form.resetFields();
      setError(null);
      portal.listDepartments().then(setDepartments).catch(() => setDepartments([]));
    }
  }, [open, form, portal]);

  const submit = async (values: { name: string; displayName: string; team?: string }) => {
    setPending(true);
    setError(null);
    try {
      const result = await portal.apply(values.name.trim(), values.displayName.trim(), values.team?.trim() || undefined);
      if (result.kind === 'rejected') {
        setError(result.message);
        return;
      }
      notify(
        AdminNotificationKind.Success,
        result.kind === 'created'
          ? translate(language, 'digitalEmployeesApplyCreated')
          : `${translate(language, 'digitalEmployeesApplyPending')}：${result.message}`,
      );
      onApplied();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('createTitle')}
      okText={t('createSubmit')}
      cancelText={translate(language, 'cancel')}
      confirmLoading={pending}
      onCancel={onClose}
      onOk={() => void form.submit()}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">{t('createDescription')}</Typography.Paragraph>
      {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} /> : null}
      <Form form={form} layout="vertical" onFinish={(values) => void submit(values)}>
        <Form.Item
          name="name"
          label={translate(language, 'digitalEmployeesFieldName')}
          rules={[
            { required: true, message: translate(language, 'fieldRequired') },
            { pattern: EMPLOYEE_NAME_PATTERN, message: translate(language, 'digitalEmployeesInvalidName') },
          ]}
        >
          <Input
            placeholder={translate(language, 'digitalEmployeesNamePlaceholder')}
            autoComplete="off"
            disabled={pending}
          />
        </Form.Item>
        <Form.Item name="displayName" label={t('labelDisplayName')}>
          <Input
            placeholder={translate(language, 'digitalEmployeesDisplayNamePlaceholder')}
            autoComplete="off"
            disabled={pending}
          />
        </Form.Item>
        <Form.Item
          name="team"
          label={translate(language, 'digitalEmployeesTeamLabel')}
          tooltip={translate(language, 'digitalEmployeesTeamTooltip')}
        >
          <Select
            allowClear
            placeholder={translate(language, 'digitalEmployeesTeamPlaceholder')}
            options={departments.map((d) => ({ value: d.id, label: d.name }))}
          />
        </Form.Item>
      </Form>
      <Alert
        type="info"
        showIcon
        title={t('createFieldGapTitle')}
        description={t('createFieldGap')}
      />
    </Modal>
  );
}

// Deletion is intentionally blocked: the portal exposes DELETE, but the
// disposal semantics for conversation history and memory data are not
// defined by any contract. The design (admin-console-design §8 and the
// employee-delete artboard) requires blocking rather than offering a
// destructive confirm that cannot state what happens to the data.
function DeleteBlockedModal({
  employee,
  onClose,
}: {
  readonly employee: PortalEmployee | null;
  readonly onClose: () => void;
}) {
  return (
    <Modal
      open={employee !== null}
      title={t('deleteBlockedTitle')}
      onCancel={onClose}
      footer={
        <Button type="primary" onClick={onClose}>
          {t('deleteBlockedBack')}
        </Button>
      }
    >
      <Alert type="warning" showIcon title={t('deleteBlockedNotice')} style={{ marginBottom: 12 }} />
      <Descriptions
        column={1}
        size="small"
        bordered
        items={[
          {
            key: 'linked',
            label: translate(language, 'digitalEmployeesDeleteTitle'),
            children: t('deleteBlockedFacts'),
          },
          { key: 'employee', label: t('labelTechId'), children: employee?.name ?? '—' },
        ]}
      />
      <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
        {t('deleteBlockedAction')}
      </Typography.Paragraph>
    </Modal>
  );
}

function EmployeeDetail({
  employee,
  portal,
  client,
  onBack,
  onChat,
}: {
  readonly employee: PortalEmployee;
  readonly portal: PortalClient;
  readonly client: AdminConsoleClient;
  readonly onBack: () => void;
  readonly onChat: (employee: PortalEmployee) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  // The real web entry for this employee on the portal host. It never
  // contains an access token — sessions are minted by the portal itself.
  const entryURL = `${portalChatBaseURL()}/chat?employee=${encodeURIComponent(employee.name)}`;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Space align="center" wrap>
          <Button icon={<ArrowLeftOutlined />} onClick={onBack}>
            {translate(language, 'digitalEmployeesBack')}
          </Button>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {employee.displayName || employee.name}
          </Typography.Title>
          {wecomTag(employee)}
          <PhaseTag phase={employee.phase} />
        </Space>
        <Space>
          <Button
            type="primary"
            icon={<MessageOutlined />}
            onClick={() => void onChat(employee)}
          >
            {t('actionChat')}
          </Button>
          <Button danger icon={<DeleteOutlined />} onClick={() => setDeleting(true)}>
            {translate(language, 'delete')}
          </Button>
        </Space>
      </div>

      <Descriptions
        bordered
        size="small"
        column={{ xxl: 3, xl: 3, lg: 2, md: 2, sm: 1, xs: 1 }}
        items={[
          {
            key: 'owner',
            label: t('labelOwner'),
            children: employee.owner || employee.ownerId || t('ownerMissing'),
          },
          { key: 'model', label: t('labelModel'), children: employee.model || t('notProvided') },
          {
            key: 'lastUsed',
            label: t('colLastUsed'),
            children: (
              <Tooltip title={t('lastUsedHint')}>
                <span>{t('lastUsedUnknown')}</span>
              </Tooltip>
            ),
          },
        ]}
      />

      <Tabs
        defaultActiveKey="basic"
        items={[
          {
            key: 'basic',
            label: t('detailTabBasic'),
            children: (
              <div className="flex flex-col gap-4">
                <Descriptions
                  bordered
                  size="small"
                  column={{ xl: 2, md: 1, sm: 1, xs: 1 }}
                  items={[
                    { key: 'name', label: t('labelTechId'), children: employee.name },
                    {
                      key: 'displayName',
                      label: t('labelDisplayName'),
                      children: employee.displayName || t('notProvided'),
                    },
                    {
                      key: 'runtime',
                      label: t('labelRuntime'),
                      children: employee.runtime || t('notProvided'),
                    },
                    {
                      key: 'memoryUser',
                      label: t('labelMemoryUser'),
                      children: employee.memoryUser || t('notProvided'),
                    },
                    {
                      key: 'createdAt',
                      label: t('labelCreatedAt'),
                      children: formatDateTime(employee.createdAt),
                    },
                  ]}
                />
                <Alert
                  type="info"
                  showIcon
                  title={t('editGapTitle')}
                  description={t('editGapDescription')}
                />
              </div>
            ),
          },
          {
            key: 'capabilities',
            label: t('detailTabCapabilities'),
            children: (
              <EmptyDetails
                title={t('capabilitiesGapTitle')}
                description={t('capabilitiesGapDescription')}
              />
            ),
          },
          {
            key: 'memory',
            label: t('detailTabMemory'),
            children: (
              <MemoryView
                client={client}
                portal={portal}
                employee={{ name: employee.name, memoryUser: employee.memoryUser }}
              />
            ),
          },
          {
            key: 'publish',
            label: t('detailTabPublish'),
            children: (
              <div className="flex flex-col gap-4">
                <Descriptions
                  bordered
                  size="small"
                  column={1}
                  items={[
                    {
                      key: 'scope',
                      label: t('publishScope'),
                      children: (
                        <Tooltip title={t('publishScopeGap')}>
                          <span>{t('publishScopeUnknown')}</span>
                        </Tooltip>
                      ),
                    },
                    {
                      key: 'web',
                      label: t('publishWebEntry'),
                      children: (
                        <Space orientation="vertical" size={2}>
                          <Typography.Text copyable={{ text: entryURL }} style={{ fontFamily: 'monospace' }}>
                            {entryURL}
                          </Typography.Text>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {translate(language, 'digitalEmployeesOpenChat')}
                          </Typography.Text>
                        </Space>
                      ),
                    },
                    {
                      key: 'wecom',
                      label: t('publishWecom'),
                      children: employee.channels?.wecom
                        ? `${t('publishChannelOn')}（${
                            employee.channels.wecomName ?? t('publishChannelUnknownName')
                          }）`
                        : t('publishChannelOff'),
                    },
                  ]}
                />
                <Alert type="info" showIcon title={t('publishNote')} />
                <div>
                  <Typography.Text strong>{t('publishRecordTitle')}</Typography.Text>
                  <Typography.Paragraph type="secondary" style={{ marginTop: 4 }}>
                    {t('publishRecordGap')}
                  </Typography.Paragraph>
                </div>
              </div>
            ),
          },
          {
            key: 'runs',
            label: t('detailTabRuns'),
            children: (
              <EmptyDetails title={t('runsGapTitle')} description={t('runsGapDescription')} />
            ),
          },
        ]}
      />

      <DeleteBlockedModal employee={deleting ? employee : null} onClose={() => setDeleting(false)} />
    </div>
  );
}

function EmptyDetails({ title, description }: { readonly title: string; readonly description: string }) {
  return (
    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={title}>
      <Typography.Paragraph type="secondary" style={{ maxWidth: 480, margin: '0 auto' }}>
        {description}
      </Typography.Paragraph>
    </Empty>
  );
}

type RequestFilter = 'all' | 'pending' | 'decided';

// Everyone sees this tab: the portal returns the caller's visible requests
// and admin-only actions fail with a clear 403 (portal admin config is not
// knowable client-side).
function RequestPanel({ portal }: { readonly portal: PortalClient }) {
  const [requests, setRequests] = useState<readonly PortalRequest[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<RequestFilter>('all');
  const [query, setQuery] = useState('');
  const [rejecting, setRejecting] = useState<PortalRequest | null>(null);
  const [viewing, setViewing] = useState<PortalRequest | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRequests(await portal.listRequests());
    } catch (err) {
      setRequests(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portal]);

  const filtered = useMemo(() => {
    const items = requests ?? [];
    const byState = items.filter((request) =>
      filter === 'all'
        ? true
        : filter === 'pending'
          ? request.state === 'pending'
          : request.state !== 'pending',
    );
    if (!query.trim()) return byState;
    const needle = query.trim().toLowerCase();
    return byState.filter((request) =>
      [request.employeeName, request.displayName, request.owner].some((value) =>
        value.toLowerCase().includes(needle),
      ),
    );
  }, [requests, filter, query]);

  const decide = async (request: PortalRequest, decision: 'approve' | 'reject', reason?: string) => {
    setPendingId(request.id);
    setActionError(null);
    try {
      await portal.decideRequest(request.id, decision, reason);
      notify(AdminNotificationKind.Success, t('requestsDecided'));
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingId(null);
    }
  };

  const columns = useMemo(
    () => [
      {
        title: t('requestsColName'),
        key: 'name',
        render: (_: unknown, request: PortalRequest) => (
          <Space orientation="vertical" size={0}>
            <Typography.Text strong>{request.employeeName}</Typography.Text>
            {request.displayName && request.displayName !== request.employeeName ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {request.displayName}
              </Typography.Text>
            ) : null}
          </Space>
        ),
      },
      { title: t('requestsColRequester'), dataIndex: 'owner', key: 'owner' },
      {
        title: t('requestsColTime'),
        dataIndex: 'createdAt',
        key: 'createdAt',
        render: (value: string) => formatDateTime(value),
      },
      {
        title: t('requestsColState'),
        dataIndex: 'state',
        key: 'state',
        render: (state: string) =>
          state === 'pending' ? (
            <Tag color="warning">{t('requestsStatePending')}</Tag>
          ) : state ? (
            <Tag>{state}</Tag>
          ) : (
            <Tag>{t('phaseUnknown')}</Tag>
          ),
      },
      {
        title: t('requestsColReason'),
        dataIndex: 'reason',
        key: 'reason',
        render: (value: string) => value || '—',
      },
      {
        title: translate(language, 'actions'),
        key: 'actions',
        align: 'right' as const,
        render: (_: unknown, request: PortalRequest) => (
          <Space size={0}>
            {request.state === 'pending' ? (
              <>
                <Button
                  type="link"
                  size="small"
                  loading={pendingId === request.id}
                  onClick={() => void decide(request, 'approve')}
                >
                  {t('requestsApprove')}
                </Button>
                <Button
                  type="link"
                  size="small"
                  danger
                  disabled={pendingId === request.id}
                  onClick={() => setRejecting(request)}
                >
                  {t('requestsReject')}
                </Button>
              </>
            ) : null}
            <Button type="link" size="small" onClick={() => setViewing(request)}>
              {t('actionView')}
            </Button>
          </Space>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendingId],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={filter}
          onChange={(value) => setFilter(value as RequestFilter)}
          options={[
            { label: t('requestsFilterAll'), value: 'all' },
            { label: t('requestsFilterPending'), value: 'pending' },
            { label: t('requestsFilterDecided'), value: 'decided' },
          ]}
        />
        <Space>
          <Input.Search
            placeholder={translate(language, 'grantModelSearchPlaceholder')}
            allowClear
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            style={{ width: 220 }}
          />
          <Button icon={<ReloadOutlined />} disabled={loading} onClick={() => void load()}>
            {translate(language, 'refresh')}
          </Button>
        </Space>
      </div>

      {error ? (
        <Alert
          type="error"
          showIcon
          title={`${translate(language, 'digitalEmployeesRequestsLoadFailed')}：${error}`}
        />
      ) : null}
      {actionError ? <Alert type="error" showIcon title={actionError} /> : null}

      {error ? null : (
      <Table
        rowKey="id"
        size="middle"
        loading={loading && requests === null}
        dataSource={filtered}
        columns={columns}
        pagination={{ hideOnSinglePage: true }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={translate(language, 'digitalEmployeesRequestsEmpty')}
            />
          ),
        }}
      />
      )}

      <RejectRequestModal
        portal={portal}
        request={rejecting}
        onClose={() => setRejecting(null)}
        onDecided={async () => {
          setRejecting(null);
          await load();
        }}
      />

      <Drawer
        open={viewing !== null}
        title={t('requestsDetailTitle')}
        size={480}
        onClose={() => setViewing(null)}
      >
        {viewing ? (
          <Descriptions
            column={1}
            bordered
            size="small"
            items={[
              { key: 'name', label: t('requestsColName'), children: viewing.employeeName },
              { key: 'displayName', label: t('labelDisplayName'), children: viewing.displayName || '—' },
              { key: 'owner', label: t('requestsOwnerLabel'), children: viewing.owner },
              { key: 'createdAt', label: t('requestsTimeLabel'), children: formatDateTime(viewing.createdAt) },
              { key: 'state', label: t('requestsColState'), children: viewing.state || t('phaseUnknown') },
              { key: 'reason', label: t('requestsColReason'), children: viewing.reason || '—' },
            ]}
          />
        ) : null}
      </Drawer>
    </div>
  );
}

function RejectRequestModal({
  portal,
  request,
  onClose,
  onDecided,
}: {
  readonly portal: PortalClient;
  readonly request: PortalRequest | null;
  readonly onClose: () => void;
  readonly onDecided: () => Promise<void>;
}) {
  const [form] = Form.useForm<{ reason: string }>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (request) {
      form.resetFields();
      setError(null);
    }
  }, [request, form]);

  const reject = async (values: { reason: string }) => {
    if (!request) return;
    setPending(true);
    setError(null);
    try {
      await portal.decideRequest(request.id, 'reject', values.reason.trim());
      notify(AdminNotificationKind.Success, t('requestsDecided'));
      await onDecided();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open={request !== null}
      title={t('requestsRejectTitle')}
      okText={t('requestsReject')}
      okButtonProps={{ danger: true }}
      cancelText={translate(language, 'cancel')}
      confirmLoading={pending}
      onCancel={onClose}
      onOk={() => void form.submit()}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">
        {t('requestsRejectDescription')}
      </Typography.Paragraph>
      {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} /> : null}
      <Form form={form} layout="vertical" onFinish={(values) => void reject(values)}>
        <Form.Item
          name="reason"
          label={t('requestsRejectReasonLabel')}
          rules={[{ required: true, message: t('requestsRejectReasonRequired') }]}
        >
          <Input.TextArea rows={3} disabled={pending} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
