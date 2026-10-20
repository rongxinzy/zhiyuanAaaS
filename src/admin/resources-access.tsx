import type { PlatformUser } from '@aep/sdk-node';
import { Alert, Badge, Empty, Space, Table, type TableProps, Tag, Typography } from 'antd';
import type { AdminResources, AdminSkill, AdminTeam as Team } from './client.js';
import { resourcesCopy as rc } from './resources-copy.js';
import { type ModelResources, PAGINATION, t } from './resources-shared.js';

// ---------------------------------------------------------------------------
// Effective access computation (users / teams / roles share the same rules).
// ---------------------------------------------------------------------------
export interface AccessRow {
  readonly key: string;
  readonly resourceType: 'skill' | 'model';
  readonly resourceId: string;
  readonly resourceName: string;
  readonly source: string;
  readonly effective: boolean;
  readonly reason: string | null;
}

function skillEffective(skill: AdminSkill | undefined): boolean {
  return Boolean(skill?.enabled && skill.state === 'active');
}

export function buildAccessRows(input: {
  readonly resources: AdminResources;
  readonly modelResources: ModelResources;
  readonly subjects: readonly {
    readonly type: 'user' | 'role' | 'team';
    readonly id: string;
    readonly label: string;
  }[];
  readonly accountActive: boolean;
}): readonly AccessRow[] {
  const { resources, modelResources, subjects, accountActive } = input;
  const skills = new Map(resources.skills.map((skill) => [skill.id, skill]));
  const models = new Map(modelResources.models.map((model) => [model.id, model]));
  const subjectKeys = new Map(subjects.map((subject) => [`${subject.type}:${subject.id}`, subject]));
  const rows: AccessRow[] = [];
  for (const assignment of resources.assignments) {
    const subject = subjectKeys.get(`${assignment.subjectType}:${assignment.subjectId}`);
    if (!subject) continue;
    const skill = skills.get(assignment.skillId);
    // An expired grant authorizes nothing: the manifest already filters those
    // rows out, so showing this one as effective would contradict the server.
    const expiresAt = assignment.expiresAt;
    const expired =
      typeof expiresAt === 'string' && Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt) <= Date.now();
    const effective = skill !== undefined && accountActive && skillEffective(skill) && !expired;
    rows.push({
      key: `skill:${assignment.id}`,
      resourceType: 'skill',
      resourceId: assignment.skillId,
      resourceName: skill?.name ?? assignment.skillId,
      source:
        subject.type === 'user'
          ? rc.accessDirect
          : `${subject.type === 'role' ? rc.accessViaRole : rc.accessViaTeam}：${subject.label}`,
      effective,
      reason: effective
        ? null
        : expired
          ? rc.accessGrantExpired
          : skill === undefined
            ? rc.accessStateUnknown
            : !accountActive
              ? rc.accessUserDisabled
              : rc.accessResourceDisabled,
    });
  }
  for (const assignment of modelResources.assignments) {
    const subject = subjectKeys.get(`${assignment.subject.type}:${assignment.subject.id}`);
    if (!subject) continue;
    const model = models.get(assignment.resourceId);
    const effective = model !== undefined && accountActive && Boolean(model.enabled);
    rows.push({
      key: `model:${assignment.id}`,
      resourceType: 'model',
      resourceId: assignment.resourceId,
      resourceName: model?.displayName ?? assignment.resourceId,
      source:
        subject.type === 'user'
          ? rc.accessDirect
          : `${subject.type === 'role' ? rc.accessViaRole : rc.accessViaTeam}：${subject.label}`,
      effective,
      reason: effective
        ? null
        : model === undefined
          ? rc.accessStateUnknown
          : !accountActive
            ? rc.accessUserDisabled
            : rc.accessResourceDisabled,
    });
  }
  return rows;
}

function inheritedRoleIds(user: PlatformUser, resources: AdminResources): readonly string[] {
  const ownTeams = new Set(user.teamIds ?? []);
  return [
    ...new Set(
      resources.teams
        .filter((team) => team.enabled && ownTeams.has(team.id))
        .flatMap((team) => team.defaultRoleIds ?? []),
    ),
  ];
}

export function effectiveRoleIds(user: PlatformUser, resources: AdminResources): readonly string[] {
  return [...new Set([...(user.roleIds ?? []), ...inheritedRoleIds(user, resources)])];
}

