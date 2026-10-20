import type { PlatformUser, Role } from '@aep/sdk-node';
import { KeyOutlined } from '@ant-design/icons';
import { Alert, Button, DatePicker, Empty, Modal, Popconfirm, Select, Space, Table, Typography } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { runBatch } from './batch.js';
import type {
  AdminConsoleClient,
  AdminSkill,
  AdminSkillAssignment,
  AdminSubjectType,
  AdminTeam as Team,
} from './client.js';
import { AdminNotificationKind, notify } from './notifications.js';
import { resourcesCopy as rc } from './resources-copy.js';
import {
  PAGINATION,
  RefreshButton,
  SectionHeader,
  type SectionProps,
  t,
  useMutationRunner,
} from './resources-shared.js';
import { SubjectCell, SubjectMultiPicker } from './resources-subjects.js';

export function SkillGrantModal({
  client,
  users,
  roles,
  teams,
  skills,
  existingAssignments,
  presetSkillId,
  open,
  onOpenChange,
  onChanged,
  onError,
}: {
  readonly client: AdminConsoleClient;
  readonly users: readonly PlatformUser[];
  readonly roles: readonly Role[];
  readonly teams: readonly Team[];
  readonly skills: readonly AdminSkill[];
  readonly existingAssignments: readonly AdminSkillAssignment[];
  readonly presetSkillId?: string | undefined;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
}) {
  const [skillId, setSkillId] = useState<string | null>(presetSkillId ?? null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [failedSubjects, setFailedSubjects] = useState<readonly string[]>([]);
  useEffect(() => {
    if (open) {
      setSkillId(presetSkillId ?? null);
      setSelected(new Set());
      setExpiresAt(null);
      setFailed(false);
      setFailedSubjects([]);
    }
  }, [open, presetSkillId]);
  const toggleSubject = useCallback((subjectKey: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(subjectKey)) next.delete(subjectKey);
      else next.add(subjectKey);
      return next;
    });
  }, []);
  const submit = async () => {
    if (!skillId || selected.size === 0) return;
    setPending(true);
    setFailed(false);
    setFailedSubjects([]);
    try {
      const subjectKeys = [...selected];
      const results = await runBatch(subjectKeys, (subjectKey) => {
        const separator = subjectKey.indexOf(':');
        const type = subjectKey.slice(0, separator) as AdminSubjectType;
        const id = subjectKey.slice(separator + 1);
        return client.createSkillAssignment({
          skillId,
          subject: { type, id },
          ...(expiresAt ? { expiresAt } : {}),
        });
      });
      const failures = results.filter((result) => !result.ok).map((result) => result.item);
      if (failures.length > 0) {
        setFailed(true);
        setFailedSubjects(failures);
        setSelected(new Set(failures));
        await onChanged();
        return;
      }
      onOpenChange(false);
      await onChanged();
      notify(AdminNotificationKind.Success, t('changesSaved'));
    } catch {
      onError();
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open={open}
      title={t('grantSkillTitle')}
      okText={t('grant')}
      cancelText={t('cancel')}
      confirmLoading={pending}
      okButtonProps={{ disabled: !skillId || selected.size === 0 }}
      mask={{ closable: false }}
      onOk={() => void submit()}
      onCancel={() => {
        if (!pending) onOpenChange(false);
      }}
    >
      <Typography.Paragraph type="secondary">{t('grantSkillDescription')}</Typography.Paragraph>
      {failed ? (
        <Alert
          type="error"
          showIcon
          title={t('grantFailed')}
          description={
            failedSubjects.length > 0 ? `${t('grantFailedSubjects')}: ${failedSubjects.join(', ')}` : undefined
          }
          style={{ marginBottom: 16 }}
        />
      ) : null}
      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        <div>
          <Typography.Text strong>{t('selectSkill')}</Typography.Text>
          <Select
            aria-label={t('selectSkill')}
            value={skillId}
            onChange={(value) => setSkillId(value)}
            disabled={pending || Boolean(presetSkillId)}
            placeholder={t('selectSkill')}
            style={{ width: '100%', marginTop: 8 }}
            options={skills.map((skill) => ({
              value: skill.id,
              label: skill.enabled ? skill.name : `${skill.name}（${t('disabled')}）`,
            }))}
          />
        </div>
        <div>
          <Typography.Text strong>{rc.grantExpiresLabel}</Typography.Text>
          <DatePicker
            aria-label={rc.grantExpiresLabel}
            disabled={pending}
            allowClear
            style={{ width: '100%', marginTop: 8 }}
            onChange={(value) => setExpiresAt(value ? value.endOf('day').toISOString() : null)}
          />
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
            {rc.grantExpiresHint}
          </Typography.Text>
        </div>
        <SubjectMultiPicker
          users={users}
          roles={roles}
          teams={teams}
          excluded={
            new Set(
              existingAssignments
                .filter((item) => item.skillId === skillId)
                .map((item) => `${item.subjectType}:${item.subjectId}`),
            )
          }
          selected={selected}
          onToggle={toggleSubject}
          disabled={pending}
        />
      </Space>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------
export function AssignmentsSection({
  client,
  resources,
  canWrite,
  loading,
  onRefresh,
  onChanged,
  onError,
}: SectionProps) {
  const [grantOpen, setGrantOpen] = useState(false);
  const { pending, run } = useMutationRunner(onChanged, onError);
  const skillNames = new Map(resources.skills.map((skill) => [skill.id, skill.name]));
  const userNames = new Map(resources.users.map((user) => [user.id, user]));
  return (
    <div>
      <SectionHeader
        title={rc.pageAssignments}
        description={rc.pageAssignmentsDescription}
        extra={
          <>
            {canWrite ? (
              <Button type="primary" icon={<KeyOutlined />} onClick={() => setGrantOpen(true)}>
                {t('grantSkill')}
              </Button>
            ) : null}
            <RefreshButton loading={loading} onRefresh={onRefresh} />
          </>
        }
      />
      {resources.assignments.length === 0 ? (
        <Empty description={t('assignmentsEmpty')}>
          <Space orientation="vertical" size={12}>
            <Typography.Text type="secondary">{t('assignmentsEmptyHint')}</Typography.Text>
            {canWrite ? (
              <Button type="primary" icon={<KeyOutlined />} onClick={() => setGrantOpen(true)}>
                {t('grantSkill')}
              </Button>
            ) : null}
          </Space>
        </Empty>
      ) : (
        <Table<AdminSkillAssignment>
          rowKey="id"
          pagination={PAGINATION}
          dataSource={[...resources.assignments]}
          columns={[
            {
              title: t('skill'),
              key: 'skill',
              render: (_, assignment) => skillNames.get(assignment.skillId) || assignment.skillId,
            },
            {
              title: rc.assignmentSubject,
              key: 'subject',
              render: (_, assignment) => (
                <SubjectCell
                  subjectType={assignment.subjectType}
                  subjectId={assignment.subjectId}
                  user={userNames.get(assignment.subjectId)}
                />
              ),
            },
            ...(canWrite
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
      {canWrite && grantOpen ? (
        <SkillGrantModal
          client={client}
          users={resources.users}
          roles={resources.roles}
          teams={resources.teams}
          skills={resources.skills}
          existingAssignments={resources.assignments}
          open
          onOpenChange={setGrantOpen}
          onChanged={onChanged}
          onError={onError}
        />
      ) : null}
    </div>
  );
}
