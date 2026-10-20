import { SearchOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, List, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { type Dispatch, type SetStateAction, useEffect, useMemo, useRef, useState } from 'react';

import { ADMIN_LANGUAGE, translate } from './i18n.js';
import { knowledgeErrorText } from './knowledge-error.js';
import type { ManagedKnowledgeBase, ManagedKnowledgeGrant, PortalClient } from './portal.js';
import { PortalError } from './portal.js';

const tr = (key: Parameters<typeof translate>[1]) => translate(ADMIN_LANGUAGE, key);

// 主体下拉的搜索口径：显示名和 ID 都命中（ID 仍是服务端唯一认得的键，
// 只是不再占标签位），空输入视为不过滤。
const subjectMatches = (input: string, candidate: unknown): boolean =>
  input.trim() === '' ||
  (typeof candidate === 'string' && candidate.toLowerCase().includes(input.trim().toLowerCase()));

type GrantSubject = { readonly id: string; readonly name: string };

export function updateKnowledgeGrantScope(
  id: string,
  scope: { users: number; teams: number },
  setDetail: Dispatch<SetStateAction<ManagedKnowledgeBase | null>>,
  setBases: Dispatch<SetStateAction<readonly ManagedKnowledgeBase[]>>,
) {
  setDetail((current) => (current?.id === id ? { ...current, scope } : current));
  setBases((current) => current.map((base) => (base.id === id ? { ...base, scope } : base)));
}

// The picker's candidate lists plus how much they can be trusted. `complete`
// is false when either source failed: the list is then known to be partial,
// so per-row "not in the list" flags would be false alarms and are withheld.
type GrantSubjects = {
  readonly users: readonly GrantSubject[];
  readonly teams: readonly GrantSubject[];
  readonly complete: boolean;
  readonly error: string | null;
};

const grantsKey = (baseId: string) => ['portal', 'knowledge-grants', baseId] as const;

export function KnowledgeGrants({
  portal,
  baseId,
  disabled = false,
  onOpenRetrieval,
  onManageAgents,
  onGrantsChanged,
}: {
  readonly portal: PortalClient;
  readonly baseId: string;
  readonly disabled?: boolean;
  readonly onOpenRetrieval?: () => void;
  readonly onManageAgents?: (() => void) | undefined;
  readonly onGrantsChanged?: (baseId: string, scope: { users: number; teams: number }) => void;
}) {
  const { message } = App.useApp();
  const [modal, modalContext] = Modal.useModal();
  const queryClient = useQueryClient();
  const grantsQuery = useQuery({
    queryKey: grantsKey(baseId),
    queryFn: ({ signal }) => portal.listManagedKnowledgeGrants(baseId, signal),
  });
  // 候选主体的两个来源各漏一处：通讯录（AEP 用户目录的唯一枚举出口）的团队
  // 由成员带出，没有成员的团队不会出现；部门列表只取 AEP teams 首页
  // （limit=100，不翻页）。这里取并集（通讯录里的名字优先），任一来源失败就
  // 把清单标记为不完整——不完整的清单不参与「不在候选中」的标注，免得把合法
  // 主体误报成历史脏数据。
  const subjectsQuery = useQuery({
    queryKey: ['portal', 'knowledge-grant-subjects'],
    queryFn: async (): Promise<GrantSubjects> => {
      const [contacts, departments] = await Promise.allSettled([portal.listContacts(), portal.listDepartments()]);
      const teams = new Map<string, GrantSubject>();
      if (contacts.status === 'fulfilled')
        for (const contact of contacts.value)
          for (const team of contact.teams)
            if (!teams.has(team.id)) teams.set(team.id, { id: team.id, name: team.name });
      if (departments.status === 'fulfilled')
        for (const team of departments.value)
          if (!teams.has(team.id)) teams.set(team.id, { id: team.id, name: team.name });
      const failures = [contacts, departments].filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );
      return {
        users:
          contacts.status === 'fulfilled'
            ? contacts.value.map((contact) => ({ id: contact.userId, name: contact.displayName || contact.username }))
            : [],
        teams: [...teams.values()],
        complete: failures.length === 0,
        error: failures.length
          ? failures
              .map((result) => (result.reason instanceof Error ? result.reason.message : String(result.reason)))
              .join('；')
          : null,
      };
    },
  });
  const employeesQuery = useQuery({
    queryKey: ['portal', 'knowledge-employees', baseId],
    queryFn: async ({ signal }) => {
      const items = await portal.listEmployees(signal);
      return items.filter((item) => item.knowledgeBases?.some((base) => base.id === baseId));
    },
  });
  const [grants, setGrants] = useState<readonly ManagedKnowledgeGrant[]>([]);
  const [savedGrants, setSavedGrants] = useState<readonly ManagedKnowledgeGrant[]>([]);
  const [userDrafts, setUserDrafts] = useState<string[]>([]);
  const [teamDrafts, setTeamDrafts] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveBlocked, setSaveBlocked] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const baseGeneration = useRef(0);
  const saveSequence = useRef(0);
  const savingGeneration = useRef<number | null>(null);
  const revokeDialog = useRef<{ destroy(): void } | null>(null);
  const subjects = subjectsQuery.data ?? null;
  const subjectsLoading = subjectsQuery.isFetching;
  const employees = employeesQuery.data ?? null;
  const employeeError = employeesQuery.error ? knowledgeErrorText(employeesQuery.error) : null;
  const loading = grantsQuery.isFetching;
  const loadFailure = grantsQuery.error;
  const error = saveError ?? (loadFailure ? knowledgeErrorText(loadFailure) : null);
  const blocked =
    saveBlocked ||
    (loadFailure !== null &&
      (!(loadFailure instanceof PortalError) ||
        loadFailure.status === 401 ||
        loadFailure.status === 403 ||
        loadFailure.status >= 500));
  const loadedBaseId = grantsQuery.isSuccess ? baseId : null;

  // 切换知识库：草稿、保存标记与错误都属于上一个库，全部清零；上个库的在途
  // 保存只允许静默落地，不许写回这个库的状态。
  useEffect(() => {
    baseGeneration.current += 1;
    savingGeneration.current = null;
    setGrants([]);
    setSavedGrants([]);
    setUserDrafts([]);
    setTeamDrafts([]);
    setSaving(false);
    setSaveError(null);
    setSaveBlocked(false);
    return () => {
      baseGeneration.current += 1;
      revokeDialog.current?.destroy();
    };
  }, [baseId]);

  // 服务端授权集同步进草稿；读取成功同时证明上游可达，顺手解开写锁与错误。
  useEffect(() => {
    if (!grantsQuery.data) return;
    setGrants(grantsQuery.data.grants);
    setSavedGrants(grantsQuery.data.grants);
    setSaveError(null);
    setSaveBlocked(false);
  }, [grantsQuery.data]);

  // 编辑门禁：读取/保存还没就绪、或上次写结果未知时，只允许看。
  const editLocked = disabled || blocked || loading || saving || !!error || loadedBaseId !== baseId;
  const editLockedRef = useRef(editLocked);
  editLockedRef.current = editLocked;

  const retryLoad = () => {
    setSaveError(null);
    setSaveBlocked(false);
    void grantsQuery.refetch();
  };

  // 与技能授权一致：一次可以挑多个主体再加。挑中的 id 全部并入待保存列表，
  // 已经在列表里的直接跳过，避免出现重复行；同一个 id 只会有一行。
  const addGrants = (type: ManagedKnowledgeGrant['type']) => {
    if (editLocked) return;
    const drafts = type === 'user' ? userDrafts : teamDrafts;
    if (drafts.length === 0) return;
    setGrants((current) => {
      const existing = new Set(current.map((grant) => `${grant.type}:${grant.id}`));
      const additions = drafts.filter((id) => !existing.has(`${type}:${id}`)).map((id) => ({ type, id }));
      return additions.length > 0 ? [...current, ...additions] : current;
    });
    if (type === 'user') setUserDrafts([]);
    else setTeamDrafts([]);
  };

  const grantOptions = useMemo(() => {
    const granted = new Set(grants.map((grant) => `${grant.type}:${grant.id}`));
    // 标签只写显示名：ID 是服务端唯一认得的键，但管理员挑人时看的是名字，
    // 所以 ID 不占标签位（授权表里仍有 ID 列）。名字重名时，选之前分不出是谁，
    // 就只给重名的那些补 ID 前 8 位；搜索把 value（完整 ID）也纳入匹配，想按
    // ID 找人照样能直接粘贴 ID。已在授权里的主体直接置灰，从选项层面杜绝重复添加。
    const withLabels = (list: readonly GrantSubject[], type: ManagedKnowledgeGrant['type']) => {
      const nameCounts = new Map<string, number>();
      for (const subject of list) {
        const label = subject.name ? subject.name : subject.id;
        nameCounts.set(label, (nameCounts.get(label) ?? 0) + 1);
      }
      return list.map((subject) => {
        const label = subject.name ? subject.name : subject.id;
        const ambiguous = (nameCounts.get(label) ?? 0) > 1;
        return {
          value: subject.id,
          label: ambiguous ? `${label} · ${subject.id.slice(0, 8)}` : label,
          disabled: granted.has(`${type}:${subject.id}`),
        };
      });
    };
    return {
      users: withLabels(subjects?.users ?? [], 'user'),
      teams: withLabels(subjects?.teams ?? [], 'team'),
    };
  }, [grants, subjects]);

  // 候选清单不完整（某一来源失败，或列表本身分页/过滤）时整表不标注：标出来的
  // 未必是真脏数据，服务端逐个 id 直查 AEP 才是权威判定，这里只做可读的提示。
  const unknownGrants = useMemo(() => {
    if (!subjects?.complete) return [];
    const known = new Set([
      ...subjects.users.map((user) => `user:${user.id}`),
      ...subjects.teams.map((team) => `team:${team.id}`),
    ]);
    return grants.filter((grant) => !known.has(`${grant.type}:${grant.id}`));
  }, [grants, subjects]);

  const save = async (next = grants): Promise<boolean> => {
    if (editLockedRef.current || savingGeneration.current !== null) return false;
    const base = baseId;
    const baseVersion = baseGeneration.current;
    const version = ++saveSequence.current;
    savingGeneration.current = version;
    setSaving(true);
    try {
      // 在途读取若晚于写入落地，会把缓存覆盖回写前的授权集；先取消再写。
      await queryClient.cancelQueries({ queryKey: grantsKey(base) });
      const result = await portal.replaceManagedKnowledgeGrants(
        base,
        next.map(({ type, id }) => ({ type, id })),
      );
      if (baseVersion === baseGeneration.current) {
        queryClient.setQueryData(grantsKey(base), result);
        setGrants(result.grants);
        setSavedGrants(result.grants);
        setUserDrafts([]);
        setTeamDrafts([]);
        setSaveError(null);
        setEditorOpen(false);
        onGrantsChanged?.(base, {
          users: result.grants.filter((grant) => grant.type === 'user').length,
          teams: result.grants.filter((grant) => grant.type === 'team').length,
        });
        message.success(tr('knowledgeGrantsSaved'), 3);
        return true;
      }
    } catch (cause) {
      if (baseVersion === baseGeneration.current) {
        setSaveError(knowledgeErrorText(cause));
        if (!(cause instanceof PortalError) || cause.status === 401 || cause.status === 403 || cause.status >= 500)
          setSaveBlocked(true);
        message.error(tr('knowledgeGrantsSaveFailed'), 5);
      }
      return false;
    } finally {
      if (savingGeneration.current === version) savingGeneration.current = null;
      if (baseVersion === baseGeneration.current) setSaving(false);
    }
    return false;
  };

  const pendingGrants = useMemo(() => {
    const next = new Map(grants.map((grant) => [`${grant.type}:${grant.id}`, grant]));
    for (const [type, ids] of [
      ['user', userDrafts],
      ['team', teamDrafts],
    ] as const)
      for (const id of ids) next.set(`${type}:${id}`, { type, id });
    return [...next.values()];
  }, [grants, userDrafts, teamDrafts]);

  const saveSelection = () => {
    // Empty save via this button used to toast success after wiping grants.
    // Clearing access must go through the explicit revoke confirmation.
    if (pendingGrants.length === 0) {
      message.warning(tr('knowledgeGrantsEmptySaveBlocked'));
      return false;
    }
    return save(pendingGrants);
  };

  const openEditor = () => {
    setGrants(savedGrants);
    setUserDrafts([]);
    setTeamDrafts([]);
    setEditorOpen(true);
  };

  const revokeAll = () => {
    const version = baseGeneration.current;
    // Calling .then() flips useModal's silent flag so a failed onOk rejection is not
    // rethrown into the browser console (pageerror "undefined" broke e2e).
    const instance = modal.confirm({
      title: tr('knowledgeGrantsRevokeConfirm'),
      okText: tr('knowledgeGrantsRevokeAll'),
      cancelText: tr('knowledgeCancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        // Reject to keep the confirm open; save() already surfaces message.error.
        if (version !== baseGeneration.current || !(await save([]))) {
          return Promise.reject(new Error(tr('knowledgeGrantsSaveFailed')));
        }
      },
    });
    revokeDialog.current = instance;
    void instance.then(
      () => undefined,
      () => undefined,
    );
  };

  const columns: ColumnsType<ManagedKnowledgeGrant> = [
    {
      title: tr('knowledgeGrantType'),
      dataIndex: 'type',
      render: (type: ManagedKnowledgeGrant['type']) =>
        type === 'user' ? tr('knowledgeGrantUser') : tr('knowledgeGrantTeam'),
    },
    {
      title: tr('knowledgeGrantId'),
      dataIndex: 'id',
      render: (id: string, grant: ManagedKnowledgeGrant) => (
        <>
          {id}
          {unknownGrants.includes(grant) && (
            <Tag color="warning" style={{ marginInlineStart: 8 }}>
              {tr('knowledgeGrantUnknownSubject')}
            </Tag>
          )}
        </>
      ),
    },
    { title: tr('knowledgeGrantBy'), dataIndex: 'granted_by', render: (value?: string) => value || '—' },
    {
      title: tr('knowledgeActions'),
      render: (_, grant) => (
        <Button
          size="small"
          danger
          disabled={editLocked}
          onClick={() => setGrants((current) => current.filter((item) => item !== grant))}
        >
          {tr('knowledgeGrantRemove')}
        </Button>
      ),
    },
  ];

  const subjectName = (grant: ManagedKnowledgeGrant): string => {
    const pool = grant.type === 'user' ? subjects?.users : subjects?.teams;
    return pool?.find((item) => item.id === grant.id)?.name ?? grant.id;
  };

  return (
    <section aria-label={tr('knowledgeGrants')}>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <Typography.Title level={5} style={{ marginBottom: 4 }}>
                {tr('knowledgeGrantUser')}
              </Typography.Title>
              <Typography.Text type="secondary">{tr('knowledgeGrantsHint')}</Typography.Text>
            </div>
            <Button disabled={!!error || saving} onClick={openEditor}>
              {tr('knowledgeGrantEdit')}
            </Button>
          </div>
          {error && !editorOpen ? (
            <Alert
              showIcon
              type="error"
              title={tr('knowledgeGrantsReadFailed')}
              description={error}
              action={
                <Button size="small" onClick={retryLoad}>
                  {tr('knowledgeRetryRead')}
                </Button>
              }
            />
          ) : (
            <List
              loading={loading}
              dataSource={[...savedGrants]}
              locale={{ emptyText: tr('knowledgeGrantsEmpty') }}
              renderItem={(grant) => {
                const name = subjectName(grant);
                return (
                  <List.Item>
                    <List.Item.Meta title={name} description={name === grant.id ? undefined : grant.id} />
                    <Tag color="blue">{tr('knowledgeGrantReadable')}</Tag>
                  </List.Item>
                );
              }}
            />
          )}
          {subjects && !subjects.complete && (
            <Alert
              showIcon
              type="warning"
              title={tr('knowledgeGrantSubjectsIncomplete')}
              description={subjects.error}
              style={{ marginTop: 12 }}
              action={
                <Button size="small" onClick={() => void subjectsQuery.refetch()}>
                  {tr('knowledgeRetryRead')}
                </Button>
              }
            />
          )}
        </div>
        <div>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <Typography.Title level={5} style={{ marginBottom: 4 }}>
                {tr('knowledgeAgentColumn')}
              </Typography.Title>
              <Typography.Text type="secondary">{tr('knowledgeAgentColumnHint')}</Typography.Text>
            </div>
            <Button disabled={!onManageAgents} onClick={onManageAgents}>
              {tr('knowledgeAgentManage')}
            </Button>
          </div>
          <Typography.Paragraph type="secondary">{tr('knowledgeAgentManageHint')}</Typography.Paragraph>
          {employeeError ? (
            <Alert
              type="error"
              showIcon
              title={employeeError}
              action={<Button onClick={() => void employeesQuery.refetch()}>{tr('knowledgeRetryRead')}</Button>}
            />
          ) : (
            <List
              loading={employees === null}
              dataSource={[...(employees ?? [])]}
              locale={{ emptyText: employees === null ? tr('statusLoading') : tr('knowledgeAgentEmpty') }}
              renderItem={(employee) => (
                <List.Item>
                  <List.Item.Meta title={employee.displayName || employee.name} description={employee.name} />
                </List.Item>
              )}
            />
          )}
        </div>
      </div>
      {onOpenRetrieval ? (
        <Button type="link" icon={<SearchOutlined />} onClick={onOpenRetrieval} style={{ paddingInline: 0 }}>
          {tr('knowledgeVerifyAgent')}
        </Button>
      ) : null}
      <Modal
        title={tr('knowledgeGrantEdit')}
        open={editorOpen}
        footer={null}
        onCancel={() => setEditorOpen(false)}
        closable={!saving}
        keyboard={!saving}
        mask={{ closable: !saving }}
        width={720}
      >
        <Space orientation="vertical" style={{ width: '100%' }}>
          {error && (
            <Alert
              showIcon
              type="error"
              title={tr('knowledgeGrantsReadFailed')}
              description={error}
              action={
                <Button size="small" onClick={retryLoad}>
                  {tr('knowledgeRetryRead')}
                </Button>
              }
            />
          )}
          <Alert
            showIcon
            type="warning"
            title={tr('knowledgeGrantsReplaceHint')}
            action={
              <Button size="small" danger disabled={editLocked || !savedGrants.length} onClick={revokeAll}>
                {tr('knowledgeGrantsRevokeAll')}
              </Button>
            }
          />
          <Space wrap>
            <Select
              aria-label={tr('knowledgeGrantUser')}
              mode="multiple"
              showSearch={{
                filterOption: (input, option) =>
                  subjectMatches(input, option?.label) || subjectMatches(input, option?.value),
              }}
              allowClear
              loading={subjectsLoading}
              value={userDrafts}
              onChange={setUserDrafts}
              options={grantOptions.users}
              placeholder={tr('knowledgeGrantUserSelect')}
              notFoundContent={tr('knowledgeGrantNoUserMatch')}
              disabled={editLocked || subjectsLoading}
              style={{ minWidth: 240 }}
            />
            <Button disabled={editLocked || userDrafts.length === 0} onClick={() => addGrants('user')}>
              {tr('knowledgeGrantAddUser')}
            </Button>
            <Select
              aria-label={tr('knowledgeGrantTeam')}
              mode="multiple"
              showSearch={{
                filterOption: (input, option) =>
                  subjectMatches(input, option?.label) || subjectMatches(input, option?.value),
              }}
              allowClear
              loading={subjectsLoading}
              value={teamDrafts}
              onChange={setTeamDrafts}
              options={grantOptions.teams}
              placeholder={tr('knowledgeGrantTeamSelect')}
              notFoundContent={tr('knowledgeGrantNoTeamMatch')}
              disabled={editLocked || subjectsLoading}
              style={{ minWidth: 240 }}
            />
            <Button disabled={editLocked || teamDrafts.length === 0} onClick={() => addGrants('team')}>
              {tr('knowledgeGrantAddTeam')}
            </Button>
          </Space>
          {unknownGrants.length > 0 && <Alert showIcon type="warning" title={tr('knowledgeGrantUnknownHint')} />}
          <Table<ManagedKnowledgeGrant>
            rowKey={(grant) => `${grant.type}:${grant.id}`}
            size="small"
            loading={loading}
            columns={columns}
            dataSource={[...grants]}
            pagination={false}
            locale={{ emptyText: tr('knowledgeGrantsEmpty') }}
            scroll={{ x: 480 }}
          />
          <Typography.Text type="secondary">{tr('knowledgeGrantsDraftHint')}</Typography.Text>
          <Button
            type="primary"
            loading={saving}
            disabled={editLocked || pendingGrants.length === 0}
            onClick={() => void saveSelection()}
          >
            {tr('knowledgeGrantsSave')}
          </Button>
        </Space>
      </Modal>
      {modalContext}
    </section>
  );
}
