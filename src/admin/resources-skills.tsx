import { KeyOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Button,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  type TableProps,
  Tag,
  Typography,
} from 'antd';
import { useMemo, useState } from 'react';
import { AdminRequestError, type AdminSkill, AdminSubjectType } from './client.js';
import { AdminNotificationKind, notify } from './notifications.js';
import type { PortalClient } from './portal.js';
import { resourcesCopy as rc } from './resources-copy.js';
import {
  EnabledBadge,
  NameCell,
  PAGINATION,
  RefreshButton,
  SectionHeader,
  type SectionProps,
  t,
  UnknownText,
  useMutationRunner,
} from './resources-shared.js';
import { SkillDetailDrawer } from './resources-skill-detail.js';
import { SkillEditorModal } from './resources-skill-editor.js';
import { SkillEmployees, useSkillEmployees } from './resources-skill-employees.js';
import { SkillGrantModal } from './resources-skill-grants.js';
import { SubjectCell } from './resources-subjects.js';

export function SkillsSection({
  client,
  portal,
  resources,
  canWrite,
  canAssign,
  loading,
  onRefresh,
  onChanged,
  onError,
}: SectionProps & { readonly canAssign: boolean; readonly portal: PortalClient }) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [detailSkillId, setDetailSkillId] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ readonly id?: string } | null>(null);
  const [grant, setGrant] = useState<{ readonly skillId?: string } | null>(null);
  const [forceSkill, setForceSkill] = useState<AdminSkill | null>(null);
  const { pending, run } = useMutationRunner(onChanged, onError);
  const employeeState = useSkillEmployees(portal);
  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return resources.skills.filter((skill) => {
      if (statusFilter === 'enabled' && !skill.enabled) return false;
      if (statusFilter === 'disabled' && skill.enabled) return false;
      if (!normalized) return true;
      return `${skill.name} ${skill.description ?? ''} ${skill.id}`.toLowerCase().includes(normalized);
    });
  }, [resources.skills, query, statusFilter]);
  const detailSkill = detailSkillId ? (resources.skills.find((skill) => skill.id === detailSkillId) ?? null) : null;
  const assignmentsFor = (skillId: string) => resources.assignments.filter((item) => item.skillId === skillId);
  const latestPublished = (skill: AdminSkill) =>
    skill.versions.find((version) => version.state === 'published')?.version ?? null;
  const forceRefs = forceSkill ? assignmentsFor(forceSkill.id) : [];
  // The server refuses to delete a Skill that is still referenced; surface that
  // as an explicit forced delete instead of the generic failure notice.
  const remove = (skill: AdminSkill) =>
    run(async () => {
      try {
        await client.deleteSkill(skill.id);
      } catch (error) {
        if (error instanceof AdminRequestError && error.code === 'SKILL_IN_USE') {
          setForceSkill(skill);
          return;
        }
        if (error instanceof AdminRequestError && error.status === 404) {
          // A stale row (deleted elsewhere, or a double click): say so and
          // refresh, instead of the generic "service unavailable" notice.
          notify(AdminNotificationKind.Error, rc.skillDeleteGone);
          await onChanged();
          return;
        }
        throw error;
      }
    });
  const forceRemove = (skill: AdminSkill) =>
    run(async () => {
      await client.deleteSkill(skill.id, true);
      setForceSkill(null);
    });
  const columns: TableProps<AdminSkill>['columns'] = [
    {
      title: t('skill'),
      key: 'skill',
      render: (_, skill) => <NameCell name={skill.name} detail={skill.id} />,
    },
    {
      title: rc.skillPurpose,
      key: 'purpose',
      render: (_, skill) =>
        skill.description ? <Typography.Text type="secondary">{skill.description}</Typography.Text> : <UnknownText />,
    },
    {
      title: t('versions'),
      key: 'versions',
      width: 120,
      render: (_, skill) => {
        const published = latestPublished(skill);
        return published ? <Tag color="green">{published}</Tag> : <UnknownText>—</UnknownText>;
      },
    },
    { title: t('status'), key: 'status', render: (_, skill) => <EnabledBadge enabled={skill.enabled} /> },
    {
      title: rc.skillEmployees,
      key: 'employees',
      render: (_, skill) => {
        if (employeeState.status === 'loading') return <Spin size="small" />;
        if (employeeState.status === 'unavailable') {
          return <UnknownText>{rc.skillEmployeesUnknown}</UnknownText>;
        }
        const count = (employeeState.bySkill.get(skill.id) ?? []).length;
        return count === 0 ? (
          <Typography.Text type="secondary">{rc.skillEmployeesCellNone}</Typography.Text>
        ) : (
          <Typography.Text>{rc.skillEmployeesCellCount.replace('{count}', String(count))}</Typography.Text>
        );
      },
    },
    {
      title: t('actions'),
      key: 'actions',
      align: 'right',
      render: (_, skill) => {
        return (
          <Space size={0} wrap>
            <Button type="link" size="small" disabled={pending} onClick={() => setDetailSkillId(skill.id)}>
              {rc.view}
            </Button>
            {canWrite ? (
              <>
                <Button type="link" size="small" disabled={pending} onClick={() => setEditor({ id: skill.id })}>
                  {t('edit')}
                </Button>
                <Button
                  type="link"
                  size="small"
                  disabled={pending}
                  onClick={() =>
                    void run(async () => {
                      await client.updateSkill(skill.id, { enabled: !skill.enabled });
                    })
                  }
                >
                  {skill.enabled ? t('disable') : t('enable')}
                </Button>
                <Popconfirm
                  title={rc.deleteSkillConfirm}
                  description={rc.deleteSkillImpact}
                  okText={t('delete')}
                  cancelText={t('cancel')}
                  okButtonProps={{ danger: true }}
                  onConfirm={() => void remove(skill)}
                >
                  <Button type="link" size="small" danger disabled={pending}>
                    {t('delete')}
                  </Button>
                </Popconfirm>
              </>
            ) : null}
          </Space>
        );
      },
    },
  ];
  return (
    <div>
      <SectionHeader
        title={rc.pageSkills}
        description={rc.pageSkillsDescription}
        extra={
          <>
            {canAssign ? (
              <Button icon={<KeyOutlined />} onClick={() => setGrant({})}>
                {t('grantSkill')}
              </Button>
            ) : null}
            {canWrite ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditor({})}>
                {t('addSkill')}
              </Button>
            ) : null}
            <RefreshButton loading={loading} onRefresh={onRefresh} />
          </>
        }
      />
      <Space size={8} wrap style={{ marginBottom: 16 }}>
        <Input.Search
          aria-label={rc.searchSkillPlaceholder}
          placeholder={rc.searchSkillPlaceholder}
          allowClear
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          style={{ width: 240 }}
        />
        <Select
          aria-label={rc.allStatus}
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'all', label: rc.allStatus },
            { value: 'enabled', label: rc.statusEnabled },
            { value: 'disabled', label: rc.statusDisabled },
          ]}
          style={{ width: 140 }}
        />
      </Space>
      {rows.length === 0 ? (
        <Empty description={t('skillsEmpty')}>
          <Typography.Text type="secondary">{t('skillsEmptyHint')}</Typography.Text>
        </Empty>
      ) : (
        <Table<AdminSkill> rowKey="id" columns={columns} dataSource={[...rows]} pagination={PAGINATION} />
      )}
      {detailSkill ? (
        <SkillDetailDrawer
          client={client}
          employees={employeeState}
          skill={detailSkill}
          resources={resources}
          canWrite={canWrite}
          canAssign={canAssign}
          open
          onClose={() => setDetailSkillId(null)}
          onChanged={onChanged}
          onError={onError}
          onEdit={() => {
            setDetailSkillId(null);
            setEditor({ id: detailSkill.id });
          }}
          onGrant={() => {
            setDetailSkillId(null);
            setGrant({ skillId: detailSkill.id });
          }}
        />
      ) : null}
      {canWrite && editor ? (
        <SkillEditorModal
          client={client}
          skill={editor.id ? resources.skills.find((skill) => skill.id === editor.id) : undefined}
          open
          onOpenChange={(open) => {
            if (!open) setEditor(null);
          }}
          onChanged={onChanged}
          onError={onError}
        />
      ) : null}
      {canAssign && grant ? (
        <SkillGrantModal
          client={client}
          users={resources.users}
          roles={resources.roles}
          teams={resources.teams}
          skills={resources.skills}
          existingAssignments={resources.assignments}
          presetSkillId={grant.skillId}
          open
          onOpenChange={(open) => {
            if (!open) setGrant(null);
          }}
          onChanged={onChanged}
          onError={onError}
        />
      ) : null}
      <Modal
        open={forceSkill !== null}
        title={rc.skillForceDeleteTitle}
        footer={
          <Space>
            <Button onClick={() => setForceSkill(null)}>{t('cancel')}</Button>
            <Button
              danger
              type="primary"
              loading={pending}
              disabled={forceSkill === null}
              onClick={() => forceSkill && void forceRemove(forceSkill)}
            >
              {rc.skillForceDeleteAction}
            </Button>
          </Space>
        }
        onCancel={() => setForceSkill(null)}
      >
        <Space orientation="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text>{rc.skillForceDeleteNote}</Typography.Text>
          <Typography.Text strong>{rc.skillEmployeesSection}</Typography.Text>
          {forceSkill ? <SkillEmployees state={employeeState} skillId={forceSkill.id} variant="compact" /> : null}
          <Typography.Text strong>{rc.skillForceDeleteGrants}</Typography.Text>
          {forceRefs.length > 0 ? (
            <div style={{ maxHeight: 160, overflowY: 'auto' }}>
              <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                {forceRefs.map((assignment) => (
                  <li key={assignment.id}>
                    <SubjectCell
                      subjectType={assignment.subjectType}
                      subjectId={assignment.subjectId}
                      user={
                        assignment.subjectType === AdminSubjectType.User
                          ? resources.users.find((user) => user.id === assignment.subjectId)
                          : undefined
                      }
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <Typography.Text type="secondary">{rc.skillForceDeleteGrantsNone}</Typography.Text>
          )}
          <Typography.Text type="secondary">{rc.skillForceDeletePlatformNote}</Typography.Text>
        </Space>
      </Modal>
    </div>
  );
}
