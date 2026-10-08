import type { AdminModel, PlatformUser } from '@aep/sdk-node';
import {
  ArrowLeftOutlined,
  CheckOutlined,
  DeleteOutlined,
  EditOutlined,
  MessageOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Checkbox,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Radio,
  Segmented,
  Select,
  Space,
  Steps,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { ChatHandoffModal, useChatHandoff } from './chat-handoff.js';
import type { AdminConsoleClient, AdminIdentity, AdminSkill } from './client.js';
import { employeesT } from './employees-copy.js';
import { type AdminLanguage, translate } from './i18n.js';
import { AdminNotificationKind, notify } from './notifications.js';
import {
  EMPLOYEE_NAME_PATTERN,
  type PortalApplyInput,
  PortalClient,
  type PortalDepartment,
  type PortalEmployee,
  type PortalEmployeeUpdateInput,
  type PortalRequest,
  portalChatBaseURL,
} from './portal.js';
import { MemoryView } from './ServiceStatus.js';

const language: AdminLanguage = 'zh';
const t = (key: Parameters<typeof employeesT>[0]): string => employeesT(key, language);

const DigitalEmployeesTab = {
  Employees: 'employees',
  Requests: 'requests',
} as const;
type DigitalEmployeesTab = (typeof DigitalEmployeesTab)[keyof typeof DigitalEmployeesTab];

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
  const [resolvedPortal] = useState(() => portal ?? new PortalClient(() => client.getAccessToken()));
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
  // Idle-hibernated runtime: no pod is resident, first chat wakes it.
  if (phase === 'Sleeping') return <Tag color="default">💤 {t('phaseSleeping')}</Tag>;
  if (phase === 'Error') return <Tag color="error">{t('phaseError')}</Tag>;
  if (!phase) return <Tag>{t('phaseUnknown')}</Tag>;
  return <Tag>{phase}</Tag>;
}

function wecomTag(employee: PortalEmployee) {
  return employee.channels?.wecom ? <Tag variant="filled">{translate(language, 'wecomBadge')}</Tag> : null;
}

// The portal authorizes every call (owner or admin); the console renders
// whatever the portal returns, surfacing failures as inline alerts.
function EmployeePanel({ portal, client }: { readonly portal: PortalClient; readonly client: AdminConsoleClient }) {
  const [selected, setSelected] = useState<PortalEmployee | null>(null);
  // Silent handoff (shared with the workbench): mint the portal session in
  // the background, then open the chat UI in a new tab, with the
  // popup-blocked fallbacks handled by the modal.
  const { handoff, openChat, retry, close } = useChatHandoff({ client, portal });

  return (
    <>
      {selected ? (
        <EmployeeDetail
          employee={selected}
          portal={portal}
          client={client}
          onBack={() => setSelected(null)}
          onChat={openChat}
          onUpdated={setSelected}
        />
      ) : (
        <EmployeeList client={client} portal={portal} onSelected={setSelected} onChat={openChat} />
      )}
      <ChatHandoffModal handoff={handoff} onRetry={retry} onClose={close} />
    </>
  );
}

function EmployeeList({
  client,
  portal,
  onSelected,
  onChat,
}: {
  readonly client: AdminConsoleClient;
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
      {
        title: t('colModel'),
        key: 'model',
        render: (_: unknown, employee: PortalEmployee) => (
          <Space size={4} wrap>
            <span>{employee.model}</span>
            {employee.modelFailover ? (
              <Tooltip
                title={t('failoverHint')
                  .replace('{original}', employee.modelFailover.original)
                  .replace('{active}', employee.modelFailover.active)}
              >
                <Tag color="warning">{t('failoverTag')}</Tag>
              </Tooltip>
            ) : null}
          </Space>
        ),
      },
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
          // biome-ignore lint/a11y/noStaticElementInteractions: click shield so action buttons do not select the row
          // biome-ignore lint/a11y/useKeyWithClickEvents: see above — not an interactive control
          <span onClick={(event) => event.stopPropagation()}>
            <Space size={0}>
              <Button type="link" size="small" onClick={() => onSelected(employee)}>
                {t('actionManage')}
              </Button>
              <Button type="link" size="small" onClick={() => void onChat(employee)}>
                {t('actionChat')}
              </Button>
              <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => setDeleting(employee)}>
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
          <Button icon={<ReloadOutlined />} disabled={loading} onClick={() => void load()}>
            {translate(language, 'refresh')}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
            {t('createTitle')}
          </Button>
        </Space>
      </div>

      {error ? (
        <Alert type="error" showIcon title={`${translate(language, 'digitalEmployeesLoadFailed')}：${error}`} />
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
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={translate(language, 'digitalEmployeesEmpty')}>
                <Typography.Text type="secondary">{translate(language, 'digitalEmployeesEmptyHint')}</Typography.Text>
              </Empty>
            ),
          }}
        />
      )}

      <CreateEmployeeModal
        client={client}
        portal={portal}
        open={creating}
        onClose={() => setCreating(false)}
        onApplied={() => {
          setCreating(false);
          void load();
        }}
      />
      <DeleteBlockedModal employee={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}

