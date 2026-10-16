import { SearchOutlined } from '@ant-design/icons';
import { Alert, App, Button, List, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ADMIN_LANGUAGE, translate } from './i18n.js';
import { knowledgeErrorText } from './knowledge-error.js';
import type { ManagedKnowledgeGrant, PortalClient, PortalEmployee } from './portal.js';
import { PortalError } from './portal.js';

const tr = (key: Parameters<typeof translate>[1]) => translate(ADMIN_LANGUAGE, key);

// 主体下拉的搜索口径：显示名和 ID 都命中（ID 仍是服务端唯一认得的键，
// 只是不再占标签位），空输入视为不过滤。
const subjectMatches = (input: string, candidate: unknown): boolean =>
  input.trim() === '' ||
  (typeof candidate === 'string' && candidate.toLowerCase().includes(input.trim().toLowerCase()));

type GrantSubject = { readonly id: string; readonly name: string };

// The picker's candidate lists plus how much they can be trusted. `complete`
// is false when either source failed: the list is then known to be partial,
// so per-row "not in the list" flags would be false alarms and are withheld.
type GrantSubjects = {
  readonly users: readonly GrantSubject[];
  readonly teams: readonly GrantSubject[];
  readonly complete: boolean;
  readonly error: string | null;
};

export function KnowledgeGrants({
  portal,
  baseId,
  disabled = false,
  onOpenRetrieval,
  onManageAgents,
}: {
  readonly portal: PortalClient;
  readonly baseId: string;
  readonly disabled?: boolean;
  readonly onOpenRetrieval?: () => void;
  readonly onManageAgents?: (() => void) | undefined;
}) {
  const { message } = App.useApp();
  const [modal, modalContext] = Modal.useModal();
  const [grants, setGrants] = useState<readonly ManagedKnowledgeGrant[]>([]);
  const [savedGrants, setSavedGrants] = useState<readonly ManagedKnowledgeGrant[]>([]);
  const [subjects, setSubjects] = useState<GrantSubjects | null>(null);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [userDrafts, setUserDrafts] = useState<string[]>([]);
  const [teamDrafts, setTeamDrafts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [loadedBaseId, setLoadedBaseId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [employees, setEmployees] = useState<readonly PortalEmployee[] | null>(null);
  const [employeeError, setEmployeeError] = useState<string | null>(null);
  const [employeeRevision, refreshEmployees] = useState(0);
  const baseGeneration = useRef(0);
  const requestGeneration = useRef(0);
  const subjectsGeneration = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    setEmployees(null);
    setEmployeeError(null);
    void portal
      .listEmployees(controller.signal)
      .then((items) => {
        if (!controller.signal.aborted)
          setEmployees(items.filter((item) => item.knowledgeBases?.some((base) => base.id === baseId)));
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setEmployeeError(knowledgeErrorText(cause));
      });
    return () => controller.abort();
  }, [portal, baseId, employeeRevision]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const base = baseId;
      const baseVersion = baseGeneration.current;
      const requestVersion = ++requestGeneration.current;
      setLoading(true);
      setError(null);
      try {
        const result = await portal.listManagedKnowledgeGrants(base, signal);
        if (
          !signal?.aborted &&
          baseVersion === baseGeneration.current &&
          requestVersion === requestGeneration.current
        ) {
          setGrants(result.grants);
          setSavedGrants(result.grants);
          setBlocked(false);
          setLoadedBaseId(base);
        }
      } catch (cause) {
        if (signal?.aborted || baseVersion !== baseGeneration.current || requestVersion !== requestGeneration.current)
          return;
        setError(knowledgeErrorText(cause));
        setLoadedBaseId(null);
        if (!(cause instanceof PortalError) || cause.status === 401 || cause.status === 403 || cause.status >= 500)
          setBlocked(true);
      } finally {
        if (!signal?.aborted && baseVersion === baseGeneration.current && requestVersion === requestGeneration.current)
          setLoading(false);
      }
    },
    [baseId, portal],
  );

  // 候选主体的两个来源各漏一处：通讯录（AEP 用户目录的唯一枚举出口）的团队
  // 由成员带出，没有成员的团队不会出现；部门列表只取 AEP teams 首页
  // （limit=100，不翻页）。这里取并集（通讯录里的名字优先），任一来源失败就
  // 把清单标记为不完整——不完整的清单不参与「不在候选中」的标注，免得把合法
  // 主体误报成历史脏数据。
  const loadSubjects = useCallback(async () => {
    const version = ++subjectsGeneration.current;
    setSubjectsLoading(true);
    const [contacts, departments] = await Promise.allSettled([portal.listContacts(), portal.listDepartments()]);
    if (version !== subjectsGeneration.current) return;
    const teams = new Map<string, GrantSubject>();
    if (contacts.status === 'fulfilled')
      for (const contact of contacts.value)
        for (const team of contact.teams) if (!teams.has(team.id)) teams.set(team.id, { id: team.id, name: team.name });
    if (departments.status === 'fulfilled')
      for (const team of departments.value)
        if (!teams.has(team.id)) teams.set(team.id, { id: team.id, name: team.name });
    const failures = [contacts, departments].filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    setSubjects({
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
    });
    setSubjectsLoading(false);
  }, [portal]);

  useEffect(() => {
    const controller = new AbortController();
    baseGeneration.current += 1;
    requestGeneration.current += 1;
    setLoadedBaseId(null);
    setLoading(true);
    setSaving(false);
    setGrants([]);
    setSavedGrants([]);
    setUserDrafts([]);
    setTeamDrafts([]);
    setError(null);
    setBlocked(false);
    void load(controller.signal);
    void loadSubjects();
    return () => {
      controller.abort();
      baseGeneration.current += 1;
      requestGeneration.current += 1;
      subjectsGeneration.current += 1;
    };
  }, [load, loadSubjects]);

  // 编辑门禁：读取/保存还没就绪、或上次写结果未知时，只允许看。
  const editLocked = disabled || blocked || loading || saving || !!error || loadedBaseId !== baseId;

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

  const save = async (next = grants) => {
    if (editLocked) return;
    const base = baseId;
    const baseVersion = baseGeneration.current;
    const requestVersion = ++requestGeneration.current;
    setSaving(true);
    try {
      const result = await portal.replaceManagedKnowledgeGrants(
        base,
        next.map(({ type, id }) => ({ type, id })),
      );
      if (baseVersion === baseGeneration.current && requestVersion === requestGeneration.current) {
        setGrants(result.grants);
        setSavedGrants(result.grants);
        setError(null);
        message.success(tr('knowledgeGrantsSaved'));
      }
    } catch (cause) {
      if (baseVersion === baseGeneration.current && requestVersion === requestGeneration.current) {
        setError(knowledgeErrorText(cause));
        if (!(cause instanceof PortalError) || cause.status === 401 || cause.status === 403 || cause.status >= 500)
          setBlocked(true);
        message.error(tr('knowledgeGrantsSaveFailed'));
      }
    } finally {
      if (baseVersion === baseGeneration.current && requestVersion === requestGeneration.current) setSaving(false);
    }
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
            <Button disabled={!!error} onClick={() => setEditorOpen(true)}>
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
                <Button size="small" onClick={() => void load()}>
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
                <Button size="small" onClick={() => void loadSubjects()}>
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
              action={
                <Button onClick={() => refreshEmployees((value) => value + 1)}>{tr('knowledgeRetryRead')}</Button>
              }
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
                <Button size="small" onClick={() => void load()}>
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
              <Button
                size="small"
                danger
                disabled={editLocked || !grants.length}
                onClick={() =>
                  modal.confirm({
                    title: tr('knowledgeGrantsRevokeConfirm'),
                    okText: tr('knowledgeGrantsRevokeAll'),
                    cancelText: tr('knowledgeCancel'),
                    okButtonProps: { danger: true },
                    onOk: () => save([]),
                  })
                }
              >
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
          <Button type="primary" loading={saving} disabled={editLocked} onClick={() => void save()}>
            {tr('knowledgeGrantsSave')}
          </Button>
        </Space>
      </Modal>
      {modalContext}
    </section>
  );
}
