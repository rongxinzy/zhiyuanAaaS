import { EditOutlined, KeyOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Descriptions, Drawer, Empty, Popconfirm, Space, Table, Tabs, Tag, Typography } from 'antd';
import {
  type AdminConsoleClient,
  type AdminResources,
  type AdminSkill,
  type AdminSkillAssignment,
  type AdminSkillInstallation,
  AdminSubjectType,
} from './client.js';
import { formatTimestamp } from './format.js';
import { resourcesCopy as rc } from './resources-copy.js';
import { EnabledBadge, PAGINATION, t, UnknownText, useMutationRunner } from './resources-shared.js';
import { SkillEmployees, type SkillEmployeesState } from './resources-skill-employees.js';
import { VersionManager } from './resources-skill-versions.js';
import { SubjectCell } from './resources-subjects.js';

// One grant's expiry: a date (marked once past), a perpetual grant, or unknown
// when the server did not report the field at all.
function GrantExpires({ expiresAt }: { readonly expiresAt: string | null | undefined }) {
  if (expiresAt === undefined) return <Typography.Text type="secondary">{rc.grantExpiresUnknown}</Typography.Text>;
  if (expiresAt === null) return <Typography.Text type="secondary">{rc.grantExpiresPerpetual}</Typography.Text>;
  const parsed = Date.parse(expiresAt);
  if (!Number.isFinite(parsed)) return <Typography.Text type="secondary">{rc.grantExpiresUnknown}</Typography.Text>;
  const label = formatTimestamp(expiresAt) || expiresAt;
  return parsed <= Date.now() ? (
    <Tag color="warning">{`${rc.grantExpiresExpired} · ${label}`}</Tag>
  ) : (
    <Typography.Text>{label}</Typography.Text>
  );
}

export function SkillDetailDrawer({
  client,
  employees,
  skill,
  resources,
  canWrite,
  canAssign,
  open,
  onClose,
  onChanged,
  onError,
  onEdit,
  onGrant,
}: {
  readonly client: AdminConsoleClient;
  readonly employees: SkillEmployeesState;
  readonly skill: AdminSkill;
  readonly resources: AdminResources;
  readonly canWrite: boolean;
  readonly canAssign: boolean;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
  readonly onEdit: () => void;
  readonly onGrant: () => void;
}) {
  const { pending, run } = useMutationRunner(onChanged, onError);
  const assignments = resources.assignments.filter((item) => item.skillId === skill.id);
  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={720}
      title={
        <Space size={8}>
          <span>{skill.name}</span>
          <EnabledBadge enabled={skill.enabled} />
        </Space>
      }
      extra={
        canWrite ? (
          <Button size="small" icon={<EditOutlined />} onClick={onEdit}>
            {t('edit')}
          </Button>
        ) : null
      }
    >
      <Tabs
        items={[
          {
            key: 'config',
            label: rc.skillDetailConfig,
            children: (
              <Space orientation="vertical" size={16} style={{ width: '100%' }}>
                <Descriptions
                  column={1}
                  bordered
                  size="small"
                  items={[
                    { key: 'id', label: t('skillId'), children: skill.id },
                    { key: 'name', label: t('skillName'), children: skill.name },
                    {
                      key: 'description',
                      label: t('description'),
                      children: skill.description ? skill.description : <UnknownText />,
                    },
                    { key: 'status', label: t('status'), children: <EnabledBadge enabled={skill.enabled} /> },
                  ]}
                />
                {canWrite ? (
                  <Space wrap>
                    <Button icon={<EditOutlined />} onClick={onEdit}>
                      {t('edit')}
                    </Button>
                    <Button
                      disabled={pending}
                      onClick={() =>
                        void run(async () => {
                          await client.updateSkill(skill.id, { enabled: !skill.enabled });
                        })
                      }
                    >
                      {skill.enabled ? t('disable') : t('enable')}
                    </Button>
                  </Space>
                ) : null}
              </Space>
            ),
          },
          {
            key: 'versions',
            label: `${rc.skillDetailVersions}（${skill.versions.length}）`,
            children: (
              <VersionManager
                client={client}
                skill={skill}
                canWrite={canWrite}
                onChanged={onChanged}
                onError={onError}
              />
            ),
          },
          {
            key: 'access',
            label: canAssign ? `${rc.skillDetailAccess}（${assignments.length}）` : rc.skillDetailAccess,
            children: (
              <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                {canAssign ? (
                  <Button icon={<KeyOutlined />} onClick={onGrant}>
                    {rc.grantAccess}
                  </Button>
                ) : null}
                {!canAssign ? (
                  <Alert type="info" title={rc.accessSkillsUnknown} />
                ) : assignments.length === 0 ? (
                  <Empty description={rc.skillAccessEmpty}>
                    <Typography.Text type="secondary">{rc.skillAccessEmptyHint}</Typography.Text>
                  </Empty>
                ) : (
                  <Table<AdminSkillAssignment>
                    rowKey="id"
                    size="small"
                    pagination={PAGINATION}
                    dataSource={[...assignments]}
                    columns={[
                      {
                        title: rc.assignmentSubject,
                        key: 'subject',
                        render: (_, assignment) => (
                          <SubjectCell
                            subjectType={assignment.subjectType}
                            subjectId={assignment.subjectId}
                            user={
                              assignment.subjectType === AdminSubjectType.User
                                ? resources.users.find((user) => user.id === assignment.subjectId)
                                : undefined
                            }
                          />
                        ),
                      },
                      {
                        title: rc.skillGrantExpires,
                        key: 'expiresAt',
                        render: (_, assignment) => <GrantExpires expiresAt={assignment.expiresAt} />,
                      },
                      ...(canAssign
                        ? [
                            {
                              title: t('actions'),
                              key: 'actions',
                              align: 'right' as const,
                              render: (_: unknown, assignment: AdminSkillAssignment) => (
                                <Popconfirm
                                  title={t('revokeConfirmTitle')}
                                  description={t('revokeConfirmDescription')}
                                  okText={t('confirmRevoke')}
                                  cancelText={t('cancel')}
                                  okButtonProps={{ danger: true }}
                                  onConfirm={() =>
                                    void run(async () => {
                                      await client.deleteSkillAssignment(assignment.id);
                                    })
                                  }
                                >
                                  <Button type="link" size="small" danger disabled={pending}>
                                    {rc.assignmentRevoke}
                                  </Button>
                                </Popconfirm>
                              ),
                            },
                          ]
                        : []),
                    ]}
                  />
                )}
              </Space>
            ),
          },
          {
            key: 'employees',
            label: rc.skillDetailEmployees,
            children: <SkillEmployees state={employees} skillId={skill.id} variant="table" />,
          },
          {
            key: 'installations',
            label: rc.skillDetailInstallations,
            children: <SkillInstallations client={client} skillId={skill.id} />,
          },
        ]}
      />
    </Drawer>
  );
}