// Creation wizard (four steps per the admin-console wireframes): basics →
// knowledge & skills → audience → confirm & publish. Every field maps to
// the extended portal apply API — knowledge bases whitelist the employee's
// retrieval (enforced server-side by the governance middleware), skills are
// validated registrations, and the audience is an explicit choice that is
// never defaulted to everyone. Release conditions (purpose, owner, team,
// models, audience) are enforced per step and mirrored on the confirm step.
type WizardValues = {
  name: string;
  displayName?: string;
  description: string;
  owner: string;
  team: string;
  models: string[];
  knowledgeBases?: string[];
  skills?: string[];
  skillVersions: Record<string, string>;
  scopeMode: 'restricted' | 'all';
  scopeTeams?: string[];
  scopeUsers?: string[];
};

const WIZARD_STEP_FIELDS: readonly (keyof WizardValues)[][] = [
  ['name', 'displayName', 'description', 'owner', 'team', 'models'],
  [],
  ['scopeMode'],
];

// Newest published version of a skill, mirroring the portal's auto-pin.
function latestPublishedVersion(skill: AdminSkill): string {
  let latest = '';
  for (const version of skill.versions) {
    if (version.state === 'published') latest = version.version;
  }
  return latest;
}

function CreateEmployeeModal({
  client,
  portal,
  open,
  onClose,
  onApplied,
}: {
  readonly client: AdminConsoleClient;
  readonly portal: PortalClient;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onApplied: () => void;
}) {
  const [form] = Form.useForm<WizardValues>();
  const [step, setStep] = useState(0);
  const [pending, setPending] = useState(false);
  const [departments, setDepartments] = useState<readonly PortalDepartment[]>([]);
  const [models, setModels] = useState<readonly AdminModel[]>([]);
  const [users, setUsers] = useState<readonly PlatformUser[]>([]);
  const [skills, setSkills] = useState<readonly AdminSkill[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<readonly { id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [violations, setViolations] = useState<readonly { field: string; message: string }[]>([]);

  const usableSkills = useMemo(
    () => skills.filter((skill) => skill.state === 'active' && skill.versions.some((v) => v.state === 'published')),
    [skills],
  );

  useEffect(() => {
    if (open) {
      form.resetFields();
      setStep(0);
      setError(null);
      setViolations([]);
      portal
        .listDepartments()
        .then(setDepartments)
        .catch(() => setDepartments([]));
      client
        .models()
        .then((page) => setModels(page.models.filter((model) => model.enabled && model.sourceType === 'gateway')))
        .catch(() => setModels([]));
      client
        .users()
        // Active accounts only; the platform listing returns human users
        // and the portal re-validates that the owner is a human on apply.
        .then((all) => setUsers(all.filter((user) => user.status === 'active')))
        .catch(() => setUsers([]));
      client
        .skills()
        .then(setSkills)
        .catch(() => setSkills([]));
      portal
        .knowledgeStatus()
        .then((status) => setKnowledgeBases(status.knowledgeBases ?? []))
        .catch(() => setKnowledgeBases([]));
    }
  }, [open, form, portal, client]);

  const userById = (id: string) => users.find((user) => user.id === id);
  const departmentName = (id: string) => departments.find((d) => d.id === id)?.name ?? id;
  const knowledgeName = (id: string) => knowledgeBases.find((kb) => kb.id === id)?.name ?? id;
  const skillById = (id: string) => usableSkills.find((skill) => skill.id === id);

  const releaseChecks = (values: Partial<WizardValues>) => [
    { label: t('checklistDescription'), ok: (values.description ?? '').trim().length > 0 },
    { label: t('checklistOwner'), ok: Boolean(values.owner) },
    { label: t('checklistTeam'), ok: Boolean(values.team) },
    { label: t('checklistModels'), ok: (values.models ?? []).length > 0 },
    {
      label: t('checklistScope'),
      ok: values.scopeMode === 'all' || (values.scopeTeams ?? []).length + (values.scopeUsers ?? []).length > 0,
    },
  ];

  const next = async () => {
    setError(null);
    setViolations([]);
    if (step === 2) {
      // The audience step: restricted scope must contain at least one
      // subject — validateFields covers scopeMode itself.
      const scopeMode = form.getFieldValue('scopeMode') as WizardValues['scopeMode'];
      const teams = (form.getFieldValue('scopeTeams') as string[] | undefined) ?? [];
      const userScope = (form.getFieldValue('scopeUsers') as string[] | undefined) ?? [];
      if (scopeMode === 'restricted' && teams.length + userScope.length === 0) {
        setError(t('scopeRequireOne'));
        return;
      }
    }
    try {
      await form.validateFields(WIZARD_STEP_FIELDS[step] ?? []);
      setStep((current) => Math.min(current + 1, 3));
    } catch {
      // validateFields already renders the per-field messages.
    }
  };

  const submit = async (values: WizardValues) => {
    setPending(true);
    setError(null);
    setViolations([]);
    const input: PortalApplyInput = {
      name: values.name.trim(),
      displayName: (values.displayName ?? '').trim() || values.name.trim(),
      description: values.description.trim(),
      team: values.team,
      models: values.models ?? [],
      owner: values.owner,
      // The wizard makes the knowledge policy explicit: unchecked = no
      // bases = the middleware denies every knowledge search.
      knowledgeBases: values.knowledgeBases ?? [],
      skills: (values.skills ?? []).map((id) => {
        const skill = skillById(id);
        return { id, version: values.skillVersions?.[id] ?? (skill ? latestPublishedVersion(skill) : '') };
      }),
      visibility:
        values.scopeMode === 'all'
          ? { mode: 'all' }
          : { mode: 'restricted', teams: values.scopeTeams ?? [], users: values.scopeUsers ?? [] },
    };
    try {
      const result = await portal.apply(input);
      if (result.kind === 'rejected') {
        setError(result.message);
        setViolations(result.violations ?? []);
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

  const values = Form.useWatch([], form) as Partial<WizardValues> | undefined;
  const checks = releaseChecks(values ?? {});
  const allChecksPass = checks.every((check) => check.ok);

  const stepItems = [
    { key: 'basic', title: t('createStepBasic') },
    { key: 'knowledge', title: t('createStepKnowledge') },
    { key: 'scope', title: t('createStepScope') },
    { key: 'confirm', title: t('createStepConfirm') },
  ];

  return (
    <Modal
      open={open}
      title={t('createTitle')}
      width={720}
      onCancel={onClose}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={onClose}>{translate(language, 'cancel')}</Button>
          {step > 0 ? (
            <Button disabled={pending} onClick={() => setStep((current) => Math.max(current - 1, 0))}>
              {t('createPrev')}
            </Button>
          ) : null}
          {step < 3 ? (
            <Button type="primary" onClick={() => void next()}>
              {t('createNext')}
            </Button>
          ) : (
            <Button type="primary" loading={pending} disabled={!allChecksPass} onClick={() => void form.submit()}>
              {t('createPublish')}
            </Button>
          )}
        </Space>
      }
    >
      <Typography.Paragraph type="secondary">{t('createDescription')}</Typography.Paragraph>
      <Steps size="small" current={step} items={stepItems} style={{ marginBottom: 20 }} />
      {error ? (
        <Alert
          type="error"
          showIcon
          title={error}
          style={{ marginBottom: 16 }}
          description={
            violations.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {violations.map((item) => (
                  <li key={`${item.field}:${item.message}`}>
                    {item.field}：{item.message}
                  </li>
                ))}
              </ul>
            ) : undefined
          }
        />
      ) : null}
      <Form
        form={form}
        layout="vertical"
        initialValues={{ scopeMode: 'restricted', skillVersions: {}, models: [] }}
        onFinish={(values) => void submit(values)}
      >
        <div style={step === 0 ? undefined : { display: 'none' }}>
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
            name="description"
            label={t('labelDescription')}
            rules={[
              { required: true, message: translate(language, 'fieldRequired') },
              { max: 500, message: t('descriptionPlaceholder') },
            ]}
          >
            <Input.TextArea rows={2} placeholder={t('descriptionPlaceholder')} disabled={pending} />
          </Form.Item>
          <Form.Item
            name="owner"
            label={t('labelOwnerSelect')}
            tooltip={t('ownerTooltip')}
            rules={[{ required: true, message: translate(language, 'fieldRequired') }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder={t('ownerPlaceholder')}
              disabled={pending}
              options={users.map((user) => ({
                value: user.id,
                label: `${user.displayName}（${user.username}）`,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="team"
            label={t('labelTeam')}
            tooltip={translate(language, 'digitalEmployeesTeamTooltip')}
            rules={[{ required: true, message: translate(language, 'fieldRequired') }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder={translate(language, 'digitalEmployeesTeamPlaceholder')}
              disabled={pending}
              options={departments.map((d) => ({ value: d.id, label: d.name }))}
            />
          </Form.Item>
          <Form.Item
            name="models"
            label={t('createModelLabel')}
            tooltip={t('createModelTooltip')}
            rules={[{ required: true, message: translate(language, 'fieldRequired') }]}
          >
            <Select
              mode="multiple"
              placeholder={t('createModelPlaceholder')}
              disabled={pending}
              options={models.map((model) => ({
                value: model.id,
                label: `${model.displayName}（${model.id}${model.protocol === 'anthropic' ? ' · anthropic' : ''}）`,
              }))}
            />
          </Form.Item>
        </div>

        <div style={step === 1 ? undefined : { display: 'none' }}>
          <Typography.Text strong>{t('createKnowledgeSection')}</Typography.Text>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
            {t('createKnowledgeNotice')}
          </Typography.Paragraph>
          {knowledgeBases.length === 0 ? (
            <Typography.Text type="secondary">{t('createKnowledgeEmpty')}</Typography.Text>
          ) : (
            <Form.Item name="knowledgeBases" style={{ marginBottom: 8 }}>
              <Checkbox.Group
                disabled={pending}
                options={knowledgeBases.map((kb) => ({ value: kb.id, label: kb.name }))}
              />
            </Form.Item>
          )}
          <Typography.Text strong>{t('createSkillsSection')}</Typography.Text>
          {usableSkills.length === 0 ? (
            <Typography.Paragraph type="secondary">{t('createSkillsEmpty')}</Typography.Paragraph>
          ) : (
            <>
              <Form.Item name="skills" style={{ marginTop: 8, marginBottom: 8 }}>
                <Checkbox.Group
                  disabled={pending}
                  options={usableSkills.map((skill) => ({ value: skill.id, label: skill.name }))}
                />
              </Form.Item>
              <Form.Item noStyle shouldUpdate={(prev, cur) => prev.skills !== cur.skills}>
                {({ getFieldValue }) => {
                  const checked = ((getFieldValue('skills') as string[] | undefined) ?? []).filter((id) =>
                    usableSkills.some((skill) => skill.id === id),
                  );
                  if (checked.length === 0) return null;
                  return (
                    <div className="flex flex-col gap-2" style={{ marginBottom: 8 }}>
                      {checked.map((id) => {
                        const skill = skillById(id);
                        if (!skill) return null;
                        const published = skill.versions.filter((v) => v.state === 'published');
                        return (
                          <Space key={id} align="center" size={8}>
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              {skill.name} · {t('createSkillVersionLabel')}
                            </Typography.Text>
                            <Form.Item
                              name={['skillVersions', id]}
                              initialValue={latestPublishedVersion(skill)}
                              noStyle
                            >
                              <Select
                                size="small"
                                style={{ minWidth: 140 }}
                                disabled={pending}
                                options={published.map((v) => ({ value: v.version, label: v.version }))}
                              />
                            </Form.Item>
                          </Space>
                        );
                      })}
                    </div>
                  );
                }}
              </Form.Item>
            </>
          )}
        </div>

        <div style={step === 2 ? undefined : { display: 'none' }}>
          <Form.Item name="scopeMode" label={t('createScopeModeLabel')} rules={[{ required: true }]}>
            <Radio.Group
              disabled={pending}
              onChange={() => {
                setError(null);
                setViolations([]);
              }}
              options={[
                { value: 'restricted', label: t('scopeModeRestricted') },
                { value: 'all', label: t('scopeModeAll') },
              ]}
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.scopeMode !== cur.scopeMode}>
            {({ getFieldValue }) =>
              getFieldValue('scopeMode') === 'all' ? (
                <Alert type="warning" showIcon title={t('scopeModeAllHint')} style={{ marginBottom: 16 }} />
              ) : (
                <>
                  <Form.Item name="scopeTeams" label={t('scopeTeamsLabel')}>
                    <Select
                      mode="multiple"
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      placeholder={t('scopeTeamsPlaceholder')}
                      disabled={pending}
                      options={departments.map((d) => ({ value: d.id, label: d.name }))}
                    />
                  </Form.Item>
                  <Form.Item name="scopeUsers" label={t('scopeUsersLabel')}>
                    <Select
                      mode="multiple"
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      placeholder={t('scopeUsersPlaceholder')}
                      disabled={pending}
                      options={users.map((user) => ({
                        value: user.id,
                        label: `${user.displayName}（${user.username}）`,
                      }))}
                    />
                  </Form.Item>
                </>
              )
            }
          </Form.Item>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
            {t('scopeChannelsNote')}
          </Typography.Paragraph>
        </div>

        <div style={step === 3 ? undefined : { display: 'none' }}>
          <Descriptions
            bordered
            size="small"
            column={1}
            items={[
              { key: 'name', label: translate(language, 'digitalEmployeesFieldName'), children: values?.name ?? '—' },
              { key: 'displayName', label: t('labelDisplayName'), children: values?.displayName ?? '—' },
              { key: 'description', label: t('labelDescription'), children: values?.description ?? '—' },
              {
                key: 'owner',
                label: t('labelOwnerSelect'),
                children: values?.owner ? `${userById(values.owner)?.displayName ?? values.owner}` : '—',
              },
              { key: 'team', label: t('labelTeam'), children: values?.team ? departmentName(values.team) : '—' },
              { key: 'models', label: t('createModelLabel'), children: (values?.models ?? []).join('、') || '—' },
              {
                key: 'knowledge',
                label: t('createKnowledgeSection'),
                children:
                  (values?.knowledgeBases ?? []).length > 0
                    ? (values?.knowledgeBases ?? []).map((id) => knowledgeName(id)).join('、')
                    : t('capabilitiesKnowledgeNone'),
              },
              {
                key: 'skills',
                label: t('createSkillsSection'),
                children:
                  (values?.skills ?? []).length > 0
                    ? (values?.skills ?? [])
                        .map((id) => `${skillById(id)?.name ?? id} · ${values?.skillVersions?.[id] ?? '·'}`)
                        .join('、')
                    : t('capabilitiesSkillsNone'),
              },
              {
                key: 'scope',
                label: t('createScopeModeLabel'),
                children:
                  values?.scopeMode === 'all'
                    ? t('scopeModeAllTag')
                    : [
                        ...(values?.scopeTeams ?? []).map((id) => departmentName(id)),
                        ...(values?.scopeUsers ?? []).map((id) => userById(id)?.displayName ?? id),
                      ].join('、') || t('scopeOwnerOnly'),
              },
            ]}
          />
          <div className="flex flex-col gap-1" style={{ marginTop: 12 }}>
            {checks.map((check) => (
              <Space key={check.label} size={6}>
                <CheckOutlined style={{ color: check.ok ? '#52c41a' : '#ff4d4f' }} />
                <Typography.Text type={check.ok ? 'secondary' : 'danger'}>{check.label}</Typography.Text>
              </Space>
            ))}
          </div>
          {allChecksPass ? (
            <Alert type="success" showIcon title={t('checklistPassed')} style={{ marginTop: 12 }} />
          ) : null}
        </div>
      </Form>
    </Modal>
  );
}

// Configuration editor: one form pre-filled from the employee's current
// spec, submitting only what changed. The diff is what preserves the
// nil-vs-empty policy semantics — an untouched legacy knowledge/audience
// policy is omitted from the PATCH instead of being silently rewritten as
// explicit, while emptying the knowledge list is a deliberate deny-all.
type EditValues = {
  displayName: string;
  description: string;
  owner: string;
  team: string;
  models: string[];
  knowledgeBases: string[];
  skills: string[];
  skillVersions: Record<string, string>;
  scopeMode: 'restricted' | 'all';
  scopeTeams: string[];
  scopeUsers: string[];
};

function sameStrings(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  const left = a ?? [];
  const right = b ?? [];
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

// Diff the form against the pre-fill state; only changed fields enter the
// PATCH body. Returns null when nothing changed (the save button gates on
// this, so the null case never submits).
function buildEmployeeUpdate(
  values: Partial<EditValues>,
  initial: EditValues,
  latestVersion: (id: string) => string,
): PortalEmployeeUpdateInput | null {
  const update: Record<string, unknown> = {};
  if ((values.displayName ?? '') !== initial.displayName) update.displayName = values.displayName ?? '';
  if ((values.description ?? '') !== initial.description) update.description = values.description ?? '';
  if ((values.owner ?? '') !== initial.owner) update.owner = values.owner ?? '';
  if ((values.team ?? '') !== initial.team) update.team = values.team ?? '';
  if (!sameStrings(values.models, initial.models)) update.models = values.models ?? [];
  if (!sameStrings(values.knowledgeBases, initial.knowledgeBases)) {
    update.knowledgeBases = values.knowledgeBases ?? [];
  }
  const checked = values.skills ?? [];
  const versions = values.skillVersions ?? {};
  const versionChanged = checked.some((id) => (versions[id] ?? '') !== (initial.skillVersions[id] ?? ''));
  if (!sameStrings(checked, initial.skills) || versionChanged) {
    update.skills = checked.map((id) => ({ id, version: versions[id] ?? latestVersion(id) }));
  }
  const scopeChanged =
    (values.scopeMode ?? 'restricted') !== initial.scopeMode ||
    !sameStrings(values.scopeTeams, initial.scopeTeams) ||
    !sameStrings(values.scopeUsers, initial.scopeUsers);
  if (scopeChanged) {
    update.visibility =
      (values.scopeMode ?? 'restricted') === 'all'
        ? { mode: 'all' }
        : { mode: 'restricted', teams: values.scopeTeams ?? [], users: values.scopeUsers ?? [] };
  }
  return Object.keys(update).length > 0 ? (update as PortalEmployeeUpdateInput) : null;
}

function EditEmployeeModal({
  employee,
  client,
  portal,
  open,
  onClose,
  onSaved,
}: {
  readonly employee: PortalEmployee;
  readonly client: AdminConsoleClient;
  readonly portal: PortalClient;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSaved: () => void | Promise<void>;
}) {
  const [form] = Form.useForm<EditValues>();
  const [pending, setPending] = useState(false);
  // Team pickers use the full AEP team list, not portal departments: the
  // portal validates employee teams against AEP, and employees created with
  // directly-managed AEP teams (rd-dept, load teams) would otherwise show
  // an empty team field and fail the required check on save.
  const [teams, setTeams] = useState<readonly { id: string; name: string }[]>([]);
  const [models, setModels] = useState<readonly AdminModel[]>([]);
  const [users, setUsers] = useState<readonly PlatformUser[]>([]);
  const [skills, setSkills] = useState<readonly AdminSkill[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<readonly { id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [violations, setViolations] = useState<readonly { field: string; message: string }[]>([]);

  const usableSkills = useMemo(
    () => skills.filter((skill) => skill.state === 'active' && skill.versions.some((v) => v.state === 'published')),
    [skills],
  );

  const currentSkills = employee.skills ?? [];
  // Current-but-unavailable registrations stay visible (checked, pinned
  // version rendered as text) so saving another field can never silently
  // drop them — the server rejects the save until the user unchecks.
  const skillOptions = useMemo(() => {
    const usable = new Set(usableSkills.map((skill) => skill.id));
    const stale = currentSkills
      .filter((skill) => !usable.has(skill.id))
      .map((skill) => ({ id: skill.id, name: skill.name || skill.id, stale: true }));
    return [...usableSkills.map((skill) => ({ id: skill.id, name: skill.name, stale: false })), ...stale];
  }, [usableSkills, currentSkills]);
  const skillIsUsable = (id: string) => usableSkills.some((skill) => skill.id === id);

  // Current model ids absent from the catalog (decommissioned upstream)
  // stay selectable so the user can see and remove them.
  const currentModels = employee.models.length > 0 ? employee.models : employee.model ? [employee.model] : [];
  const modelOptions = useMemo(() => {
    const catalog = new Set(models.map((model) => model.id));
    return [
      ...models.map((model) => ({
        value: model.id,
        label: `${model.displayName}（${model.id}${model.protocol === 'anthropic' ? ' · anthropic' : ''}）`,
      })),
      ...currentModels
        .filter((id) => !catalog.has(id))
        .map((id) => ({ value: id, label: `${id}（${t('editModelUnavailable')}）` })),
    ];
  }, [models, currentModels]);

  const initial = useMemo<EditValues>(() => {
    const visibility = employee.visibility ?? null;
    return {
      displayName: employee.displayName,
      description: employee.description ?? '',
      owner: employee.ownerId,
      team: employee.team ?? '',
      models: [...currentModels],
      knowledgeBases: employee.knowledgeBases?.map((kb) => kb.id) ?? [],
      skills: currentSkills.map((skill) => skill.id),
      skillVersions: Object.fromEntries(currentSkills.map((skill) => [skill.id, skill.version])),
      // Legacy audience pre-fills with the owning team so an untouched
      // form diffs to "no change"; touching anything converts to explicit.
      scopeMode: visibility?.mode === 'all' ? 'all' : 'restricted',
      scopeTeams: visibility ? visibility.teams.map((team) => team.id) : employee.team ? [employee.team] : [],
      scopeUsers: visibility ? visibility.users.map((user) => user.id) : [],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee]);

  useEffect(() => {
    if (open) {
      form.resetFields();
      setError(null);
      setViolations([]);
      client
        .teams()
        .then(setTeams)
        .catch(() => setTeams([]));
      client
        .models()
        .then((page) => setModels(page.models.filter((model) => model.enabled && model.sourceType === 'gateway')))
        .catch(() => setModels([]));
      client
        .users()
        .then((all) => setUsers(all.filter((user) => user.status === 'active')))
        .catch(() => setUsers([]));
      client
        .skills()
        .then(setSkills)
        .catch(() => setSkills([]));
      portal
        .knowledgeStatus()
        .then((status) => setKnowledgeBases(status.knowledgeBases ?? []))
        .catch(() => setKnowledgeBases([]));
    }
  }, [open, form, portal, client]);

  const latestFor = (id: string) => {
    const skill = usableSkills.find((entry) => entry.id === id);
    return skill ? latestPublishedVersion(skill) : (initial.skillVersions[id] ?? '');
  };

  const values = Form.useWatch([], form) as Partial<EditValues> | undefined;
  const update = useMemo(() => {
    // useWatch reports undefined until the form store is live; an empty
    // read must count as "no change", not "everything cleared".
    if (!values || Object.keys(values).length === 0) return null;
    return buildEmployeeUpdate(values, initial, latestFor);
    // latestFor closes over catalog state already captured in values/initial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, initial, usableSkills]);

  const submit = async (values: EditValues) => {
    const payload = buildEmployeeUpdate(values, initial, latestFor);
    if (!payload) return;
    if (
      payload.visibility?.mode === 'restricted' &&
      (payload.visibility.teams ?? []).length + (payload.visibility.users ?? []).length === 0
    ) {
      setError(t('scopeRequireOne'));
      return;
    }
    setPending(true);
    setError(null);
    setViolations([]);
    try {
      const result = await portal.updateEmployee(employee.name, payload);
      if (result.kind === 'rejected') {
        setError(result.message);
        setViolations(result.violations ?? []);
        return;
      }
      notify(AdminNotificationKind.Success, t('editSaved'));
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`${t('editTitle')} · ${employee.displayName || employee.name}`}
      width={720}
      onCancel={onClose}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={onClose}>{translate(language, 'cancel')}</Button>
          <Button type="primary" loading={pending} disabled={!update} onClick={() => void form.submit()}>
            {t('editSave')}
          </Button>
        </Space>
      }
    >
      <Typography.Paragraph type="secondary">{t('editDescription')}</Typography.Paragraph>
      {error ? (
        <Alert
          type="error"
          showIcon
          title={error}
          style={{ marginBottom: 16 }}
          description={
            violations.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {violations.map((item) => (
                  <li key={`${item.field}:${item.message}`}>
                    {item.field}：{item.message}
                  </li>
                ))}
              </ul>
            ) : undefined
          }
        />
      ) : null}
      <Form form={form} layout="vertical" initialValues={initial} onFinish={(values) => void submit(values)}>
        <Typography.Text strong>{t('createStepBasic')}</Typography.Text>
        <Form.Item name="displayName" label={t('labelDisplayName')} style={{ marginTop: 8 }}>
          <Input autoComplete="off" disabled={pending} />
        </Form.Item>
        <Form.Item
          name="description"
          label={t('labelDescription')}
          rules={[{ max: 500, message: t('descriptionPlaceholder') }]}
        >
          <Input.TextArea rows={2} placeholder={t('descriptionPlaceholder')} disabled={pending} />
        </Form.Item>
        <Form.Item
          name="owner"
          label={t('labelOwnerSelect')}
          tooltip={t('ownerTooltip')}
          rules={[{ required: true, message: translate(language, 'fieldRequired') }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            placeholder={t('ownerPlaceholder')}
            disabled={pending}
            options={users.map((user) => ({
              value: user.id,
              label: `${user.displayName}（${user.username}）`,
            }))}
          />
        </Form.Item>
        <Form.Item
          name="team"
          label={t('labelTeam')}
          tooltip={translate(language, 'digitalEmployeesTeamTooltip')}
          rules={[{ required: true, message: translate(language, 'fieldRequired') }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            placeholder={translate(language, 'digitalEmployeesTeamPlaceholder')}
            disabled={pending}
            options={teams.map((team) => ({ value: team.id, label: team.name }))}
          />
        </Form.Item>
        <Form.Item
          name="models"
          label={t('createModelLabel')}
          tooltip={t('createModelTooltip')}
          rules={[{ required: true, message: translate(language, 'fieldRequired') }]}
        >
          <Select mode="multiple" placeholder={t('createModelPlaceholder')} disabled={pending} options={modelOptions} />
        </Form.Item>

        <Typography.Text strong>{t('createKnowledgeSection')}</Typography.Text>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 4 }}>
          {t('createKnowledgeNotice')}
        </Typography.Paragraph>
        {employee.knowledgeBases == null ? (
          <Alert type="info" showIcon title={t('editKnowledgeLegacyHint')} style={{ marginBottom: 8 }} />
        ) : null}
        {knowledgeBases.length === 0 ? (
          <Typography.Text type="secondary">{t('createKnowledgeEmpty')}</Typography.Text>
        ) : (
          <Form.Item name="knowledgeBases" style={{ marginBottom: 8 }}>
            <Checkbox.Group
              disabled={pending}
              options={knowledgeBases.map((kb) => ({ value: kb.id, label: kb.name }))}
            />
          </Form.Item>
        )}

        <Typography.Text strong>{t('createSkillsSection')}</Typography.Text>
        {skillOptions.length === 0 ? (
          <Typography.Paragraph type="secondary">{t('createSkillsEmpty')}</Typography.Paragraph>
        ) : (
          <>
            <Form.Item name="skills" style={{ marginTop: 8, marginBottom: 8 }}>
              <Checkbox.Group
                disabled={pending}
                options={skillOptions.map((skill) => ({
                  value: skill.id,
                  label: skill.stale ? `${skill.name}（${t('editSkillUnavailable')}）` : skill.name,
                }))}
              />
            </Form.Item>
            <Form.Item noStyle shouldUpdate={(prev, cur) => prev.skills !== cur.skills}>
              {({ getFieldValue }) => {
                const checked = ((getFieldValue('skills') as string[] | undefined) ?? []).filter((id) =>
                  skillOptions.some((skill) => skill.id === id),
                );
                if (checked.length === 0) return null;
                return (
                  <div className="flex flex-col gap-2" style={{ marginBottom: 8 }}>
                    {checked.map((id) => {
                      if (!skillIsUsable(id)) {
                        const name = skillOptions.find((skill) => skill.id === id)?.name ?? id;
                        const pinned = initial.skillVersions[id] ?? '—';
                        return (
                          <Space key={id} size={8}>
                            <Typography.Text type="warning" style={{ fontSize: 12 }}>
                              {name} · {t('createSkillVersionLabel')} {pinned}
                            </Typography.Text>
                          </Space>
                        );
                      }
                      const skill = usableSkills.find((entry) => entry.id === id);
                      if (!skill) return null;
                      const published = skill.versions.filter((v) => v.state === 'published');
                      return (
                        <Space key={id} align="center" size={8}>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {skill.name} · {t('createSkillVersionLabel')}
                          </Typography.Text>
                          <Form.Item
                            name={['skillVersions', id]}
                            initialValue={initial.skillVersions[id] || latestPublishedVersion(skill)}
                            noStyle
                          >
                            <Select
                              size="small"
                              style={{ minWidth: 140 }}
                              disabled={pending}
                              options={published.map((v) => ({ value: v.version, label: v.version }))}
                            />
                          </Form.Item>
                        </Space>
                      );
                    })}
                  </div>
                );
              }}
            </Form.Item>
          </>
        )}

        <Typography.Text strong>{t('createScopeModeLabel')}</Typography.Text>
        {employee.visibility == null ? (
          <Alert type="info" showIcon title={t('editScopeLegacyHint')} style={{ marginTop: 8, marginBottom: 8 }} />
        ) : null}
        <Form.Item name="scopeMode" style={{ marginTop: 8 }}>
          <Radio.Group
            disabled={pending}
            onChange={() => {
              setError(null);
              setViolations([]);
            }}
            options={[
              { value: 'restricted', label: t('scopeModeRestricted') },
              { value: 'all', label: t('scopeModeAll') },
            ]}
          />
        </Form.Item>
        <Form.Item noStyle shouldUpdate={(prev, cur) => prev.scopeMode !== cur.scopeMode}>
          {({ getFieldValue }) =>
            getFieldValue('scopeMode') === 'all' ? (
              <Alert type="warning" showIcon title={t('scopeModeAllHint')} style={{ marginBottom: 16 }} />
            ) : (
              <>
                <Form.Item name="scopeTeams" label={t('scopeTeamsLabel')}>
                  <Select
                    mode="multiple"
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    placeholder={t('scopeTeamsPlaceholder')}
                    disabled={pending}
                    options={teams.map((team) => ({ value: team.id, label: team.name }))}
                  />
                </Form.Item>
                <Form.Item name="scopeUsers" label={t('scopeUsersLabel')}>
                  <Select
                    mode="multiple"
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    placeholder={t('scopeUsersPlaceholder')}
                    disabled={pending}
                    options={users.map((user) => ({
                      value: user.id,
                      label: `${user.displayName}（${user.username}）`,
                    }))}
                  />
                </Form.Item>
              </>
            )
          }
        </Form.Item>
      </Form>
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
  onUpdated,
}: {
  readonly employee: PortalEmployee;
  readonly portal: PortalClient;
  readonly client: AdminConsoleClient;
  readonly onBack: () => void;
  readonly onChat: (employee: PortalEmployee) => void;
  readonly onUpdated: (employee: PortalEmployee) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
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
          <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>
            {t('editTitle')}
          </Button>
          <Button type="primary" icon={<MessageOutlined />} onClick={() => void onChat(employee)}>
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
                      key: 'description',
                      label: t('labelDescription'),
                      children: employee.description || t('notProvided'),
                    },
                    {
                      key: 'team',
                      label: t('labelTeam'),
                      children: employee.team || t('notProvided'),
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
              </div>
            ),
          },
          {
            key: 'capabilities',
            label: t('detailTabCapabilities'),
            children: <CapabilitiesView employee={employee} />,
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
                      children: <VisibilityView employee={employee} />,
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
                        ? `${t('publishChannelOn')}（${employee.channels.wecomName ?? t('publishChannelUnknownName')}）`
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
            children: <EmptyDetails title={t('runsGapTitle')} description={t('runsGapDescription')} />,
          },
        ]}
      />

      <DeleteBlockedModal employee={deleting ? employee : null} onClose={() => setDeleting(false)} />
      <EditEmployeeModal
        employee={employee}
        client={client}
        portal={portal}
        open={editing}
        onClose={() => setEditing(false)}
        onSaved={async () => {
          setEditing(false);
          try {
            onUpdated(await portal.getEmployee(employee.name));
          } catch {
            notify(AdminNotificationKind.Error, t('editRefreshFailed'));
          }
        }}
      />
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

// Knowledge bases and skills registered at creation. null/undefined means
// the legacy policy (nothing was configured when the employee was made);
// an empty list is an explicit deny-all knowledge policy.
function CapabilitiesView({ employee }: { readonly employee: PortalEmployee }) {
  const bases = employee.knowledgeBases ?? null;
  const skills = employee.skills ?? null;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Typography.Text strong>{t('capabilitiesKnowledgeTitle')}</Typography.Text>
        <div style={{ marginTop: 8 }}>
          {bases === null ? (
            <Typography.Text type="secondary">{t('capabilitiesKnowledgeLegacy')}</Typography.Text>
          ) : bases.length === 0 ? (
            <Typography.Text type="secondary">{t('capabilitiesKnowledgeNone')}</Typography.Text>
          ) : (
            <Space wrap size={6}>
              {bases.map((kb) => (
                <Tag key={kb.id}>{kb.name || kb.id}</Tag>
              ))}
            </Space>
          )}
        </div>
      </div>
      <div>
        <Typography.Text strong>{t('capabilitiesSkillsTitle')}</Typography.Text>
        <div style={{ marginTop: 8 }}>
          {skills === null || skills.length === 0 ? (
            <Typography.Text type="secondary">{t('capabilitiesSkillsNone')}</Typography.Text>
          ) : (
            <Space wrap size={6}>
              {skills.map((skill) => (
                <Tag key={skill.id}>
                  {skill.name || skill.id} · {skill.version}
                </Tag>
              ))}
            </Space>
          )}
        </div>
      </div>
    </div>
  );
}

// The explicit open scope from creation; null keeps the legacy
// owner/team rule text instead of pretending an audience was configured.
function VisibilityView({ employee }: { readonly employee: PortalEmployee }) {
  const visibility = employee.visibility ?? null;
  if (visibility === null) {
    return <Typography.Text type="secondary">{t('scopeLegacy')}</Typography.Text>;
  }
  if (visibility.mode === 'all') {
    return <Tag color="warning">{t('scopeModeAllTag')}</Tag>;
  }
  const teams = visibility.teams ?? [];
  const users = visibility.users ?? [];
  if (teams.length + users.length === 0) {
    return (
      <span>
        <Tag>{t('scopeModeRestrictedTag')}</Tag>
        <Typography.Text type="secondary">{t('scopeOwnerOnly')}</Typography.Text>
      </span>
    );
  }
  return (
    <span>
      <Tag>{t('scopeModeRestrictedTag')}</Tag>
      <Space wrap size={6} style={{ marginLeft: 4 }}>
        {teams.map((team) => (
          <Tag key={`team-${team.id}`} color="blue">
            {team.name || team.id}
          </Tag>
        ))}
        {users.map((user) => (
          <Tag key={`user-${user.id}`}>{user.name || user.id}</Tag>
        ))}
      </Space>
    </span>
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
      filter === 'all' ? true : filter === 'pending' ? request.state === 'pending' : request.state !== 'pending',
    );
    if (!query.trim()) return byState;
    const needle = query.trim().toLowerCase();
    return byState.filter((request) =>
      [request.employeeName, request.displayName, request.owner].some((value) => value.toLowerCase().includes(needle)),
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
        <Alert type="error" showIcon title={`${translate(language, 'digitalEmployeesRequestsLoadFailed')}：${error}`} />
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

      <Drawer open={viewing !== null} title={t('requestsDetailTitle')} size={480} onClose={() => setViewing(null)}>
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
      <Typography.Paragraph type="secondary">{t('requestsRejectDescription')}</Typography.Paragraph>
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
