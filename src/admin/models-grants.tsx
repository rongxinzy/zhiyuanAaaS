import type { AdminModel, ModelAssignment, PlatformUser, Role, Team } from '@aep/sdk-node';
import { ArrowLeftOutlined, SearchOutlined } from '@ant-design/icons';
import { Alert, Button, Checkbox, Empty, Input, Segmented, Space, Tag, Typography } from 'antd';
import { useCallback, useMemo, useState } from 'react';
import { runBatch } from './batch.js';
import { type AdminConsoleClient, AdminModelSubjectType } from './client.js';
import { translate } from './i18n.js';
import { language, subjectTypeLabel } from './models-shared.js';

export type ModelGrantFilter = 'all' | AdminModelSubjectType;

export function ModelGrantPage({
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