export function teamSubjects(team: Team, resources: AdminResources) {
  const roles = new Map(resources.roles.map((role) => [role.id, role]));
  return [
    { type: 'team' as const, id: team.id, label: team.name },
    ...(team.defaultRoleIds ?? [])
      .filter((id) => roles.get(id)?.enabled)
      .map((id) => ({ type: 'role' as const, id, label: roles.get(id)?.name ?? id })),
  ];
}

export function userSubjects(
  user: PlatformUser,
  resources: AdminResources,
): readonly { readonly type: 'user' | 'role' | 'team'; readonly id: string; readonly label: string }[] {
  const roles = new Map(resources.roles.map((role) => [role.id, role]));
  const teams = new Map(resources.teams.map((team) => [team.id, team]));
  return [
    { type: 'user' as const, id: user.id, label: user.displayName },
    ...effectiveRoleIds(user, resources)
      .filter((id) => roles.get(id)?.enabled)
      .map((id) => ({ type: 'role' as const, id, label: roles.get(id)?.name ?? id })),
    ...(user.teamIds ?? [])
      .filter((id) => teams.get(id)?.enabled)
      .map((id) => ({ type: 'team' as const, id, label: teams.get(id)?.name ?? id })),
  ];
}

export function AccessTable({
  rows,
  modelsAvailable = true,
  skillsAvailable = true,
}: {
  readonly rows: readonly AccessRow[];
  readonly modelsAvailable?: boolean;
  readonly skillsAvailable?: boolean;
}) {
  const columns: TableProps<AccessRow>['columns'] = [
    {
      title: rc.accessResource,
      key: 'resource',
      render: (_, row) => (
        <Space size={8}>
          <Tag color={row.resourceType === 'skill' ? 'geekblue' : 'purple'}>
            {row.resourceType === 'skill' ? rc.resourceTypeSkill : rc.resourceTypeModel}
          </Tag>
          <span>{row.resourceName}</span>
        </Space>
      ),
    },
    { title: rc.accessPermission, key: 'permission', render: () => rc.accessUse },
    { title: rc.accessSource, dataIndex: 'source', key: 'source' },
    {
      title: rc.accessState,
      key: 'effective',
      render: (_, row) =>
        row.effective ? (
          <Badge status="success" text={rc.accessEffective} />
        ) : (
          <Badge status="default" text={row.reason ?? rc.accessResourceDisabled} />
        ),
    },
  ];
  return (
    <Space orientation="vertical" size={12} style={{ width: '100%' }}>
      {skillsAvailable ? null : <Alert type="info" showIcon title={rc.accessSkillsUnknown} />}
      {modelsAvailable ? null : <Alert type="info" showIcon title={rc.accessModelsUnknown} />}
      {rows.length === 0 ? (
        <Empty
          description={modelsAvailable && skillsAvailable ? rc.accessEmpty : rc.accessStateUnknown}
          children={<Typography.Text type="secondary">{rc.accessEmptyHint}</Typography.Text>}
        />
      ) : (
        <Table<AccessRow> rowKey="key" columns={columns} dataSource={[...rows]} pagination={PAGINATION} size="small" />
      )}
    </Space>
  );
}

function accessCount(rows: readonly AccessRow[]): { readonly skills: number; readonly models: number } {
  const effective = rows.filter((row) => row.effective);
  return {
    skills: new Set(effective.filter((row) => row.resourceType === 'skill').map((row) => row.resourceId)).size,
    models: new Set(effective.filter((row) => row.resourceType === 'model').map((row) => row.resourceId)).size,
  };
}

export function ResourceAccessTags({
  rows,
  modelsAvailable = true,
  skillsAvailable = true,
}: {
  readonly rows: readonly AccessRow[];
  readonly modelsAvailable?: boolean;
  readonly skillsAvailable?: boolean;
}) {
  const counts = accessCount(rows);
  return (
    <Space size={4} wrap>
      <Tag>{skillsAvailable ? `${counts.skills} ${t('skills')}` : rc.accessSkillsUnknown}</Tag>
      {modelsAvailable ? <Tag>{`${counts.models} ${t('models')}`}</Tag> : <Tag>{rc.accessModelsUnknown}</Tag>}
    </Space>
  );
}