// What Agents last reported about this Skill. The counts are scoped to the
// users the Skill is granted to, so the list only holds people it actually
// reaches - not every user that ever synced another Skill.
function SkillInstallations({ client, skillId }: { readonly client: AdminConsoleClient; readonly skillId: string }) {
  const installationsQuery = useQuery({
    queryKey: ['admin', 'skill-installations', skillId],
    gcTime: 0,
    queryFn: () => client.skillInstallations(skillId),
  });
  const loading = installationsQuery.isPending;
  const failed = installationsQuery.isError;
  const page = installationsQuery.data ?? null;

  if (loading) return <Typography.Text type="secondary">{rc.installLoading}</Typography.Text>;
  if (failed || !page) return <Typography.Text type="secondary">{rc.installUnavailable}</Typography.Text>;

  const summary = page.summary;
  const counts: readonly (readonly [string, number])[] = [
    [rc.installGranted, summary.granted],
    [rc.installReported, summary.reported],
    [rc.installInstalled, summary.installed],
    [rc.installMissing, summary.missing],
    [rc.installUnreported, summary.unreported],
  ];
  return (
    <Space orientation="vertical" size={12} style={{ width: '100%' }}>
      <Space size={16} wrap>
        {counts.map(([label, value]) => (
          <Typography.Text key={label} type="secondary">
            {label} <Typography.Text strong>{value}</Typography.Text>
          </Typography.Text>
        ))}
        <Typography.Text type="secondary">
          {rc.installLatest}{' '}
          {summary.latestReportedAt
            ? formatTimestamp(summary.latestReportedAt) || summary.latestReportedAt
            : rc.installNever}
        </Typography.Text>
      </Space>
      {page.items.length === 0 ? (
        <Empty
          description={<UnknownText>{summary.granted === 0 ? rc.installEmpty : rc.installAllInstalled}</UnknownText>}
        />
      ) : (
        <Table<AdminSkillInstallation>
          rowKey="userId"
          size="small"
          pagination={PAGINATION}
          dataSource={[...page.items]}
          columns={[
            { title: rc.installColumnUser, dataIndex: 'userId', key: 'userId' },
            {
              title: rc.installColumnState,
              dataIndex: 'state',
              key: 'state',
              render: (value: AdminSkillInstallation['state']) => (
                <Tag color={value === 'missing' ? 'warning' : 'default'}>
                  {value === 'missing' ? rc.installStateMissing : rc.installStateUnreported}
                </Tag>
              ),
            },
            {
              title: rc.installColumnRevision,
              dataIndex: 'revision',
              key: 'revision',
              render: (value?: string) => value || rc.notCollected,
            },
            {
              title: rc.installColumnReportedAt,
              dataIndex: 'reportedAt',
              key: 'reportedAt',
              render: (value?: string) => (value ? formatTimestamp(value) || value : rc.notCollected),
            },
            {
              title: rc.installColumnItemStatus,
              dataIndex: 'itemStatus',
              key: 'itemStatus',
              render: (value?: string) => value || rc.notCollected,
            },
          ]}
        />
      )}
      {page.truncated ? <Typography.Text type="secondary">{rc.installTruncated}</Typography.Text> : null}
    </Space>
  );
}
