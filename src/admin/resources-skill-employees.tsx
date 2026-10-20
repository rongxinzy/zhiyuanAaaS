import { useQuery } from '@tanstack/react-query';
import { Alert, Space, Spin, Table, Typography } from 'antd';
import { useMemo } from 'react';
import { type PortalClient, PortalError } from './portal.js';
import { resourcesCopy as rc } from './resources-copy.js';
import { PAGINATION } from './resources-shared.js';

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------
export type SkillEmployeeRef = {
  readonly key: string;
  readonly name: string;
  readonly displayName: string;
  readonly version: string;
};

export type SkillEmployeesState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly bySkill: ReadonlyMap<string, readonly SkillEmployeeRef[]>;
      readonly unconfigured: number;
    }
  | { readonly status: 'unavailable'; readonly forbidden: boolean };

// One portal read backs the list column, the detail tab and the delete dialog.
// The portal authorises the call and returns every employee, so the console
// groups them by Skill locally. A failed or forbidden read is never rendered as
// "nobody uses it".
export function useSkillEmployees(portal: PortalClient): SkillEmployeesState {
  const employeesQuery = useQuery({
    queryKey: ['portal', 'employees'],
    gcTime: 0,
    queryFn: () => portal.listEmployees(),
  });
  return useMemo<SkillEmployeesState>(() => {
    if (employeesQuery.isPending) return { status: 'loading' };
    if (employeesQuery.error) {
      return {
        status: 'unavailable',
        forbidden: employeesQuery.error instanceof PortalError && employeesQuery.error.status === 403,
      };
    }
    const bySkill = new Map<string, SkillEmployeeRef[]>();
    let unconfigured = 0;
    for (const employee of employeesQuery.data ?? []) {
      // null/undefined = no explicit skill policy yet; [] = an explicit
      // "no skills". Only a listed Skill counts as enabled.
      if (employee.skills === null || employee.skills === undefined) {
        unconfigured += 1;
        continue;
      }
      for (const skill of employee.skills) {
        const refs = bySkill.get(skill.id) ?? [];
        refs.push({
          key: employee.name,
          name: employee.name,
          displayName: employee.displayName,
          version: skill.version ?? '',
        });
        bySkill.set(skill.id, refs);
      }
    }
    return { status: 'ready', bySkill, unconfigured };
  }, [employeesQuery.data, employeesQuery.error, employeesQuery.isPending]);
}

// Presentational: one Skill's employee bindings for the shared read state.
export function SkillEmployees({
  state,
  skillId,
  variant,
}: {
  readonly state: SkillEmployeesState;
  readonly skillId: string;
  readonly variant: 'compact' | 'table';
}) {
  if (state.status === 'loading') return <Spin size="small" />;
  if (state.status === 'unavailable') {
    return (
      <Alert
        type="warning"
        showIcon
        title={state.forbidden ? rc.skillEmployeesForbidden : rc.skillEmployeesUnavailable}
      />
    );
  }
  const refs = state.bySkill.get(skillId) ?? [];
  if (refs.length === 0) {
    return <Typography.Text type="secondary">{rc.skillEmployeesNone}</Typography.Text>;
  }
  const count = (
    <Typography.Text type="secondary">{rc.skillEmployeesCount.replace('{count}', String(refs.length))}</Typography.Text>
  );
  const unconfigured =
    state.unconfigured > 0 ? (
      <Typography.Text type="secondary">
        {rc.skillEmployeesUnconfigured.replace('{count}', String(state.unconfigured))}
      </Typography.Text>
    ) : null;
  if (variant === 'table') {
    return (
      <Space orientation="vertical" size={8} style={{ width: '100%' }}>
        {count}
        <Table<SkillEmployeeRef>
          rowKey="key"
          size="small"
          pagination={PAGINATION}
          dataSource={[...refs]}
          columns={[
            { title: rc.skillEmployeeColumnName, key: 'name', render: (_, ref) => ref.displayName || ref.name },
            {
              title: rc.skillEmployeeColumnId,
              key: 'id',
              render: (_, ref) => <Typography.Text type="secondary">{ref.name}</Typography.Text>,
            },
            { title: rc.skillEmployeeColumnVersion, key: 'version', render: (_, ref) => ref.version || '—' },
          ]}
        />
        {unconfigured}
      </Space>
    );
  }
  return (
    <Space orientation="vertical" size={8} style={{ width: '100%' }}>
      {count}
      <div style={{ maxHeight: 160, overflowY: 'auto' }}>
        <ul style={{ margin: 0, paddingInlineStart: 20 }}>
          {refs.map((ref) => (
            <li key={ref.key}>
              {ref.displayName || ref.name}
              {ref.version ? ` · ${ref.version}` : ''}
            </li>
          ))}
        </ul>
      </div>
      {unconfigured}
    </Space>
  );
}
