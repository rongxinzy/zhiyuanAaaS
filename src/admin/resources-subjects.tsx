import type { PlatformUser, Role } from '@aep/sdk-node';
import { Badge, Checkbox, Space, Typography } from 'antd';
import { type AdminSkillVersion, AdminSubjectType, type AdminTeam as Team } from './client.js';
import type { AdminTranslationKey } from './i18n.js';
import { NameCell, t } from './resources-shared.js';

// ---------------------------------------------------------------------------
// Shared pickers (exported for Operations and other work areas)
// ---------------------------------------------------------------------------
export function SubjectCell({
  subjectType,
  subjectId,
  user,
}: {
  readonly subjectType: string;
  readonly subjectId: string;
  readonly user: PlatformUser | undefined;
}) {
  if (subjectType === AdminSubjectType.User && user) {
    return <NameCell name={user.displayName} detail={user.username} />;
  }
  return (
    <Typography.Text type="secondary">
      {subjectType}: {subjectId}
    </Typography.Text>
  );
}

export function SubjectMultiPicker({
  users,
  roles,
  teams,
  excluded = new Set(),
  selected,
  onToggle,
  disabled,
  subjectType = 'all',
  searchQuery = '',
}: {
  readonly users: readonly PlatformUser[];
  readonly roles: readonly Role[];
  readonly teams: readonly Team[];
  readonly excluded?: ReadonlySet<string>;
  readonly selected: ReadonlySet<string>;
  readonly onToggle: (key: string) => void;
  readonly disabled: boolean;
  readonly subjectType?: 'all' | 'user' | 'role' | 'team';
  readonly searchQuery?: string;
}) {
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const options = [
    ...users.map((user) => ({
      key: `${AdminSubjectType.User}:${user.id}`,
      label: user.displayName,
      description: user.username,
      type: t('user'),
      subjectType: AdminSubjectType.User as AdminSubjectType,
    })),
    ...roles.map((role) => ({
      key: `${AdminSubjectType.Role}:${role.id}`,
      label: role.name,
      description: role.id,
      type: t('role'),
      subjectType: AdminSubjectType.Role as AdminSubjectType,
    })),
    ...teams.map((team) => ({
      key: `${AdminSubjectType.Team}:${team.id}`,
      label: team.name,
      description: team.id,
      type: t('team'),
      subjectType: AdminSubjectType.Team as AdminSubjectType,
    })),
  ].filter((option) => {
    if (excluded.has(option.key)) return false;
    if (subjectType !== 'all' && option.subjectType !== subjectType) return false;
    if (!normalizedQuery) return true;
    return `${option.label} ${option.description} ${option.key}`.toLocaleLowerCase().includes(normalizedQuery);
  });
  return (
    <div>
      <Typography.Text strong>{t('selectSubjects')}</Typography.Text>
      <fieldset
        aria-label={t('selectSubjects')}
        style={{
          marginTop: 8,
          maxHeight: 240,
          overflowY: 'auto',
          border: '1px solid rgba(128, 128, 128, 0.35)',
          borderRadius: 8,
          padding: 4,
        }}
      >
        {options.length === 0 ? (
          <Typography.Text type="secondary" style={{ display: 'block', padding: '12px 8px' }}>
            {t('noMatchingSubjects')}
          </Typography.Text>
        ) : (
          options.map((option) => (
            <Checkbox
              key={option.key}
              checked={selected.has(option.key)}
              onChange={() => onToggle(option.key)}
              disabled={disabled}
              style={{ display: 'flex', marginInlineStart: 0, padding: '6px 8px', alignItems: 'flex-start' }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {option.label}{' '}
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    ({option.type})
                  </Typography.Text>
                </span>
                <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                  {option.description}
                </Typography.Text>
              </span>
            </Checkbox>
          ))
        )}
      </fieldset>
      <Space size={8} style={{ marginTop: 8 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t('selectedSubjectsLabel')}
        </Typography.Text>
        <Badge count={selected.size} showZero color="geekblue" />
      </Space>
    </div>
  );
}

export function versionStateLabel(state: AdminSkillVersion['state']): AdminTranslationKey {
  if (state === 'published') return 'versionPublished';
  if (state === 'withdrawn') return 'versionWithdrawn';
  return 'versionDraft';
}
